// /api/marketing/kryo/update-page
//
// THE single orchestrator endpoint for KRYO product page content changes.
// Wraps: upload (if local file) → clone-template (auto-incremented suffix) →
//        configure-product → publish-product → poll storefront → audit log.
//
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
//
// POST /api/marketing/kryo/update-page
// {
//   "product_handle": "kryo-uae",
//   "patches": [
//     // image — by slot, with already-uploaded URL or local file path
//     { "slot": "comparison_kryo_unit", "image_url": "https://cdn.shopify.com/.../X.png" },
//     { "slot": "comparison_kryo_unit", "image_local_path": "/Users/happy/Desktop/X.png" },
//
//     // copy — by slot
//     { "copy_slot": "hero_stock_remaining", "text": "6" },
//
//     // video — by slot, with URL or local path (.mp4/.mov)
//     { "video_slot": "hero_background_video", "video_local_path": "/Users/happy/Desktop/demo.mp4" },
//
//     // raw — section + block + settings (escape hatch when no slot exists)
//     { "section": "main", "block": "icon_with_text_4mxWMc", "settings": { "heading_1": "X" } }
//   ],
//   "note": "Tom drop 4 May — V4 product photography swap"
// }
//
// Returns: { success, live_url, template_suffix, patches_applied,
//            storefront_status: 'verified'|'propagating', eta_seconds, change_log_id }

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { logMarketingChange } from '@/lib/marketing/change-log';

// Anchor every slot lookup against the canonical base template.
// All variants (nue-uae1-uae-urgency, nue-uae1-test-X, etc.) share this map.
const BASE_TEMPLATE_SUFFIX = 'nue-uae1';
const STOREFRONT_BASE = 'https://everestlabs.co/en-gb/products';
const VERIFY_TIMEOUT_MS = 90_000;
const VERIFY_INTERVAL_MS = 5_000;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

type PatchRaw =
  | { slot: string; image_url?: string; image_local_path?: string }
  | { copy_slot: string; text: string }
  | { video_slot: string; video_url?: string; video_local_path?: string }
  | { section: string; block?: string; settings: Record<string, unknown> };

interface UpdatePageRequest {
  product_handle: string;
  patches: PatchRaw[];
  note?: string;
  source?: 'claude_session' | 'tom_direct' | 'cron';
}

interface ResolvedPatch {
  section: string;
  block?: string;
  settings: Record<string, unknown>;
  // For audit trail + verification detector
  origin: 'image_slot' | 'copy_slot' | 'video_slot' | 'raw';
  slot_name?: string;
  detect_token?: string; // string to grep storefront for verification
}

interface SlotRow {
  slot_name: string;
  section_id: string;
  block_id: string;
  setting_key: string;
}

function svc() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function cdnUrlToShopifyImageRef(url: string): string {
  if (url.startsWith('shopify://')) return url;
  const noQuery = url.split('?')[0];
  const filename = noQuery.split('/').pop();
  if (!filename) throw new Error(`Cannot extract filename from URL: ${url}`);
  return `shopify://shop_images/${filename}`;
}

function filenameFromUrl(url: string): string {
  return (url.split('?')[0].split('/').pop() ?? '').trim();
}


async function lookupImageSlot(slotName: string): Promise<SlotRow> {
  const sb = svc();
  const { data, error } = await sb
    .from('kryo_image_slots')
    .select('slot_name,section_id,block_id,setting_key')
    .eq('slot_name', slotName)
    .eq('template_suffix', BASE_TEMPLATE_SUFFIX)
    .maybeSingle();
  if (error) throw new Error(`Image slot lookup failed: ${error.message}`);
  if (!data) {
    const { data: avail } = await sb
      .from('kryo_image_slots')
      .select('slot_name')
      .eq('template_suffix', BASE_TEMPLATE_SUFFIX);
    const list = (avail ?? []).map((r) => r.slot_name).join(', ');
    throw new Error(`Image slot "${slotName}" not registered. Available: ${list}`);
  }
  return data as SlotRow;
}

async function lookupCopySlot(slotName: string): Promise<SlotRow> {
  const sb = svc();
  const { data, error } = await sb
    .from('kryo_copy_slots')
    .select('slot_name,section_id,block_id,setting_key')
    .eq('slot_name', slotName)
    .eq('template_suffix', BASE_TEMPLATE_SUFFIX)
    .maybeSingle();
  if (error) throw new Error(`Copy slot lookup failed: ${error.message}`);
  if (!data) {
    const { data: avail } = await sb
      .from('kryo_copy_slots')
      .select('slot_name')
      .eq('template_suffix', BASE_TEMPLATE_SUFFIX);
    const list = (avail ?? []).map((r) => r.slot_name).join(', ');
    throw new Error(`Copy slot "${slotName}" not registered. Available: ${list}`);
  }
  return data as SlotRow;
}

