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
  overrides?: Array<{ find: string; replace: string; reason?: string }>;
  body_html_full_replace?: string;
  hypothesis?: string;
  experiment_id?: string;
  // v2 default: clone ACTIVE and publish to all storefront publications/markets so the URL works
  // immediately from any geo. Tom can review the live URL + screenshots; if QC catches a problem
  // the slash command archives the product. v1 keeps the legacy DRAFT behaviour for safety.
  publish_active?: boolean;
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

    // 2. Compute the variant body_html.
    // Two modes: (a) full replace from composed premium sections, or (b) find/replace overrides.
    let variantBodyHtml = sourceBodyHtml;
    const appliedChanges: Array<{ find: string; replace: string; reason?: string }> = [];
    let fullReplaceApplied = false;
    if (typeof body.body_html_full_replace === 'string' && body.body_html_full_replace.length > 0) {
      variantBodyHtml = body.body_html_full_replace;
      fullReplaceApplied = true;
    } else if (body.overrides?.length) {
      for (const o of body.overrides) {
        if (variantBodyHtml.includes(o.find)) {
          variantBodyHtml = variantBodyHtml.split(o.find).join(o.replace);
          appliedChanges.push(o);
        }
      }
    }
    // If overrides supplied but none matched, soft-warn (not 422) — title still gets the new value, which IS the H1.
    const overridesSuppliedButUnmatched = !fullReplaceApplied && (body.overrides?.length ?? 0) > 0 && appliedChanges.length === 0;

    // 3. Duplicate via Shopify's GraphQL productDuplicate mutation.
    // v2 (publish_active=true): clone ACTIVE and publish to all publications below.
    // v1 (publish_active absent): clone DRAFT (legacy behaviour preserved).
    const newStatus = body.publish_active ? 'ACTIVE' : 'DRAFT';
    const gqlRes = await fetch(
      `https://${shopifyUrl}/admin/api/2025-04/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Shopify-Access-Token': shopifyToken,
        },
        body: JSON.stringify({
          query: `
            mutation Duplicate($productId: ID!, $newTitle: String!, $newStatus: ProductStatus, $includeImages: Boolean) {
              productDuplicate(
                productId: $productId,
                newTitle: $newTitle,
                newStatus: $newStatus,
                includeImages: $includeImages
              ) {
                newProduct { id handle title status }
                userErrors { field message }
              }
            }
          `,
          variables: {
            productId: `gid://shopify/Product/${sourceProductId}`,
            newTitle: body.target_name,
            newStatus,
            includeImages: true,
          },
        }),
      }
    );
    if (!gqlRes.ok) {
      return NextResponse.json({
        error: `Shopify GraphQL productDuplicate HTTP ${gqlRes.status}`,
        detail: await gqlRes.text().catch(() => ''),
      }, { status: 502 });
    }
    const gqlPayload = await gqlRes.json();
    const userErrors = gqlPayload?.data?.productDuplicate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return NextResponse.json({
        error: 'productDuplicate userErrors',
        detail: userErrors,
      }, { status: 502 });
    }
    if (gqlPayload?.errors) {
      return NextResponse.json({
        error: 'productDuplicate GraphQL errors',
        detail: gqlPayload.errors,
      }, { status: 502 });
    }
    const newProduct = gqlPayload?.data?.productDuplicate?.newProduct;
    if (!newProduct?.id) {
      return NextResponse.json({
        error: 'productDuplicate response missing newProduct',
        detail: JSON.stringify(gqlPayload).slice(0, 500),
      }, { status: 502 });
    }
    // Convert GID like 'gid://shopify/Product/123456' to numeric '123456' for REST follow-up calls
    const dup = {
      id: newProduct.id.replace(/^gid:\/\/shopify\/Product\//, ''),
      handle: newProduct.handle,
      title: newProduct.title,
    };
    if (!dup.id) {
      return NextResponse.json({ error: 'Shopify duplicate response missing product id', detail: JSON.stringify(gqlPayload).slice(0, 500) }, { status: 502 });
    }
    const newProductId: string = String(dup.id);
    const newProductGid = `gid://shopify/Product/${newProductId}`;
    const newHandle: string = dup.handle;

    // 3b. (v2 only) Publish to ALL publications. Without this, the new product inherits the
    //     source product's market visibility — which for kryo_ is UAE-only, returning 404 to
    //     traffic from any other country including China where Tom is. This is what fixes
    //     the geo-access problem WITHOUT needing Shopify Plus / staff preview URLs.
    let publicationsPublished: Array<{ id: string; name: string }> = [];
    if (body.publish_active) {
      const pubsRes = await fetch(
        `https://${shopifyUrl}/admin/api/2025-04/graphql.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
          body: JSON.stringify({
            query: `query { publications(first: 25) { edges { node { id name } } } }`,
          }),
        }
      );
      const pubsPayload = await pubsRes.json().catch(() => ({}));
      const publications: Array<{ id: string; name: string }> =
        pubsPayload?.data?.publications?.edges?.map((e: { node: { id: string; name: string } }) => e.node) ?? [];

      if (publications.length > 0) {
        const publishRes = await fetch(
          `https://${shopifyUrl}/admin/api/2025-04/graphql.json`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
            body: JSON.stringify({
              query: `
                mutation Publish($id: ID!, $input: [PublicationInput!]!) {
                  publishablePublish(id: $id, input: $input) {
                    publishable { ... on Product { id status } }
                    userErrors { field message }
                  }
                }
              `,
              variables: {
                id: newProductGid,
                input: publications.map((p) => ({ publicationId: p.id })),
              },
            }),
          }
        );
        const publishPayload = await publishRes.json().catch(() => ({}));
        const publishErrors = publishPayload?.data?.publishablePublish?.userErrors ?? [];
        if (publishErrors.length > 0) {
          console.warn('publishablePublish userErrors (non-fatal, page may be geo-restricted):', publishErrors);
        }
        publicationsPublished = publications;
      }
    }

    // 4. If we have applied changes (find/replace OR full replace), PATCH the duplicate's body_html.
    if (appliedChanges.length > 0 || fullReplaceApplied) {
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

    // 6. Insert into landing_pages. v2 publish_active=true → status='testing' (active product, ready for QC + inbox).
    //    v1 (publish_active absent) → status='testing' too — the v1 flow approves drafts via process-approvals.
    const { data: lpRow, error: lpErr } = await sb
      .from('landing_pages')
      .insert({
        user_id: TOM_USER_ID,
        name: body.target_name,
        shopify_url: previewUrl,
        shopify_page_id: newProductId,
        status: 'testing',
        page_type: 'product',
        parent_page_id: parentPage?.id ?? null,
        variant_angle: body.variant_angle,
        experiment_id: body.experiment_id ?? null,
        notes: `Duplicated from /products/${SOURCE_PRODUCT_HANDLE} on ${new Date().toISOString().split('T')[0]}. ${body.hypothesis ? 'Hypothesis: ' + body.hypothesis : ''} Title override: yes. Body overrides applied: ${appliedChanges.length}.${overridesSuppliedButUnmatched ? ' (overrides supplied but find strings did not match — title-only change)' : ''}${body.publish_active ? ` [v2: published ACTIVE to ${publicationsPublished.length} publication(s)]` : ' [v1: DRAFT pending approval]'}`,
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
      { variant_angle: body.variant_angle, changes_applied: appliedChanges, overrides_unmatched: overridesSuppliedButUnmatched, full_replace_applied: fullReplaceApplied, body_html_bytes: variantBodyHtml.length, landing_page_id: lpRow?.id },
    );

    return NextResponse.json({
      success: true,
      landing_page_id: lpRow?.id ?? null,
      shopify_product_id: newProductId,
      shopify_handle: newHandle,
      preview_url: previewUrl,                                  // Public storefront URL — works for v2 (active+all publications) from any geo
      preview_url_admin: `https://${shopifyUrl}/admin/products/${newProductId}`,
      changes_applied: appliedChanges.length,
      full_replace_applied: fullReplaceApplied,
      body_html_bytes: variantBodyHtml.length,
      overrides_supplied_but_unmatched: overridesSuppliedButUnmatched,
      title_was_overridden: true,
      product_status: newStatus.toLowerCase(),
      publications_published: publicationsPublished,
      note: body.publish_active
        ? `Product cloned ACTIVE and published to ${publicationsPublished.length} publication(s). preview_url is reachable from any geo. Run QC + inbox-write next.`
        : 'Product cloned in DRAFT. Approve via platform_inbox UPDATE status=approved → process-approvals will set status=active (publishes to storefront).',
    });
  } catch (err) {
    console.error('clone-page error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
