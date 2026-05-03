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
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface Patch {
  // Raw shape — operator passes section + block + settings directly
  section?: string;
  block?: string;
  settings?: Record<string, unknown>;
  // Slot shape — operator passes slot_name + image_url, resolver fills the rest
  slot?: string;
  image_url?: string;
}

interface ResolvedPatch {
  section: string;
  block?: string;
  settings: Record<string, unknown>;
  // For active-usage tracking
  resolved_from_slot?: string;
  resolved_image_url?: string;
}

function svcClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Convert canonical CDN URL → shopify://shop_images/{filename}, the format AI blocks store.
// e.g. https://cdn.shopify.com/s/files/1/0718/0550/1748/files/man_in_ice_bath_1.png?v=123
//      → shopify://shop_images/man_in_ice_bath_1.png
function cdnUrlToShopifyImageRef(url: string): string {
  if (url.startsWith('shopify://')) return url;
  // Strip query string
  const noQuery = url.split('?')[0];
  // Get filename only
  const filename = noQuery.split('/').pop();
  if (!filename) throw new Error(`Cannot extract filename from URL: ${url}`);
  return `shopify://shop_images/${filename}`;
}

function deriveSourceTemplateSuffix(sourceKey: string): string {
  // 'templates/product.nue-uae1.json' → 'nue-uae1'
  return sourceKey.replace(/^templates\/product\./, '').replace(/\.json$/, '');
}

function deriveTargetTemplateSuffix(targetKey: string): string {
  return targetKey.replace(/^templates\/product\./, '').replace(/\.json$/, '');
}

interface SlotRow {
  slot_name: string;
  template_suffix: string;
  section_id: string;
  block_id: string;
  setting_key: string;
}

async function resolveSlotPatch(
  patch: Patch,
  sourceTemplateSuffix: string,
): Promise<{ resolved: ResolvedPatch; warning?: string }> {
  if (!patch.slot || !patch.image_url) {
    throw new Error('Slot patch requires both "slot" and "image_url"');
  }

  const sb = svcClient();
  const { data, error } = await sb
    .from('kryo_image_slots')
    .select('slot_name,template_suffix,section_id,block_id,setting_key')
    .eq('slot_name', patch.slot)
    .eq('template_suffix', sourceTemplateSuffix)
    .maybeSingle();

  if (error) throw new Error(`Supabase slot lookup failed: ${error.message}`);
  if (!data) {
    // Surface available slot names for that template so caller can fix typos
    const { data: avail } = await sb
      .from('kryo_image_slots')
      .select('slot_name')
      .eq('template_suffix', sourceTemplateSuffix);
    const list = (avail ?? []).map((r) => r.slot_name).join(', ');
    throw new Error(
      `Slot "${patch.slot}" not found for template "${sourceTemplateSuffix}". Available: ${list || '(none)'}`,
    );
  }

  const slot = data as SlotRow;
  let warning: string | undefined;

  // Translate URL format
  const shopifyRef = cdnUrlToShopifyImageRef(patch.image_url);

  // Soft-warn if the URL isn't in the master kryo_images registry
  const { data: imgRow } = await sb
    .from('kryo_images')
    .select('url,primary_product,usable_for_products')
    .eq('url', patch.image_url.split('?')[0])
    .maybeSingle();
  if (!imgRow) {
    warning = `image_url not in kryo_images master registry — proceeding anyway. Add it after for traceability.`;
  } else if (!(imgRow as { usable_for_products: string[] }).usable_for_products?.includes('kryo')) {
    warning = `image_url is in kryo_images but NOT marked usable_for_products=['kryo'] — likely a non-KRYO product image. Verify before deploy.`;
  }

  return {
    resolved: {
      section: slot.section_id,
      block: slot.block_id,
      settings: { [slot.setting_key]: shopifyRef },
      resolved_from_slot: patch.slot,
      resolved_image_url: patch.image_url,
    },
    warning,
  };
}

