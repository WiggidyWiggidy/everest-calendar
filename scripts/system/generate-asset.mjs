#!/usr/bin/env node
// generate-asset.mjs — provider-pluggable AI image/video generator.
// Default: fal.ai FLUX (schnell for fast, pro for finals). Fallback: Replicate.
// Output: stores in Supabase Storage `kryo-assets/ai-generated/` + media_assets row at pending_qc.
//
// Usage:
//   node scripts/system/generate-asset.mjs --scene lifestyle --angle athlete_recovery [--variant 1] [--video] [--quality fast|final]
// Env:
//   FAL_API_KEY         (default provider)
//   REPLICATE_API_TOKEN (fallback)
//   LUMA_API_KEY        (video, optional)

import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const BUCKET = 'kryo-assets';
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

const sceneType = args.scene;
const angle = args.angle || null;
const variant = parseInt(args.variant || '1', 10);
const isVideo = args.video === 'true';
const quality = args.quality || 'fast';

if (!sceneType) { console.error('Usage: --scene <hero|lifestyle|diagram|founder|comparison|...> [--angle <a>] [--video]'); process.exit(2); }

const log = (m) => process.stderr.write(`[gen-asset] ${m}\n`);

// ── Prompt builder ──────────────────────────────────────
const ANGLE_FLAVOR = {
  morning_energy: 'morning light, energy, alertness, ritual, focus',
  athlete_recovery: 'athletic adult, post-training, sweat, recovery, gym-adjacent',
  luxury_upgrade: 'high-end Dubai apartment, luxury finish, marble, glass, skyline',
  value_anchor: 'practical, no-nonsense, contrast vs gym subscription, value-focused',
  science_authority: 'lab-grade, precision, data-driven, scientific authority',
};

const SCENE_PROMPTS = {
  hero:        'Studio product photograph of KRYO V4 cold plunge unit on polished concrete floor, 48×42×45cm matte black aluminum housing with digital control panel showing 1°C, single key light from upper left, deep shadow, premium minimal composition, no people, no text overlay',
  lifestyle:   'Cinematic photograph of a 1°C cold plunge unit installed inside a modern Dubai high-rise apartment shower stall, athletic adult stepping out post-session, morning light through floor-to-ceiling window with city skyline blurred, matte black and chrome industrial design, hyper-detailed, 8k photorealistic',
  diagram:     'Technical illustration of KRYO V4 cold plunge unit cross-section, exposing 0.1HP compressor, 14L pressurised reservoir, IPX4 enclosure, clean engineering linework, neutral grey background, callout-ready composition, no text labels',
  founder:     'Editorial portrait of a male founder in his late 30s, Mediterranean features, standing in a workshop with KRYO unit visible behind, plain charcoal t-shirt, natural window light, 35mm photography, candid expression, no smile, looking at camera',
  comparison:  'Split-frame editorial composition: left side shows industrial outdoor ice bath barrel under harsh sun, right side shows sleek matte-black KRYO unit in apartment shower, both same scale, same lighting, neutral palette',
  social_proof: 'Editorial photograph of three diverse adults using or stepping out of cold plunge units, candid moment, neutral colors, premium gym-club aesthetic, no faces obscured, indoor setting',
  press: 'Magazine-style flat-lay of KRYO V4 unit beside opened newspaper or magazine showing fitness/tech editorial coverage, neutral background, top-down composition',
  b_roll_video: 'Slow-motion product reveal video, 4K, 24fps, KRYO V4 unit rotating against dark gradient background, key light tracks the form, ice mist drifting from open lid, cinematic dark teal grade',
};

const BRAND_BLOCK = 'Color palette: charcoal #0a0a0a + warm white + chrome accent only. No saturated reds yellows greens. No people in product shots. No text overlays. No watermarks. No competitor branding.';

const NEG_PROMPT = 'lowres, low quality, oversaturated, cartoon, illustration, watermark, text overlay, logo, brand name, multiple products, cluttered background, oversharpening, plastic-looking, fake, AI artifact, distorted hands, distorted faces, anatomical error';

