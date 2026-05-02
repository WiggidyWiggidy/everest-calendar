#!/usr/bin/env node
// ingest-folder-watch.mjs
// Watches ~/Desktop/KRYO_ASSETS_INBOX/ for new image/video drops.
// On each new file:
//   1. Upload to Supabase Storage `kryo-assets/manual/`
//   2. Insert media_assets row at status=pending_qc
//   3. Auto-tag via Kimi vision (scene_type, angle, ai_description, ai_tags)
//   4. Move file to .processed/ (so re-runs are idempotent)
//
// Usage: node scripts/system/ingest-folder-watch.mjs
//        Or as a LaunchAgent / nohup background process.

import { readdir, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { kimiCall } from './kimi-call.mjs';
import { homedir } from 'node:os';

const INBOX_DIR = process.env.KRYO_INBOX_DIR || join(homedir(), 'Desktop', 'KRYO_ASSETS_INBOX');
const PROCESSED_DIR = join(INBOX_DIR, '.processed');
const POLL_INTERVAL_MS = parseInt(process.env.INBOX_POLL_MS || '8000', 10);
const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const BUCKET = 'kryo-assets';

const log = (m) => process.stderr.write(`[inbox-watch] ${new Date().toISOString().slice(11,19)} ${m}\n`);

if (!process.env.EVEREST_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.EVEREST_SUPABASE_SERVICE_KEY) {
  console.error('FATAL: EVEREST_SUPABASE_URL + service key required');
  process.exit(1);
}

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

await mkdir(INBOX_DIR, { recursive: true });
await mkdir(PROCESSED_DIR, { recursive: true });
log(`Watching ${INBOX_DIR}`);

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);

async function autoTagViaKimi(buf, mime) {
  // Kimi K2.6 vision auto-tag. Anthropic-compat shape with image content block.
  // If no Kimi creds, returns empty tags.
  if (!process.env.KIMI_OAUTH_TOKEN && !process.env.MOONSHOT_API_KEY) {
    return { scene_type: null, angle: null, ai_description: null, ai_tags: [] };
  }
  try {
    const b64 = buf.toString('base64');
    const userMsg = [
      { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
      { type: 'text', text:
        'You are tagging a KRYO V4 marketing asset for the Everest Labs library. ' +
        'KRYO is a 1°C cold plunge that fits in a Dubai apartment shower. ' +
        'Output ONLY a JSON object with these keys, no prose:\n' +
        '{\n' +
        '  "scene_type": "hero" | "lifestyle" | "diagram" | "founder" | "comparison" | "social_proof" | "press" | "b_roll_video" | null,\n' +
        '  "angle": "morning_energy" | "athlete_recovery" | "luxury_upgrade" | "value_anchor" | "science_authority" | null,\n' +
        '  "ai_description": "<one-sentence alt text>",\n' +
        '  "ai_tags": ["<tag1>", "<tag2>", "..."]\n' +
        '}\n' +
        'Pick the closest scene_type. Use null for angle if the image is angle-agnostic. Tags should be 3-6 short terms (e.g. "matte black", "cinematic", "athlete", "indoor").' },
    ];
    // kimiCall expects user as string — pass JSON-stringified content array, then have it pass through.
    // If the underlying API rejects this shape, the function will throw and we degrade gracefully.
    const { text } = await kimiCall({
      system: 'You are a vision tagger. Output strict JSON only.',
      user: JSON.stringify(userMsg),
      maxTokens: 400,
      temperature: 0.2,
    });
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    log(`vision tag failed (degraded): ${e.message.slice(0, 100)}`);
    return { scene_type: null, angle: null, ai_description: null, ai_tags: [] };
  }
}

async function ingestFile(filePath) {
  const fname = basename(filePath);
  const ext = extname(fname).toLowerCase();
  if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) {
    log(`skip (unsupported ext): ${fname}`);
    return;
  }
  const isVideo = VIDEO_EXT.has(ext);
  const mime = isVideo ? `video/${ext.slice(1) === 'mov' ? 'quicktime' : ext.slice(1)}` : `image/${ext.slice(1) === 'jpg' ? 'jpeg' : ext.slice(1)}`;

  let buf;
  try { buf = await readFile(filePath); }
  catch (e) { log(`read fail ${fname}: ${e.message}`); return; }

  const ts = Date.now();
  const safeName = fname.replace(/[^a-zA-Z0-9._-]/g, '-');
  const storagePath = `manual/${ts}-${safeName}`;

  log(`uploading ${fname} (${(buf.length/1024).toFixed(0)} KB) → ${storagePath}`);
  const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, buf, { contentType: mime, upsert: false });
  if (upErr) { log(`upload FAIL: ${upErr.message}`); return; }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);

  // Auto-tag (skip for videos for now — vision typically works on stills)
  const tags = isVideo ? { scene_type: 'b_roll_video', angle: null, ai_description: null, ai_tags: [] } : await autoTagViaKimi(buf, mime);

  const { data: row, error: dbErr } = await sb.from('media_assets').insert({
    user_id: TOM_USER_ID,
    storage_path: storagePath,
    public_url: pub.publicUrl,
    filename: fname,
    file_size: buf.length,
    mime_type: mime,
    status: 'pending_qc',
    source: 'manual',
    scene_type: tags.scene_type,
    angle: tags.angle,
    ai_description: tags.ai_description,
    ai_tags: tags.ai_tags,
  }).select('id').single();
  if (dbErr) { log(`DB insert FAIL: ${dbErr.message}`); return; }

  log(`✓ ingested ${fname} → ${row.id} (scene=${tags.scene_type || '?'} angle=${tags.angle || '?'})`);

  try { await rename(filePath, join(PROCESSED_DIR, `${ts}-${fname}`)); }
  catch (e) { log(`move fail (non-fatal): ${e.message}`); }
}

async function tickOnce() {
  let entries;
  try { entries = await readdir(INBOX_DIR); }
  catch { return; }
  const files = entries.filter((n) => !n.startsWith('.') && !n.startsWith('_'));
  if (files.length === 0) return;
  for (const f of files) {
    const p = join(INBOX_DIR, f);
    try {
      const s = await stat(p);
      if (s.isFile()) await ingestFile(p);
    } catch (e) { log(`stat ${f}: ${e.message}`); }
  }
}

// Two modes: --once (single sweep, exit) or persistent watch loop (default).
if (process.argv.includes('--once')) {
  await tickOnce();
  log('one-shot complete');
} else {
  while (true) {
    await tickOnce();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
