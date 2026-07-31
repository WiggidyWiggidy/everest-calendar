#!/usr/bin/env node
// Image gen test harness — tries Google direct first, falls back to OpenRouter.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.resolve(__dirname, '..', '.env.local'), 'utf8');
const getKey = (name) => envText.split('\n').find(l => l.startsWith(`${name}=`))?.split('=')[1]?.trim();
const GEMINI_KEY = getKey('GEMINI_API_KEY');
const OPENROUTER_KEY = getKey('OPENROUTER_API_KEY');

const OUT_DIR = path.resolve(__dirname, 'test-output');
await fs.mkdir(OUT_DIR, { recursive: true });

async function tryGoogle({ prompt, label, inputImagePath = null }) {
  const parts = [{ text: prompt }];
  if (inputImagePath) {
    const bytes = await fs.readFile(inputImagePath);
    parts.push({ inline_data: { mime_type: 'image/png', data: bytes.toString('base64') } });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  const json = await res.json();
  const inline = json.candidates?.[0]?.content?.parts?.find(p => p.inline_data || p.inlineData);
  if (!inline) return { ok: false, status: 200, body: 'no image in response' };
  const data = inline.inline_data || inline.inlineData;
  return { ok: true, buffer: Buffer.from(data.data, 'base64'), mime: data.mime_type || data.mimeType };
}

async function tryOpenRouter({ prompt, label, inputImagePath = null }) {
  const content = [{ type: 'text', text: prompt }];
  if (inputImagePath) {
    const bytes = await fs.readFile(inputImagePath);
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` },
    });
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://everest-calendar.vercel.app',
      'X-Title': 'Everest KRYO Image Test',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5-image-mini',
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  const json = await res.json();
  // OpenRouter returns image in choices[0].message.images[].image_url.url (data URI)
  const msg = json.choices?.[0]?.message;
  const imageEntry = msg?.images?.[0]?.image_url?.url;
  if (!imageEntry) return { ok: false, status: 200, body: `no image returned. message: ${JSON.stringify(msg).slice(0, 500)}` };
  const match = imageEntry.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) return { ok: false, status: 200, body: `unexpected image format: ${imageEntry.slice(0, 100)}` };
  return { ok: true, buffer: Buffer.from(match[2], 'base64'), mime: match[1], usage: json.usage, raw: json };
}

async function generate({ prompt, label, inputImagePath = null }) {
  console.log(`\n──── ${label} ────`);
  console.log(`prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`);
  if (inputImagePath) console.log(`input image: ${path.basename(inputImagePath)}`);

  const t0 = Date.now();

  // Try Google first if we have the key
  let result;
  if (GEMINI_KEY) {
    result = await tryGoogle({ prompt, label, inputImagePath });
    if (result.ok) {
      console.log('✓ via Google direct (FREE tier)');
    } else {
      console.log(`✗ Google: HTTP ${result.status} → falling back to OpenRouter`);
    }
  }

  // Fallback to OpenRouter
  if (!result?.ok) {
    if (!OPENROUTER_KEY) { console.error('No OPENROUTER_API_KEY available, cannot fall back'); return null; }
    result = await tryOpenRouter({ prompt, label, inputImagePath });
    if (result.ok) {
      console.log(`✓ via OpenRouter (paid)`);
      if (result.usage) console.log(`  tokens: ${JSON.stringify(result.usage)}`);
    } else {
      console.error(`✗ OpenRouter: HTTP ${result.status}`);
      console.error(`  body: ${result.body?.slice(0, 600)}`);
      return null;
    }
  }

  const wallSec = ((Date.now() - t0) / 1000).toFixed(1);
  const ext = result.mime?.includes('png') ? 'png' : (result.mime?.includes('webp') ? 'webp' : 'jpg');
  const outPath = path.join(OUT_DIR, `${label}.${ext}`);
  await fs.writeFile(outPath, result.buffer);
  console.log(`saved: ${outPath} (${(result.buffer.length / 1024).toFixed(0)} KB) | wall: ${wallSec}s`);
  return outPath;
}

console.log(`Keys: gemini=${GEMINI_KEY ? 'present' : 'MISSING'}, openrouter=${OPENROUTER_KEY ? 'present' : 'MISSING'}`);

const heroPath = await generate({
  label: '01_hero_textgen',
  prompt: 'Professional product photography of a sleek matte-black ice bath cold plunge tub with a chrome rim, sitting on weathered teak decking on a luxury Dubai penthouse rooftop terrace at golden hour. Floor-to-ceiling glass, infinity pool in background, soft warm sunlight from the left, shallow depth of field, photorealistic, magazine-quality, 4K commercial product shot.',
});
if (!heroPath) { console.error('\nText-to-image failed both routes.'); process.exit(1); }

await generate({
  label: '02_edited_bg_swap',
  inputImagePath: heroPath,
  prompt: 'Keep the ice bath product exactly identical (same shape, color, materials, position, lighting on the product). Replace only the background: now place it inside a minimalist Scandinavian bathroom with white travertine walls, a large arched window letting in cool morning light, polished concrete floor, single tropical plant in a terracotta pot. Maintain photorealism and the same camera angle.',
});

console.log('\n──── Done. Check scripts/test-output/ ────');
