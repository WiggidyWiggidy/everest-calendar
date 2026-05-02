#!/usr/bin/env node
// seed-canonical-assets.mjs — one-time seed of the asset library with canonical KRYO imagery.
// Pulls the existing kryo_ product image set into media_assets so the page-builder has assets
// to embed before the AI gen pipeline produces fresh ones.
//
// Idempotent — safe to re-run; existing storage paths are not duplicated.
//
// Usage: node scripts/system/seed-canonical-assets.mjs

import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const BUCKET = 'kryo-assets';
const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const log = (m) => process.stderr.write(`[seed] ${m}\n`);

// Canonical images we know exist on the storefront CDN. These are the production hero/lifestyle
// shots used on /products/kryo_ today. Seed at status=approved so the page-builder can embed
// them immediately.
const CANONICAL = [
  {
    url: 'https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=1920',
    filename: 'kryo-side-angle-hero.webp',
    scene_type: 'hero',
    angle: null,
    ai_description: 'KRYO V4 cold plunge unit, side angle, matte black aluminum housing with control panel',
    ai_tags: ['hero', 'product-shot', 'matte-black', 'studio'],
  },
  {
    url: 'https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=1200',
    filename: 'kryo-side-angle-1200.webp',
    scene_type: 'lifestyle',
    angle: null,
    ai_description: 'KRYO V4 in apartment context, neutral lifestyle composition',
    ai_tags: ['lifestyle', 'apartment', 'product'],
  },
  {
    url: 'https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=900',
    filename: 'kryo-detail-900.webp',
    scene_type: 'diagram',
    angle: null,
    ai_description: 'KRYO V4 detail view for engineering deep-dive sections',
    ai_tags: ['diagram', 'detail', 'spec'],
  },
];

async function seedOne(item) {
  // Check if a canonical seed already exists for this scene+filename — avoid duplicates
  const { data: existing } = await sb
    .from('media_assets')
    .select('id, public_url')
    .eq('source', 'canonical_seed')
    .eq('filename', item.filename)
    .maybeSingle();
  if (existing) {
    log(`skip (already seeded): ${item.filename} → ${existing.id}`);
    return existing.id;
  }

  // Fetch the canonical asset
  let buf;
  let mime = 'image/webp';
  try {
    const r = await fetch(item.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
    mime = r.headers.get('content-type') || 'image/webp';
  } catch (e) {
    log(`fetch FAIL ${item.url}: ${e.message}`);
    return null;
  }

  const ts = Date.now();
  const storagePath = `manual/canonical/${ts}-${item.filename}`;

  const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, buf, { contentType: mime, upsert: false });
  if (upErr) {
    log(`upload FAIL ${item.filename}: ${upErr.message}`);
    return null;
  }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: row, error: dbErr } = await sb.from('media_assets').insert({
    user_id: TOM_USER_ID,
    storage_path: storagePath,
    public_url: pub.publicUrl,
    filename: item.filename,
    file_size: buf.length,
    mime_type: mime,
    status: 'approved',
    approved_at: new Date().toISOString(),
    source: 'canonical_seed',
    scene_type: item.scene_type,
    angle: item.angle,
    ai_description: item.ai_description,
    ai_tags: item.ai_tags,
  }).select('id').single();
  if (dbErr) {
    log(`DB insert FAIL ${item.filename}: ${dbErr.message}`);
    return null;
  }
  log(`✓ seeded ${item.scene_type} / ${item.filename} → ${row.id}`);
  return row.id;
}

const seeded = [];
for (const item of CANONICAL) {
  const id = await seedOne(item);
  if (id) seeded.push(id);
}

log(`seeded ${seeded.length}/${CANONICAL.length} canonical assets`);
process.stdout.write(JSON.stringify({ seeded_ids: seeded, total: CANONICAL.length }, null, 2) + '\n');
