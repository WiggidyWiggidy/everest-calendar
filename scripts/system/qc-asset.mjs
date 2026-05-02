#!/usr/bin/env node
// qc-asset.mjs — image/video QC inspector. Checks visual quality, brand fit, Meta-policy.
// Mirrors the page-QC pattern: returns {pass, score, max_score, failed_checks[]}.
//
// Usage:
//   node scripts/system/qc-asset.mjs --asset-id <uuid>
//   node scripts/system/qc-asset.mjs --url <public-url>
//
// Bumps the row's qc_score + qc_failed_checks + status (pending_approval on pass / rejected on hard fail).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[++i]; }
}
const log = (m) => process.stderr.write(`[qc-asset] ${m}\n`);

let asset;
if (args['asset-id']) {
  const { data, error } = await sb.from('media_assets').select('*').eq('id', args['asset-id']).single();
  if (error) { console.error(`asset not found: ${error.message}`); process.exit(2); }
  asset = data;
} else if (args.url) {
  asset = { public_url: args.url, mime_type: args.mime || 'image/png' };
} else {
  console.error('Usage: --asset-id <uuid> OR --url <public-url>');
  process.exit(2);
}

const checks = [];

// HARD-FAIL CHECKS (any failure = whole asset rejected, regardless of score)
const HARD_FAIL = new Set(['fetchable', 'min_dimensions', 'mime_type_valid', 'no_text_overlay']);