const basePrompt = SCENE_PROMPTS[sceneType] || `KRYO V4 cold plunge unit, ${sceneType} composition`;
const angleFlavor = angle ? `, ${ANGLE_FLAVOR[angle] || angle}` : '';
const fullPrompt = `${basePrompt}${angleFlavor}. ${BRAND_BLOCK}`;
log(`prompt (${sceneType}/${angle || 'agnostic'}/v${variant}): ${fullPrompt.slice(0, 160)}…`);

// ── Provider implementations ──────────────────────────────
async function generateViaFalAi() {
  if (!process.env.FAL_API_KEY) throw new Error('FAL_API_KEY not set');
  const model = isVideo
    ? 'fal-ai/luma-dream-machine'
    : (quality === 'final' ? 'fal-ai/flux-pro/v1.1' : 'fal-ai/flux/schnell');
  const body = isVideo
    ? { prompt: fullPrompt, aspect_ratio: '16:9', loop: false }
    : { prompt: fullPrompt, image_size: 'landscape_16_9', num_inference_steps: quality === 'final' ? 28 : 4, num_images: 1 };

  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${process.env.FAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`fal.ai ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const imageUrl = data.images?.[0]?.url || data.video?.url || data.url;
  if (!imageUrl) throw new Error(`fal.ai response missing image/video URL: ${JSON.stringify(data).slice(0, 200)}`);
  return { url: imageUrl, model, raw: data };
}

async function generateViaReplicate() {
  if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const model = isVideo
    ? 'tencent/hunyuan-video:6c9132aee14409cd6568d030453f1ba50f5f3412b844fe67f78a9eb62d55664f'
    : 'black-forest-labs/flux-schnell';
  const body = {
    version: model.includes(':') ? model.split(':')[1] : undefined,
    input: { prompt: fullPrompt, aspect_ratio: '16:9' },
  };
  const startRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!startRes.ok) throw new Error(`replicate start HTTP ${startRes.status}`);
  const start = await startRes.json();
  // Poll
  let pollUrl = start.urls?.get;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(pollUrl, { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` } });
    const j = await r.json();
    if (j.status === 'succeeded') {
      const url = Array.isArray(j.output) ? j.output[0] : j.output;
      return { url, model, raw: j };
    }
    if (j.status === 'failed' || j.status === 'canceled') {
      throw new Error(`replicate ${j.status}: ${j.error || 'unknown'}`);
    }
  }
  throw new Error('replicate polling timed out after 3 min');
}

let result;
try {
  result = await generateViaFalAi();
} catch (e) {
  log(`fal.ai failed: ${e.message}; trying Replicate fallback`);
  try { result = await generateViaReplicate(); }
  catch (e2) {
    console.error(`FATAL: both providers failed. fal.ai=${e.message}; replicate=${e2.message}`);
    process.exit(2);
  }
}

// ── Download + store ──────────────────────────────────────
log(`generated → ${result.url}`);
const dl = await fetch(result.url);
if (!dl.ok) { console.error(`download FAIL ${dl.status}`); process.exit(3); }
const buf = Buffer.from(await dl.arrayBuffer());
const mime = dl.headers.get('content-type') || (isVideo ? 'video/mp4' : 'image/png');
const ext = isVideo ? 'mp4' : (mime.split('/')[1] || 'png');
const ts = Date.now();
const fname = `${sceneType}-${angle || 'agnostic'}-v${variant}-${ts}.${ext}`;
const storagePath = `ai-generated/${fname}`;

const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, buf, { contentType: mime, upsert: false });
if (upErr) { console.error(`storage upload FAIL: ${upErr.message}`); process.exit(4); }
const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);

const { data: row, error: dbErr } = await sb.from('media_assets').insert({
  user_id: TOM_USER_ID,
  storage_path: storagePath,
  public_url: pub.publicUrl,
  filename: fname,
  file_size: buf.length,
  mime_type: mime,
  status: 'pending_qc',
  source: 'ai_generated',
  scene_type: sceneType,
  angle,
  generation_prompt: fullPrompt,
  generation_model: result.model,
  ai_description: `${sceneType} ${angle || 'agnostic'} (variant ${variant})`,
}).select('*').single();
if (dbErr) { console.error(`db insert FAIL: ${dbErr.message}`); process.exit(5); }

log(`✓ stored ${row.id} status=pending_qc ${pub.publicUrl}`);
process.stdout.write(JSON.stringify(row, null, 2) + '\n');
