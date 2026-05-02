#!/usr/bin/env node
// auto-export-to-ad-creatives.mjs
// When an asset is approved AND its scene_type is 'hero' or 'lifestyle',
// optionally insert an ad_creatives row with that asset as composite_image_url.
// Gives Tom a head-start on Meta ad creation — variants are ready to promote when billing settled.
//
// Trigger: called from /api/marketing/assets/[id]/approve when ?auto_ad=true,
// OR run as a periodic sweep that catches any approved hero/lifestyle assets without an ad_creative.
//
// Usage:
//   node scripts/system/auto-export-to-ad-creatives.mjs --asset-id <uuid>
//   node scripts/system/auto-export-to-ad-creatives.mjs --sweep   (find approved-but-not-exported)

import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++; }
    else args[a.slice(2)] = 'true';
  }
}

const log = (m) => process.stderr.write(`[auto-ad] ${m}\n`);
const ELIGIBLE_SCENES = new Set(['hero', 'lifestyle']);
const HEADLINE_BY_ANGLE = {
  morning_energy: 'A 1°C reset before your first call.',
  athlete_recovery: 'Cold reset. After every session.',
  luxury_upgrade: 'A 1°C cold plunge. Inside your shower.',
  value_anchor: 'AED 3,990 once. Or AED 600 every month, forever.',
  science_authority: '1°C in 30 seconds. Søberg-validated.',
  default: 'A 1°C cold plunge. Inside your shower.',
};
const BODY_BY_ANGLE = {
  morning_energy: 'Wake up sharper. 30 seconds at 1°C, before coffee. Apartment-safe.',
  athlete_recovery: 'Replace your gym ice bath subscription. Recover at home in 30 seconds.',
  luxury_upgrade: 'Engineered for the high-rise. Three-minute install. Owned, not rented.',
  value_anchor: 'Pay back in 7 months. Own the cold for 10 years.',
  science_authority: 'Søberg threshold protocol. 1°C precision. ±0.5°C.',
  default: 'A 1°C cold plunge that fits your apartment shower. AED 3,990 starting.',
};

async function exportOne(assetId) {
  const { data: asset, error: aErr } = await sb.from('media_assets').select('*').eq('id', assetId).single();
  if (aErr || !asset) { log(`asset ${assetId} not found`); return null; }
  if (asset.status !== 'approved') { log(`asset ${assetId} not approved (status=${asset.status})`); return null; }
  if (!ELIGIBLE_SCENES.has(asset.scene_type)) { log(`asset ${assetId} scene ${asset.scene_type} not eligible`); return null; }

  // Check if an ad_creative already references this image (prevent dup exports)
  const { data: existing } = await sb.from('ad_creatives').select('id').eq('composite_image_url', asset.public_url).limit(1).maybeSingle();
  if (existing) { log(`asset ${assetId} already exported as ad_creatives ${existing.id}`); return existing.id; }

  const angle = asset.angle || 'default';
  const headline = HEADLINE_BY_ANGLE[angle] || HEADLINE_BY_ANGLE.default;
  const body = BODY_BY_ANGLE[angle] || BODY_BY_ANGLE.default;

  const { data: ad, error: cErr } = await sb.from('ad_creatives').insert({
    user_id: TOM_USER_ID,
    headline,
    body_copy: body,
    cta_text: 'Shop Now',
    composite_image_url: asset.public_url,
    target_audience: {
      age_min: 25, age_max: 55,
      geo_locations: { countries: ['AE'] },
    },
    daily_budget: 15.00,
    status: 'draft',
    angle: asset.angle,
    image_style: asset.scene_type,
  }).select('id').single();
  if (cErr) { log(`ad_creatives insert FAIL for ${assetId}: ${cErr.message}`); return null; }

  log(`✓ exported asset ${assetId} → ad_creatives ${ad.id} (${asset.scene_type}/${asset.angle || 'agnostic'})`);
  return ad.id;
}

const exported = [];

if (args['asset-id']) {
  const id = await exportOne(args['asset-id']);
  if (id) exported.push(id);
} else if (args.sweep === 'true') {
  // Find all approved hero/lifestyle assets not yet exported
  const { data: candidates, error } = await sb
    .from('media_assets')
    .select('id, public_url, scene_type, angle')
    .in('scene_type', ['hero', 'lifestyle'])
    .eq('status', 'approved');
  if (error) { console.error(`sweep query fail: ${error.message}`); process.exit(2); }
  log(`found ${candidates.length} approved hero/lifestyle candidate(s)`);
  for (const c of candidates) {
    const id = await exportOne(c.id);
    if (id) exported.push(id);
  }
} else {
  console.error('Usage: --asset-id <uuid> OR --sweep');
  process.exit(2);
}

process.stdout.write(JSON.stringify({ exported_count: exported.length, ad_creative_ids: exported }, null, 2) + '\n');