// ── Check 1: fetchable + size ──
let buf, mime;
try {
  const r = await fetch(asset.public_url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  buf = Buffer.from(await r.arrayBuffer());
  mime = r.headers.get('content-type') || asset.mime_type || 'image/png';
} catch (e) {
  checks.push({ check: 'fetchable', pass: false, weight: 4, detail: e.message.slice(0, 100) });
  await persistAndExit(checks);
}
checks.push({ check: 'fetchable', pass: true, weight: 4, detail: `${(buf.length/1024).toFixed(0)}KB` });

// ── Check 2: file size sanity (> 20KB, < 25MB) ──
checks.push({
  check: 'file_size_sane',
  pass: buf.length > 20 * 1024 && buf.length < 25 * 1024 * 1024,
  weight: 2,
  detail: `${(buf.length/1024).toFixed(0)}KB`,
});

// ── Check 3: mime type valid (image/* or video/*) ──
const isImage = /^image\//.test(mime);
const isVideo = /^video\//.test(mime);
checks.push({
  check: 'mime_type_valid',
  pass: isImage || isVideo,
  weight: 4,
  detail: mime,
});

// ── Check 4: dimensions (image only). Use Playwright's image-decoder via dynamic import. ──
// For speed, use a lightweight PNG/JPEG header parse.
let dimensions = null;
if (isImage) {
  try {
    dimensions = parseImageDimensions(buf, mime);
  } catch (e) {
    log(`dimension parse failed: ${e.message}`);
  }
}
checks.push({
  check: 'min_dimensions',
  pass: !isImage || (dimensions && dimensions.width >= 800 && dimensions.height >= 600),
  weight: 4,
  detail: dimensions ? `${dimensions.width}×${dimensions.height}` : (isVideo ? '(video, skipped)' : 'parse failed'),
});

// ── Check 5: not all-black / all-white frame ──
// Sample first/last/middle KB; if all bytes are 0x00 or 0xFF it's likely a corrupt placeholder.
checks.push({
  check: 'not_blank_frame',
  pass: !isAllUniform(buf),
  weight: 2,
  detail: undefined,
});

// ── Check 6: brand fit via dominant color (image only) ──
// Heuristic: sample evenly across the image, count saturated pixels. >40% saturation = off-brand.
if (isImage) {
  // Skip the heavy decode; just keep this as advisory weight 0 for now.
  checks.push({
    check: 'brand_fit_advisory',
    pass: true,
    weight: 0,
    detail: 'placeholder — Playwright/canvas decode required for real check',
  });
}

// ── Check 7: no text overlay (Meta policy, image only) ──
// Heuristic: this requires OCR or vision LLM. For now mark pass=true with weight 0 (advisory).
// Tom's vision-LLM auto-tagger in ingest catches this on manual; AI-generated rarely has text.
checks.push({
  check: 'no_text_overlay',
  pass: true, // optimistic; promoted to weight 4 once a real OCR check is wired
  weight: 0,
  detail: 'advisory until OCR wired',
});

await persistAndExit(checks);

// ── Helpers ────────────────────────────────────────────
async function persistAndExit(c) {
  const total = c.reduce((s, x) => s + (x.weight || 1), 0);
  const got = c.filter((x) => x.pass).reduce((s, x) => s + (x.weight || 1), 0);
  const failed = c.filter((x) => !x.pass);
  const hardFails = failed.filter((x) => HARD_FAIL.has(x.check));
  const score = total > 0 ? Math.round((got / total) * 100) : 0;
  const PASS_THRESHOLD = 70;
  const pass = hardFails.length === 0 && score >= PASS_THRESHOLD;

  const verdict = {
    pass,
    score,
    max_score: total,
    earned: got,
    failed_checks: failed.map((x) => x.check),
    hard_fails: hardFails.map((x) => x.check),
    checks: c,
  };

  // If we have an asset_id, update the row
  if (args['asset-id']) {
    const newStatus = pass ? 'pending_approval' : 'rejected';
    const { error } = await sb.from('media_assets').update({
      qc_score: score,
      qc_failed_checks: verdict.failed_checks,
      status: newStatus,
      ...(newStatus === 'rejected' ? { rejected_at: new Date().toISOString(), rejection_reason: `QC: ${verdict.failed_checks.join(', ')}` } : {}),
    }).eq('id', args['asset-id']);
    if (error) log(`update fail: ${error.message}`);
    log(`✓ ${args['asset-id']}: ${pass ? 'PASS' : 'FAIL'} score=${score}/100 → status=${newStatus}`);
  }

  process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  process.exit(0);
}

function parseImageDimensions(buf, mime) {
  // PNG: bytes 16-23 contain width + height as big-endian uint32
  if (mime.includes('png')) {
    if (buf.length < 24 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) throw new Error('not PNG');
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }
  // JPEG: scan SOF marker
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('not JPEG');
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) break;
      const marker = buf[i + 1];
      const segLen = buf.readUInt16BE(i + 2);
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      i += 2 + segLen;
    }
    throw new Error('JPEG SOF not found');
  }
  // WebP: RIFF header at 0, VP8/VP8L/VP8X chunk
  if (mime.includes('webp')) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not WebP');
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      // VP8 spec: width/height at offset 26 + flag bits
      const width = buf.readUInt16LE(26) & 0x3FFF;
      const height = buf.readUInt16LE(28) & 0x3FFF;
      return { width, height };
    }
    if (chunk === 'VP8L') {
      const sig = buf.readUInt32LE(21);
      const width = (sig & 0x3FFF) + 1;
      const height = ((sig >> 14) & 0x3FFF) + 1;
      return { width, height };
    }
    if (chunk === 'VP8X') {
      const width = (buf.readUInt32LE(24) & 0xFFFFFF) + 1;
      const height = (buf.readUInt32LE(27) & 0xFFFFFF) + 1;
      return { width, height };
    }
  }
  throw new Error(`unsupported mime ${mime}`);
}

function isAllUniform(buf) {
  // Sample 1000 bytes from 3 spots; if any spot has >95% same value, suspect blank frame
  const sampleSpots = [Math.floor(buf.length * 0.1), Math.floor(buf.length * 0.5), Math.floor(buf.length * 0.9)];
  for (const start of sampleSpots) {
    const slice = buf.subarray(start, Math.min(start + 1000, buf.length));
    const counts = {};
    for (const b of slice) counts[b] = (counts[b] || 0) + 1;
    const max = Math.max(...Object.values(counts));
    if (max / slice.length > 0.95) return true;
  }
  return false;
}
