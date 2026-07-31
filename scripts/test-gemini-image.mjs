#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, '..', '.env.local');
const envText = await fs.readFile(envPath, 'utf8');
const envLine = envText.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
if (!envLine) { console.error('GEMINI_API_KEY not found in .env.local'); process.exit(1); }
const API_KEY = envLine.split('=')[1].trim();

const OUT_DIR = path.resolve(__dirname, 'test-output');
await fs.mkdir(OUT_DIR, { recursive: true });

const MODEL = 'gemini-2.5-flash-image-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function logRateLimit(headers) {
  const interesting = ['x-ratelimit-limit-requests','x-ratelimit-remaining-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-tokens','x-goog-quota-user','retry-after'];
  const found = {};
  for (const k of interesting) { const v = headers.get(k); if (v) found[k] = v; }
  return found;
}

async function generate({ prompt, inputImagePath = null, label }) {
  console.log(`\n──── ${label} ────`);
  console.log(`prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`);

  const parts = [{ text: prompt }];
  if (inputImagePath) {
    const imgBytes = await fs.readFile(inputImagePath);
    parts.push({ inline_data: { mime_type: 'image/png', data: imgBytes.toString('base64') } });
    console.log(`input image: ${path.basename(inputImagePath)} (${(imgBytes.length / 1024).toFixed(0)} KB)`);
  }

  const body = { contents: [{ parts }] };

  const t0 = Date.now();
  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const wallSec = ((Date.now() - t0) / 1000).toFixed(1);

  const rateInfo = logRateLimit(res.headers);
  console.log(`status: ${res.status} ${res.statusText} | wall: ${wallSec}s`);
  if (Object.keys(rateInfo).length) console.log('rate limit headers:', rateInfo);

  if (!res.ok) {
    const errText = await res.text();
    console.error('FAIL body:', errText.slice(0, 800));
    return null;
  }

  const json = await res.json();
  const cand = json.candidates?.[0];
  if (!cand) { console.error('no candidates returned'); console.error(JSON.stringify(json).slice(0, 500)); return null; }

  const imgPart = cand.content?.parts?.find(p => p.inline_data || p.inlineData);
  if (!imgPart) { console.error('no image in response. parts:', JSON.stringify(cand.content?.parts).slice(0, 400)); return null; }

  const inline = imgPart.inline_data || imgPart.inlineData;
  const buf = Buffer.from(inline.data, 'base64');
  const ext = inline.mime_type?.includes('png') || inline.mimeType?.includes('png') ? 'png' : 'jpg';
  const outPath = path.join(OUT_DIR, `${label}.${ext}`);
  await fs.writeFile(outPath, buf);
  console.log(`saved: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);

  if (json.usageMetadata) console.log('usage:', json.usageMetadata);

  return outPath;
}

console.log(`Testing ${MODEL}`);
console.log(`Key: ${API_KEY.slice(0, 10)}...${API_KEY.slice(-4)}`);

// Test 1: text → image (generation)
const heroPath = await generate({
  label: '01_hero_textgen',
  prompt: 'Professional product photography of a sleek matte-black ice bath cold plunge tub with a chrome rim, sitting on weathered teak decking on a luxury Dubai penthouse rooftop terrace at golden hour. Floor-to-ceiling glass, infinity pool in background, soft warm sunlight from the left, shallow depth of field, photorealistic, magazine-quality, 4K commercial product shot.',
});

if (!heroPath) { console.error('\nText-to-image failed. Stopping.'); process.exit(1); }

// Test 2: image → image (editing — the nano-banana superpower)
await generate({
  label: '02_edited_bg_swap',
  inputImagePath: heroPath,
  prompt: 'Keep the ice bath product exactly identical (same shape, color, materials, position, lighting on the product). Replace only the background: now place it inside a minimalist Scandinavian bathroom with white travertine walls, a large arched window letting in cool morning light, polished concrete floor, single tropical plant in a terracotta pot. Maintain photorealism and the same camera angle.',
});

console.log('\n──── Done. Check scripts/test-output/ for both images. ────');
