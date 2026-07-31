// /api/marketing/theme/configure-product
// Sets template_suffix and (optionally) clears body_html on an existing Shopify product
// via GraphQL productUpdate. Used to pivot a draft/test product to a custom template
// without re-cloning. Skill-mode auth via x-sync-secret.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { createClient } from '@supabase/supabase-js';
import { auditLog } from '@/lib/marketing-safety';
import { logMarketingChange } from '@/lib/marketing/change-log';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface ConfigureRequest {
  product_id: string;
  template_suffix?: string | null;
  clear_body_html?: boolean;
  body_html?: string;
  title?: string;
  handle?: string;
}

export async function POST(request: NextRequest) {
  if (!authSkill(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  let body: ConfigureRequest;
  try {
    body = (await request.json()) as ConfigureRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.product_id || typeof body.product_id !== 'string') {
    return NextResponse.json({ error: 'product_id (numeric string) required' }, { status: 400 });
  }
  if (body.template_suffix === undefined && body.clear_body_html !== true && body.body_html === undefined && body.title === undefined && body.handle === undefined) {
    return NextResponse.json({ error: 'Specify at least one of: template_suffix, clear_body_html=true, body_html, title, handle' }, { status: 400 });
  }

  let shopifyUrl: string;
  let shopifyToken: string;
  try {
    shopifyUrl = getShopifyStoreUrl();
    shopifyToken = await getShopifyToken();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const beforeRes = await fetch(
    `https://${shopifyUrl}/admin/api/2025-04/products/${body.product_id}.json?fields=id,handle,title,template_suffix,status`,
    { headers: { 'X-Shopify-Access-Token': shopifyToken } },
  );
  if (!beforeRes.ok) {
    return NextResponse.json({
      error: `Shopify GET product HTTP ${beforeRes.status}`,
      detail: await beforeRes.text().catch(() => ''),
    }, { status: 502 });
  }
  const beforePayload = await beforeRes.json();
  const before = beforePayload.product as { id: number; handle: string; title: string; template_suffix: string | null; status: string };

  const input: Record<string, unknown> = { id: `gid://shopify/Product/${body.product_id}` };
  if (body.template_suffix !== undefined) input.templateSuffix = body.template_suffix;
  if (body.title !== undefined) input.title = body.title;
  if (body.handle !== undefined) input.handle = body.handle;
  if (body.body_html !== undefined) input.descriptionHtml = body.body_html;
  else if (body.clear_body_html === true) input.descriptionHtml = '';

  const gqlRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyToken,
    },
    body: JSON.stringify({
      query: `
        mutation ConfigureProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id handle title templateSuffix status }
            userErrors { field message }
          }
        }
      `,
      variables: { input },
    }),
  });

  const gqlText = await gqlRes.text();
  let gqlPayload: { data?: { productUpdate?: { product?: { id: string; handle: string; title: string; templateSuffix: string | null; status: string }; userErrors?: Array<{ field: string[]; message: string }> } }; errors?: unknown } | null = null;
  try { gqlPayload = JSON.parse(gqlText); } catch { /* not JSON */ }

  if (!gqlRes.ok || !gqlPayload || gqlPayload.errors) {
    return NextResponse.json({
      error: `Shopify productUpdate HTTP ${gqlRes.status}`,
      detail: gqlPayload?.errors ?? gqlText.slice(0, 800),
    }, { status: 502 });
  }

  const userErrors = gqlPayload.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return NextResponse.json({
      error: 'productUpdate userErrors',
      detail: userErrors,
    }, { status: 422 });
  }

  const updated = gqlPayload.data?.productUpdate?.product;

  try {
    const sb = svcClient();
    await auditLog(
      sb,
      TOM_USER_ID,
      'product_configured',
      'shopify_product',
      String(body.product_id),
      { title: before.title, handle: before.handle, template_suffix: before.template_suffix, status: before.status },
      { title: updated?.title ?? before.title, handle: updated?.handle ?? before.handle, template_suffix: updated?.templateSuffix ?? null, status: updated?.status ?? before.status },
      'scheduled_agent',
      { product_id: body.product_id, applied: { template_suffix: body.template_suffix, clear_body_html: body.clear_body_html ?? false } },
    );
    await logMarketingChange(sb, {
      source: 'theme.configure-product',
      surface: 'shopify_page',
      objectType: 'shopify_product',
      objectId: String(body.product_id),
      objectName: updated?.handle ?? before.handle,
      market: 'AE',
      productHandle: 'kryo2',
      changeType: 'configure_product',
      beforePayload: { title: before.title, handle: before.handle, template_suffix: before.template_suffix, status: before.status },
      afterPayload: { title: updated?.title ?? before.title, handle: updated?.handle ?? before.handle, template_suffix: updated?.templateSuffix ?? null, status: updated?.status ?? before.status },
      note: 'Template / body / title / handle configuration updated via configure-product route',
      metadata: { applied: { template_suffix: body.template_suffix, clear_body_html: body.clear_body_html ?? false, title: body.title, handle: body.handle } },
    });
  } catch (e) {
    console.warn('audit log failed (non-fatal):', e);
  }

  return NextResponse.json({
    success: true,
    product_id: body.product_id,
    handle: updated?.handle ?? before.handle,
    before: { title: before.title, handle: before.handle, template_suffix: before.template_suffix, status: before.status },
    after: { title: updated?.title ?? before.title, handle: updated?.handle ?? before.handle, template_suffix: updated?.templateSuffix ?? null, status: updated?.status ?? before.status },
  });
}