async function lookupVideoSlot(slotName: string): Promise<SlotRow> {
  const sb = svc();
  const { data, error } = await sb
    .from('kryo_video_slots')
    .select('slot_name,section_id,block_id,setting_key')
    .eq('slot_name', slotName)
    .eq('template_suffix', BASE_TEMPLATE_SUFFIX)
    .maybeSingle();
  if (error) throw new Error(`Video slot lookup failed: ${error.message}`);
  if (!data) throw new Error(`Video slot "${slotName}" not registered.`);
  return data as SlotRow;
}

// Upload local file via the existing upload-image route (handles both image + video)
async function uploadLocalFile(absPath: string): Promise<{ cdn_url: string; filename: string; content_type: string }> {
  const st = await stat(absPath);
  if (st.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large: ${st.size} bytes (max ${MAX_FILE_SIZE_BYTES})`);
  }
  const buf = await readFile(absPath);
  const filename = absPath.split('/').pop() ?? 'upload.bin';

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://everest-calendar.vercel.app';
  const res = await fetch(`${baseUrl}/api/marketing/shopify/upload-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '',
    },
    body: JSON.stringify({
      filename,
      data_b64: buf.toString('base64'),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upload-image failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.success || !data.cdn_url) {
    throw new Error(`upload-image returned no CDN URL: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return {
    cdn_url: data.cdn_url,
    filename: data.filename,
    content_type: data.content_type ?? 'IMAGE',
  };
}

async function getProductByHandle(handle: string, baseUrl: string): Promise<{ id: number; handle: string; template_suffix: string | null }> {
  const res = await fetch(`${baseUrl}/api/marketing/shopify/get-product?handle=${encodeURIComponent(handle)}`, {
    headers: { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '' },
  });
  if (!res.ok) throw new Error(`get-product ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function listExistingTemplateSuffixes(storeUrl: string, token: string, themeId: number, basePrefix: string): Promise<string[]> {
  const res = await fetch(`https://${storeUrl}/admin/api/2024-10/themes/${themeId}/assets.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok) throw new Error(`themes/assets.json ${res.status}`);
  const data = await res.json();
  const all: Array<{ key: string }> = data.assets ?? [];
  return all
    .filter((a) => a.key.startsWith(`templates/product.${basePrefix}`) && a.key.endsWith('.json'))
    .map((a) => a.key.replace(/^templates\/product\./, '').replace(/\.json$/, ''));
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

// Build the next available template_suffix using current as base.
// Examples:
//   current=nue-uae1                        → nue-uae1-v1
//   current=nue-uae1-uae-urgency            → nue-uae1-uae-urgency-v1
//   current=nue-uae1-uae-urgency-v3         → nue-uae1-uae-urgency-v4
//   current=nue-uae1-uae-urgency-v3 + existing v3,v4,v5 → v6
async function nextTemplateSuffix(currentSuffix: string | null, existing: string[]): Promise<string> {
  const safe = currentSuffix && currentSuffix.startsWith(BASE_TEMPLATE_SUFFIX) ? currentSuffix : BASE_TEMPLATE_SUFFIX;
  const m = /^(.*?)(-v(\d+))?$/.exec(safe);
  const stem = (m?.[1] ?? safe).replace(/-v\d+$/, '');
  // Find max -vN that already exists for this stem
  let maxN = 0;
  const re = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-v(\\d+)$`);
  for (const s of existing) {
    const mm = re.exec(s);
    if (mm) {
      const n = parseInt(mm[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  return `${stem}-v${maxN + 1}`;
}

async function pollStorefront(handle: string, detectTokens: string[], deadlineMs: number): Promise<{ verified: boolean; lastSize: number }> {
  const start = Date.now();
  let lastSize = 0;
  while (Date.now() - start < deadlineMs) {
    try {
      const ts = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
      const res = await fetch(`${STOREFRONT_BASE}/${handle}?_=${ts}`);
      const html = await res.text();
      lastSize = html.length;
      const allFound = detectTokens.every((t) => t && html.includes(t));
      if (allFound) return { verified: true, lastSize };
    } catch {
      // soft-fail and continue
    }
    await new Promise((r) => setTimeout(r, VERIFY_INTERVAL_MS));
  }
  return { verified: false, lastSize };
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UpdatePageRequest;
  try {
    body = (await req.json()) as UpdatePageRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.product_handle || !Array.isArray(body.patches) || body.patches.length === 0) {
    return NextResponse.json({ error: 'product_handle + non-empty patches required' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://everest-calendar.vercel.app';
  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const sb = svc();
  let logId: string | null = null;

  try {
    // 1. Resolve product
    const product = await getProductByHandle(body.product_handle, baseUrl);
    if (!product?.id) {
      return NextResponse.json({ error: `Product not found: ${body.product_handle}` }, { status: 404 });
    }
    const beforeSuffix = product.template_suffix ?? null;

    // 2. Resolve every patch — uploading any local files inline
    const resolved: ResolvedPatch[] = [];
    for (const p of body.patches) {
      // image_slot
      if ('slot' in p && p.slot) {
        const slot = await lookupImageSlot(p.slot);
        let imageUrl = (p as { image_url?: string }).image_url;
        const localPath = (p as { image_local_path?: string }).image_local_path;
        if (!imageUrl && localPath) {
          const up = await uploadLocalFile(localPath);
          imageUrl = up.cdn_url;
        }
        if (!imageUrl) throw new Error(`Image slot patch "${p.slot}" missing image_url or image_local_path`);
        const filename = filenameFromUrl(imageUrl);
        resolved.push({
          section: slot.section_id,
          block: slot.block_id,
          settings: { [slot.setting_key]: cdnUrlToShopifyImageRef(imageUrl) },
          origin: 'image_slot',
          slot_name: p.slot,
          detect_token: filename,
        });
        continue;
      }
      // copy_slot
      if ('copy_slot' in p && p.copy_slot) {
        const slot = await lookupCopySlot(p.copy_slot);
        if (typeof p.text !== 'string') throw new Error(`Copy slot patch "${p.copy_slot}" missing text`);
        resolved.push({
          section: slot.section_id,
          block: slot.block_id,
          settings: { [slot.setting_key]: p.text },
          origin: 'copy_slot',
          slot_name: p.copy_slot,
          detect_token: p.text.replace(/<[^>]+>/g, '').trim().slice(0, 80) || p.text.slice(0, 80),
        });
        continue;
      }
      // video_slot
      if ('video_slot' in p && p.video_slot) {
        const slot = await lookupVideoSlot(p.video_slot);
        let videoUrl = (p as { video_url?: string }).video_url;
        const localPath = (p as { video_local_path?: string }).video_local_path;
        if (!videoUrl && localPath) {
          const up = await uploadLocalFile(localPath);
          videoUrl = up.cdn_url;
        }
        if (!videoUrl) throw new Error(`Video slot patch "${p.video_slot}" missing video_url or video_local_path`);
        const filename = filenameFromUrl(videoUrl);
        resolved.push({
          section: slot.section_id,
          block: slot.block_id,
          // Videos in AI blocks usually live as full URL settings, not shopify:// scheme — keep URL as-is
          settings: { [slot.setting_key]: videoUrl },
          origin: 'video_slot',
          slot_name: p.video_slot,
          detect_token: filename,
        });
        continue;
      }
      // raw
      if ('section' in p && p.section && p.settings) {
        const detectStr = Object.values(p.settings).find((v) => typeof v === 'string') as string | undefined;
        resolved.push({
          section: p.section,
          block: p.block,
          settings: p.settings,
          origin: 'raw',
          detect_token: detectStr ? detectStr.replace(/<[^>]+>/g, '').trim().slice(0, 80) : undefined,
        });
        continue;
      }
      throw new Error(`Patch shape not recognised: ${JSON.stringify(p).slice(0, 120)}`);
    }

    // 3. Auto-increment target template_suffix
    const themeId = await getLiveThemeId(storeUrl, token);
    const existing = await listExistingTemplateSuffixes(storeUrl, token, themeId, BASE_TEMPLATE_SUFFIX);
    const targetSuffix = await nextTemplateSuffix(beforeSuffix, existing);
    const sourceKey = `templates/product.${beforeSuffix ?? BASE_TEMPLATE_SUFFIX}.json`;
    const targetKey = `templates/product.${targetSuffix}.json`;

    // 4. Insert audit log (preliminary — will update with verification status after polling)
    const { data: logRow } = await sb
      .from('kryo_page_change_log')
      .insert({
        product_id: String(product.id),
        product_handle: product.handle,
        template_suffix_before: beforeSuffix,
        template_suffix_after: targetSuffix,
        patches_applied: resolved.map((r) => ({ origin: r.origin, slot_name: r.slot_name, section: r.section, block: r.block, settings: r.settings })),
        patches_count: resolved.length,
        source: body.source ?? 'claude_session',
        note: body.note ?? null,
      })
      .select('id')
      .single();
    logId = logRow?.id ?? null;

    // 5. clone-template — single call with all resolved patches as raw section/block patches
    const cloneRes = await fetch(`${baseUrl}/api/marketing/theme/clone-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '' },
      body: JSON.stringify({
        source_key: sourceKey,
        target_key: targetKey,
        overwrite: false, // target is brand-new (auto-incremented), should never collide
        patches: resolved.map((r) => ({ section: r.section, block: r.block, settings: r.settings })),
      }),
    });
    if (!cloneRes.ok) {
      const text = await cloneRes.text();
      throw new Error(`clone-template failed: ${cloneRes.status} ${text.slice(0, 300)}`);
    }
    const cloneData = await cloneRes.json();
    if (!cloneData.success) {
      throw new Error(`clone-template not successful: ${JSON.stringify(cloneData).slice(0, 300)}`);
    }

    // 6. configure-product — apply new suffix
    const cfgRes = await fetch(`${baseUrl}/api/marketing/theme/configure-product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '' },
      body: JSON.stringify({ product_id: String(product.id), template_suffix: targetSuffix }),
    });
    if (!cfgRes.ok) {
      throw new Error(`configure-product failed: ${cfgRes.status} ${(await cfgRes.text()).slice(0, 300)}`);
    }

    // 7. publish-product — cache invalidation
    await fetch(`${baseUrl}/api/marketing/launch/publish-product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '' },
      body: JSON.stringify({ shopify_product_id: String(product.id) }),
    }).catch(() => undefined);

    // 8. Poll storefront — verify the new content lands
    const detectTokens = resolved.map((r) => r.detect_token).filter((s): s is string => Boolean(s));
    const { verified, lastSize } = detectTokens.length > 0
      ? await pollStorefront(product.handle, detectTokens, VERIFY_TIMEOUT_MS)
      : { verified: false, lastSize: 0 };

    // 9. Record image active_usage if any image patches landed
    const imagePatches = resolved.filter((r) => r.origin === 'image_slot' && r.slot_name);
    if (imagePatches.length > 0) {
      const usageRows = imagePatches.map((r) => {
        const ref = r.settings[Object.keys(r.settings)[0]] as string;
        const filename = ref.replace('shopify://shop_images/', '');
        return {
          image_url: `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/${filename}`,
          channel: 'product_page_slot',
          reference: r.slot_name!,
          template_suffix: targetSuffix,
          product_handle: product.handle,
          active: true,
          notes: `update-page orchestrator @ ${new Date().toISOString()}`,
        };
      });
      await sb
        .from('kryo_image_active_usage')
        .upsert(usageRows, { onConflict: 'image_url,channel,reference', ignoreDuplicates: false })
        .then(() => undefined, () => undefined);
    }

    // 10. Update audit log with verification result
    const liveUrl = `${STOREFRONT_BASE}/${product.handle}`;
    const finalStatus: 'verified' | 'propagating' = verified ? 'verified' : 'propagating';
    if (logId) {
      await sb
        .from('kryo_page_change_log')
        .update({
          storefront_status: finalStatus,
          storefront_verified_at: verified ? new Date().toISOString() : null,
          live_url: liveUrl,
        })
        .eq('id', logId);
    }

    try {
      await logMarketingChange(sb, {
        source: 'kryo.update-page',
        surface: 'shopify_page',
        objectType: 'shopify_product',
        objectId: String(product.id),
        objectName: body.product_handle,
        market: 'AE',
        productHandle: 'kryo2',
        changeType: 'update_page',
        beforePayload: { template_suffix: beforeSuffix },
        afterPayload: { template_suffix: targetSuffix, storefront_status: finalStatus },
        note: body.note ?? 'KRYO update-page route mutation',
        autoLogged: true,
        metadata: { patches_count: body.patches.length, change_log_id: logId },
      });
    } catch (error) {
      console.warn('marketing change log failed (non-fatal):', error);
    }

    return NextResponse.json({
      success: true,
      live_url: liveUrl,
      template_suffix_before: beforeSuffix,
      template_suffix: targetSuffix,
      patches_applied: resolved.length,
      storefront_status: finalStatus,
      eta_seconds: verified ? 0 : 600,
      change_log_id: logId,
      page_size_bytes: lastSize,
      detect_tokens: detectTokens,
      patches_summary: resolved.map((r) => ({
        origin: r.origin,
        slot_name: r.slot_name,
        section: r.section,
        block: r.block,
      })),
    });
  } catch (e) {
    const errMsg = (e as Error).message ?? 'Unknown error';
    if (logId) {
      await sb
        .from('kryo_page_change_log')
        .update({ storefront_status: 'failed', error: errMsg })
        .eq('id', logId)
        .then(() => undefined, () => undefined);
    }
    return NextResponse.json({ error: errMsg, change_log_id: logId }, { status: 500 });
  }
}
