#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.EVEREST_CALENDAR_URL || 'https://everest-calendar.vercel.app';
const secret = process.env.MARKETING_SYNC_SECRET;
const themeId = Number(process.env.SHOPIFY_LIVE_THEME_ID || 167131775284);
const attributionKey = 'snippets/everest-attribution-pixel.liquid';
const qualityKey = 'snippets/everest-kryo2-quality-pixel.liquid';
const layoutKey = 'layout/theme.liquid';
const includeLine = "{% render 'everest-kryo2-quality-pixel' %}";
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!secret) throw new Error('MARKETING_SYNC_SECRET is required');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'x-sync-secret': secret, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${response.status} ${path}: ${text.slice(0, 600)}`);
  return body;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function deploy(key, value) {
  return request('/api/marketing/theme/deploy-asset', {
    method: 'POST',
    body: JSON.stringify({ theme_id: themeId, key, value }),
  });
}

const live = await request(`/api/marketing/theme/asset?theme_id=${themeId}&key=${encodeURIComponent(attributionKey)}`);
const priorAttribution = live.value;
if (typeof priorAttribution !== 'string' || !priorAttribution.includes('everest-attribution-pixel')) {
  throw new Error('Refused: live attribution pixel could not be verified');
}

const qualityValue = await readFile(resolve(root, 'theme-assets/snippets/everest-kryo2-quality-pixel.liquid'), 'utf8');
const nextAttribution = priorAttribution.includes(includeLine)
  ? priorAttribution
  : `${priorAttribution.trimEnd()}\n${includeLine}\n`;

const qualityResult = await deploy(qualityKey, qualityValue);
const attributionResult = nextAttribution === priorAttribution
  ? { success: true, skipped: true, reason: 'include_already_present' }
  : await deploy(attributionKey, nextAttribution);
const layout = await request(`/api/marketing/theme/asset?theme_id=${themeId}&key=${encodeURIComponent(layoutKey)}`);
const priorLayout = layout.value;
if (typeof priorLayout !== 'string' || !priorLayout.includes('everest-attribution-pixel') || !priorLayout.includes('</body>')) {
  throw new Error('Refused: live layout or existing attribution pixel could not be verified');
}
const nextLayout = priorLayout.includes(includeLine)
  ? priorLayout
  : priorLayout.replace('</body>', `  ${includeLine}\n</body>`);
const layoutResult = nextLayout === priorLayout
  ? { success: true, skipped: true, reason: 'include_already_present' }
  : await deploy(layoutKey, nextLayout);

console.log(JSON.stringify({
  success: true,
  mutation_scope: 'shopify_theme_only_no_meta_ads_changed',
  theme_id: themeId,
  quality_asset: { key: qualityKey, bytes: qualityValue.length, sha256_16: hash(qualityValue), result: qualityResult },
  attribution_asset: {
    key: attributionKey,
    prior_bytes: priorAttribution.length,
    next_bytes: nextAttribution.length,
    prior_sha256_16: hash(priorAttribution),
    next_sha256_16: hash(nextAttribution),
    appended_line: nextAttribution === priorAttribution ? null : includeLine,
    result: attributionResult,
  },
  layout_asset: {
    key: layoutKey,
    prior_bytes: priorLayout.length,
    next_bytes: nextLayout.length,
    prior_sha256_16: hash(priorLayout),
    next_sha256_16: hash(nextLayout),
    inserted_line: nextLayout === priorLayout ? null : includeLine,
    result: layoutResult,
  },
}, null, 2));