async function recordActiveUsage(
  resolvedPatches: ResolvedPatch[],
  targetTemplateSuffix: string,
): Promise<{ inserted: number; errors: string[] }> {
  const sb = svcClient();
  const rows = resolvedPatches
    .filter((p) => p.resolved_from_slot && p.resolved_image_url)
    .map((p) => ({
      image_url: p.resolved_image_url!.split('?')[0],
      channel: 'product_page_slot',
      reference: p.resolved_from_slot!,
      template_suffix: targetTemplateSuffix,
      product_handle: null,
      active: true,
      notes: `Auto-recorded by clone-template at ${new Date().toISOString()}`,
    }));

  if (rows.length === 0) return { inserted: 0, errors: [] };

  // Upsert: if image is being re-applied to same slot/template, just refresh
  const { error } = await sb
    .from('kryo_image_active_usage')
    .upsert(rows, { onConflict: 'image_url,channel,reference', ignoreDuplicates: false });

  if (error) {
    return { inserted: 0, errors: [`active_usage upsert failed: ${error.message}`] };
  }
  return { inserted: rows.length, errors: [] };
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

  // 3. Parse + resolve slot patches + apply
  let template: TemplateJson;
  try {
    template = JSON.parse(source.value);
  } catch (e) {
    return NextResponse.json({ error: `Source template is not valid JSON: ${(e as Error).message}` }, { status: 500 });
  }

  const sourceTemplateSuffix = deriveSourceTemplateSuffix(source_key);
  const targetTemplateSuffix = deriveTargetTemplateSuffix(target_key);

  // Pre-resolve all slot-shaped patches into raw {section, block, settings} form
  const resolvedPatches: ResolvedPatch[] = [];
  const resolveWarnings: string[] = [];
  for (const patch of patches) {
    if (patch.slot) {
      try {
        const { resolved, warning } = await resolveSlotPatch(patch, sourceTemplateSuffix);
        resolvedPatches.push(resolved);
        if (warning) resolveWarnings.push(`${patch.slot}: ${warning}`);
      } catch (e) {
        return NextResponse.json(
          { error: `Slot resolution failed: ${(e as Error).message}`, patch },
          { status: 422 },
        );
      }
    } else {
      if (!patch.section || !patch.settings) {
        return NextResponse.json(
          { error: 'Raw patch requires section + settings (or use slot+image_url)', patch },
          { status: 400 },
        );
      }
      resolvedPatches.push({
        section: patch.section,
        block: patch.block,
        settings: patch.settings,
      });
    }
  }

  // Apply each resolved patch into the parsed template
  const applied: Array<{
    patch: ResolvedPatch;
    status: 'applied' | 'section_not_found' | 'block_not_found';
  }> = [];

  for (const rp of resolvedPatches) {
    const section = template.sections?.[rp.section];
    if (!section) {
      applied.push({ patch: rp, status: 'section_not_found' });
      continue;
    }
    if (rp.block) {
      const block = section.blocks?.[rp.block];
      if (!block) {
        applied.push({ patch: rp, status: 'block_not_found' });
        continue;
      }
      block.settings = { ...(block.settings ?? {}), ...rp.settings };
    } else {
      section.settings = { ...(section.settings ?? {}), ...rp.settings };
    }
    applied.push({ patch: rp, status: 'applied' });
  }

  // 4. Write target
  const targetValue = JSON.stringify(template, null, 2);
  try {
    await writeAsset(storeUrl, token, themeId, target_key, targetValue);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // 5. Record active usage for any patch that came from a slot — non-fatal on failure
  let usageReport: { inserted: number; errors: string[] } = { inserted: 0, errors: [] };
  const successfulSlotPatches = applied
    .filter((a) => a.status === 'applied' && a.patch.resolved_from_slot)
    .map((a) => a.patch);
  if (successfulSlotPatches.length > 0) {
    try {
      usageReport = await recordActiveUsage(successfulSlotPatches, targetTemplateSuffix);
    } catch (e) {
      usageReport = { inserted: 0, errors: [(e as Error).message] };
    }
  }

  return NextResponse.json({
    success: true,
    theme_id: themeId,
    source_key,
    target_key,
    template_suffix: targetTemplateSuffix,
    bytes_written: targetValue.length,
    section_count: Object.keys(template.sections ?? {}).length,
    applied_patches: applied,
    resolve_warnings: resolveWarnings,
    active_usage: usageReport,
    overwrote: overwrite,
    next_step: `POST /api/marketing/theme/configure-product { product_id, template_suffix: "${targetTemplateSuffix}" }`,
  });
}
