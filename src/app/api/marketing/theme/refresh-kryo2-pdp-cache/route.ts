import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { auditLog } from '@/lib/marketing-safety';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const KRYO2_PRODUCT_ID = '9334472311092';
const KRYO2_HANDLE = 'kryo2';
const CACHE_COMMENT = /\\n?<!-- el-kryo2-cache-refresh:[^>]+ -->/g;

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }
  const storeUrl = getShopifyStoreUrl();
  const token = await getShopifyToken();
  const productRes = await fetch(
    `https://${storeUrl}/admin/api/2025-04/products/${KRYO2_PRODUCT_ID}.json?fields=id,handle,body_html,template_suffix,status`,
    { headers: { 'X-Shopify-Access-Token': token } },
  );
  if (!productRes.ok) return NextResponse.json({ error: `Shopify product GET HTTP ${productRes.status}` }, { status: 502 });
  const before = (await productRes.json()).product as {
    id: number; handle: string; body_html: string; template_suffix: string; status: string;
  };
  if (String(before.id) !== KRYO2_PRODUCT_ID || before.handle !== KRYO2_HANDLE) {
    return NextResponse.json({ error: 'Refused: KRYO2 product identity check failed' }, { status: 422 });
  }
  const marker = `<!-- el-kryo2-cache-refresh:${new Date().toISOString()} -->`;
  const nextBody = `${(before.body_html ?? '').replace(CACHE_COMMENT, '').trimEnd()}\n${marker}`;
  const updateRes = await fetch(`https://${storeUrl}/admin/api/2025-04/products/${KRYO2_PRODUCT_ID}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ product: { id: Number(KRYO2_PRODUCT_ID), body_html: nextBody } }),
  });
  const text = await updateRes.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { payload = text; }
  if (!updateRes.ok) return NextResponse.json({ error: `Shopify product PUT HTTP ${updateRes.status}`, detail: payload }, { status: 502 });
  await auditLog(
    svcClient(), TOM_USER_ID, 'kryo2_pdp_cache_refreshed', 'shopify_product', KRYO2_PRODUCT_ID,
    { handle: before.handle, template_suffix: before.template_suffix, visible_body_html_bytes: before.body_html?.replace(CACHE_COMMENT, '').length ?? 0 },
    { handle: before.handle, template_suffix: before.template_suffix, visible_body_html_bytes: nextBody.replace(CACHE_COMMENT, '').length },
    'scheduled_agent', { guard: 'verified_kryo2_only', visible_content_changed: false, marker },
  );
  return NextResponse.json({
    success: true,
    product_id: KRYO2_PRODUCT_ID,
    handle: KRYO2_HANDLE,
    mutation_scope: 'kryo2_non_rendering_description_comment_only',
    visible_content_changed: false,
    template_suffix: before.template_suffix,
    marker,
  });
}
