// Clone a Shopify product template + optionally patch specific blocks/sections.
// The split-test unlock: same chrome as control, change ONE variable.
//
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
//
// POST /api/marketing/theme/clone-template
// {
//   "source_key": "templates/product.nue-uae1.json",
//   "target_key": "templates/product.nue-uae1-test-headlineA.json",
//   "overwrite": false,
//   "patches": [
//     { "section": "blocks_dijJNt",
//       "block": "ai_gen_block_a11bf55_CzyXYf",
//       "settings": { "heading": "NEW HEADLINE" } },
//     { "section": "main",
//       "block": "icon_with_text_4mxWMc",
//       "settings": { "heading_1": "Updated label" } },
//     { "section": "blocks_dijJNt",
//       "settings": { "padding_top": 40 } }   // section-level (no block field)
//   ]
// }
//
// Returns: { success, target_key, applied_patches, warnings }

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

interface Patch {
  section: string;
  block?: string;
  settings: Record<string, unknown>;
}

interface CloneRequest {
  source_key: string;
  target_key: string;
  overwrite?: boolean;
  patches?: Patch[];
  theme_id?: number;
}

interface ShopifyAsset {
  key: string;
  value?: string;
  size?: number;
  content_type?: string;
}

interface BlockObj {
  type?: string;
  settings?: Record<string, unknown>;
  blocks?: Record<string, BlockObj>;
}

interface SectionObj {
  type?: string;
  settings?: Record<string, unknown>;
  blocks?: Record<string, BlockObj>;
  block_order?: string[];
}

interface TemplateJson {
  sections?: Record<string, SectionObj>;
  order?: string[];
  layout?: string | false;
}

async function getLiveThemeId(storeUrl: string, token: string): Promise<number> {
  const res = await fetch(`https://${storeUrl}/admin/api/2024-10/themes.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok) throw new Error(`themes.json ${res.status}`);
  const data = await res.json();
  const main = data.themes?.find((t: { role: string; id: number }) => t.role === 'main');
  if (!main) throw new Error('No main theme found');
  return main.id;
}

async function readAsset(
  storeUrl: string,
  token: string,
  themeId: number,
  key: string,
): Promise<ShopifyAsset | null> {
  const url = `https://${storeUrl}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read asset ${key} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.asset;
}

async function writeAsset(
  storeUrl: string,
  token: string,
  themeId: number,
  key: string,
  value: string,
): Promise<void> {
  const res = await fetch(`https://${storeUrl}/admin/api/2024-10/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!res.ok) {
    throw new Error(`Write asset ${key} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CloneRequest;
  try {
    body = (await req.json()) as CloneRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { source_key, target_key, patches = [], overwrite = false } = body;

  if (!source_key || !target_key) {
    return NextResponse.json({ error: 'source_key and target_key required' }, { status: 400 });
  }
  // Safety: target must be a product template path to prevent overwriting other assets
  if (!target_key.startsWith('templates/product.') || !target_key.endsWith('.json')) {
    return NextResponse.json(
      { error: `target_key must match templates/product.*.json (got: ${target_key})` },
      { status: 400 },
    );
  }
  if (!source_key.startsWith('templates/') || !source_key.endsWith('.json')) {
    return NextResponse.json(
      { error: `source_key must match templates/*.json (got: ${source_key})` },
      { status: 400 },
    );
  }

  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const themeId = body.theme_id ?? (await getLiveThemeId(storeUrl, token));

  // 1. Read source template
  const source = await readAsset(storeUrl, token, themeId, source_key);
  if (!source || !source.value) {
    return NextResponse.json({ error: `Source template not found: ${source_key}` }, { status: 404 });
  }

  // 2. Check target conflict
  if (!overwrite) {
    const existing = await readAsset(storeUrl, token, themeId, target_key);
    if (existing) {
      return NextResponse.json(
        { error: `target_key ${target_key} exists. Pass "overwrite": true to replace.` },
        { status: 409 },
      );
    }
  }

  // 3. Parse + patch
  let template: TemplateJson;
  try {
    template = JSON.parse(source.value);
  } catch (e) {
    return NextResponse.json({ error: `Source template is not valid JSON: ${(e as Error).message}` }, { status: 500 });
  }

  const applied: Array<{ patch: Patch; status: 'applied' | 'section_not_found' | 'block_not_found' }> = [];

  for (const patch of patches) {
    const section = template.sections?.[patch.section];
    if (!section) {
      applied.push({ patch, status: 'section_not_found' });
      continue;
    }
    if (patch.block) {
      const block = section.blocks?.[patch.block];
      if (!block) {
        applied.push({ patch, status: 'block_not_found' });
        continue;
      }
      block.settings = { ...(block.settings ?? {}), ...patch.settings };
    } else {
      section.settings = { ...(section.settings ?? {}), ...patch.settings };
    }
    applied.push({ patch, status: 'applied' });
  }

  // 4. Write target
  const targetValue = JSON.stringify(template, null, 2);
  try {
    await writeAsset(storeUrl, token, themeId, target_key, targetValue);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Extract derived suffix (templates/product.X.json → X)
  const suffix = target_key.replace(/^templates\/product\./, '').replace(/\.json$/, '');

  return NextResponse.json({
    success: true,
    theme_id: themeId,
    source_key,
    target_key,
    template_suffix: suffix,
    bytes_written: targetValue.length,
    section_count: Object.keys(template.sections ?? {}).length,
    applied_patches: applied,
    overwrote: overwrite,
    next_step: `POST /api/marketing/theme/configure-product { product_id, template_suffix: "${suffix}" }`,
  });
}
