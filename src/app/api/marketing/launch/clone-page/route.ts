// /api/marketing/launch/clone-page
// Duplicates the canonical KRYO winning PRODUCT (handle: kryo_) using Shopify's Product Duplicate API.
// The cloned product inherits the theme template that renders the long-form layout, so the new
// /products/<new-handle> URL renders the same Hero / Engineering / Comparison / Tech Specs / etc.
// sections as the kryo_ control. Overrides apply to title (= H1) and body_html (= description block).
//
// Caller: the /launch-kryo Claude Code skill (free OAuth LLM, no API key needed for copy gen).
// Auth: x-sync-secret header (reuses existing MARKETING_SYNC_SECRET) — no Supabase user required.
// Safety: cloned product created with status='draft' so it doesn't appear in storefront until approved.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { auditLog } from '@/lib/marketing-safety';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const SOURCE_PRODUCT_HANDLE = 'kryo_';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface CloneRequest {
  variant_angle: string;          // e.g. "morning_energy", "athlete_recovery", "luxury_upgrade"
  target_name: string;            // becomes new product title (H1 of product page)
  // Overrides applied to source kryo_ product BODY_HTML (the description block, ~800 chars).
  // The long-form sections live in the theme template, not body_html — those render automatically
  // from the duplicated product's templating.
  overrides?: Array<{ find: string; replace: string; reason?: string }>;
  hypothesis?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
    }

    const body = (await request.json()) as CloneRequest;
    if (!body.variant_angle || !body.target_name) {
      return NextResponse.json({ error: 'variant_angle and target_name required' }, { status: 400 });
    }

    let shopifyUrl: string;
    let shopifyToken: string;
    try {
      shopifyUrl = getShopifyStoreUrl();
      shopifyToken = await getShopifyToken();
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    // 1. Look up source product id by handle
    const lookupRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/products.json?handle=${SOURCE_PRODUCT_HANDLE}&fields=id,handle,title,body_html,template_suffix`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );
    if (!lookupRes.ok) {
      return NextResponse.json({
        error: `Shopify GET product failed: ${lookupRes.status}`,
        detail: await lookupRes.text().catch(() => ''),
      }, { status: 502 });
    }
    const lookupPayload = await lookupRes.json();
    const sourceProduct = lookupPayload.products?.[0];
    if (!sourceProduct?.id) {
      return NextResponse.json({ error: `Source product '${SOURCE_PRODUCT_HANDLE}' not found in Shopify` }, { status: 404 });
    }
    const sourceProductId: number = sourceProduct.id;
    const sourceBodyHtml: string = sourceProduct.body_html ?? '';

    // 2. Compute the variant body_html (with overrides applied) BEFORE duplicating, so we can validate
    let variantBodyHtml = sourceBodyHtml;
    const appliedChanges: Array<{ find: string; replace: string; reason?: string }> = [];
    if (body.overrides?.length) {
      for (const o of body.overrides) {
        if (variantBodyHtml.includes(o.find)) {
          variantBodyHtml = variantBodyHtml.split(o.find).join(o.replace);
          appliedChanges.push(o);
        }
      }
    }
    // If overrides supplied but none matched, soft-warn (not 422) — title still gets the new value, which IS the H1.
    const overridesSuppliedButUnmatched = (body.overrides?.length ?? 0) > 0 && appliedChanges.length === 0;

    // 3. Duplicate the product via Shopify's product duplicate endpoint.
    // This preserves theme template, images, metafields — the new product page renders the same long-form layout.
    const dupRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/products/${sourceProductId}/duplicate.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyToken,
        },
        body: JSON.stringify({
          new_title: body.target_name,
          include_images: true,
          new_status: 'draft', // safety: not visible in storefront until approval
        }),
      }
    );
    if (!dupRes.ok) {
      return NextResponse.json({
        error: `Shopify product duplicate failed: ${dupRes.status}`,
        detail: await dupRes.text().catch(() => ''),
      }, { status: 502 });
    }
    const dupPayload = await dupRes.json();
    const dup = dupPayload.product;
    if (!dup?.id) {
      return NextResponse.json({ error: 'Shopify duplicate response missing product id', detail: JSON.stringify(dupPayload).slice(0, 500) }, { status: 502 });
    }
    const newProductId: string = String(dup.id);
    const newHandle: string = dup.handle;

    // 4. If we have applied changes, PATCH the duplicate's body_html with the modified version.
    if (appliedChanges.length > 0) {
      const updateRes = await fetch(
        `https://${shopifyUrl}/admin/api/2024-01/products/${newProductId}.json`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
          body: JSON.stringify({ product: { id: parseInt(newProductId, 10), body_html: variantBodyHtml } }),
        }
      );
      if (!updateRes.ok) {
        // Don't 500 — the product duplicate succeeded. Log and continue.
        console.warn('body_html update failed (non-fatal):', updateRes.status, await updateRes.text().catch(() => ''));
      }
    }

    const previewUrl = `https://${shopifyUrl}/products/${newHandle}`;

    // 5. Find canonical control row in landing_pages (the parent for this variant)
    const sb = svcClient();
    const { data: parentPage } = await sb
      .from('landing_pages')
      .select('id')
      .eq('user_id', TOM_USER_ID)
      .eq('shopify_url', `https://${shopifyUrl}/products/${SOURCE_PRODUCT_HANDLE}`)
      .eq('variant_angle', 'control')
      .maybeSingle();

    // 6. Insert into landing_pages (page_type='product' since it's a duplicated product, not a Shopify Page)
    const { data: lpRow, error: lpErr } = await sb
      .from('landing_pages')
      .insert({
        user_id: TOM_USER_ID,
        name: body.target_name,
        shopify_url: previewUrl,
        shopify_page_id: newProductId,        // stores product id for page_type='product' rows
        status: 'testing',
        page_type: 'product',
        parent_page_id: parentPage?.id ?? null,
        variant_angle: body.variant_angle,
        notes: `Duplicated from /products/${SOURCE_PRODUCT_HANDLE} on ${new Date().toISOString().split('T')[0]}. ${body.hypothesis ? 'Hypothesis: ' + body.hypothesis : ''} Title override: yes. Body overrides applied: ${appliedChanges.length}.${overridesSuppliedButUnmatched ? ' (overrides supplied but find strings did not match — title-only change)' : ''}`,
      })
      .select('*')
      .single();
    if (lpErr) {
      console.error('landing_pages insert failed:', lpErr);
    }

    // 7. Audit log
    await auditLog(
      sb,
      TOM_USER_ID,
      'product_cloned_draft',
      'shopify_product',
      newProductId,
      { source_handle: SOURCE_PRODUCT_HANDLE, source_id: sourceProductId, status: 'active' },
      { handle: newHandle, status: 'draft', title: body.target_name },
      'scheduled_agent',
      { variant_angle: body.variant_angle, changes_applied: appliedChanges, overrides_unmatched: overridesSuppliedButUnmatched, landing_page_id: lpRow?.id },
    );

    return NextResponse.json({
      success: true,
      landing_page_id: lpRow?.id ?? null,
      shopify_product_id: newProductId,
      shopify_handle: newHandle,
      preview_url: previewUrl,
      preview_url_admin: `https://${shopifyUrl}/admin/products/${newProductId}`,
      changes_applied: appliedChanges.length,
      overrides_supplied_but_unmatched: overridesSuppliedButUnmatched,
      title_was_overridden: true,
      product_status: 'draft',
      note: 'Product cloned in DRAFT status. Approve via platform_inbox UPDATE status=approved → process-approvals will set status=active (publishes to storefront).',
    });
  } catch (err) {
    console.error('clone-page error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
