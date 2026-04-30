// /api/marketing/launch/clone-page
// Duplicates the canonical KRYO winning product page (handle: kryo_) as a NEW draft Shopify Page,
// applies skill-supplied section overrides, and records to landing_pages with parent_page_id linkage.
//
// Caller: the /launch-kryo Claude Code skill (free OAuth LLM, no API key needed for copy gen).
// Auth: x-sync-secret header (reuses existing MARKETING_SYNC_SECRET) — no Supabase user required.
// Safety: page is created with published=false; calls enforceDraft() to belt-and-suspenders.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { enforceDraft, auditLog } from '@/lib/marketing-safety';

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
  target_name: string;            // e.g. "KRYO Variant A — Morning Energy"
  target_handle?: string;         // optional, Shopify auto-generates from title if omitted
  // Optional whole-HTML payload from the skill (preferred path — skill writes the variant locally via free OAuth)
  body_html?: string;
  // OR find/replace overrides applied to source kryo_ product body_html
  overrides?: Array<{ find: string; replace: string; reason?: string }>;
  hypothesis?: string;            // for inbox metadata
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

    // 1. Pull source product body_html via Shopify Admin API
    const productRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/products.json?handle=${SOURCE_PRODUCT_HANDLE}`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );
    if (!productRes.ok) {
      return NextResponse.json({
        error: `Shopify GET product failed: ${productRes.status}`,
        detail: await productRes.text().catch(() => ''),
      }, { status: 502 });
    }
    const productPayload = await productRes.json();
    const sourceProduct = productPayload.products?.[0];
    if (!sourceProduct) {
      return NextResponse.json({ error: `Source product handle '${SOURCE_PRODUCT_HANDLE}' not found in Shopify` }, { status: 404 });
    }
    const sourceHtml: string = sourceProduct.body_html ?? '';
    if (!sourceHtml || sourceHtml.length < 500) {
      return NextResponse.json({
        error: 'Source product body_html is empty or too short to clone',
        bytes: sourceHtml.length,
      }, { status: 422 });
    }

    // 2. Build variant body_html from skill payload OR overrides
    let variantHtml = sourceHtml;
    const appliedChanges: Array<{ find: string; replace: string; reason?: string }> = [];

    if (body.body_html && body.body_html.length > 500) {
      variantHtml = body.body_html;
    } else if (body.overrides?.length) {
      for (const o of body.overrides) {
        if (variantHtml.includes(o.find)) {
          variantHtml = variantHtml.split(o.find).join(o.replace);
          appliedChanges.push(o);
        }
      }
      if (appliedChanges.length === 0) {
        return NextResponse.json({
          error: 'None of the supplied overrides matched the source HTML. Check find strings.',
        }, { status: 422 });
      }
    }
    // If neither body_html nor overrides supplied, we still create a control-clone draft (useful for testing).

    // 3. Create new draft Shopify Page (published=false enforced via enforceDraft helper)
    const pagePayload = enforceDraft({
      title: body.target_name,
      body_html: variantHtml,
      handle: body.target_handle,
      published: false,
      template_suffix: null,
    });

    const createRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/pages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyToken,
        },
        body: JSON.stringify({ page: pagePayload }),
      }
    );
    if (!createRes.ok) {
      return NextResponse.json({
        error: `Shopify POST page failed: ${createRes.status}`,
        detail: await createRes.text().catch(() => ''),
      }, { status: 502 });
    }
    const createdPayload = await createRes.json();
    const created = createdPayload.page;
    const newPageId: string = String(created.id);
    const newHandle: string = created.handle;
    const previewUrl = `https://${shopifyUrl}/pages/${newHandle}`;

    // 4. Find canonical control row in landing_pages (the parent for this variant)
    const sb = svcClient();
    const { data: parentPage } = await sb
      .from('landing_pages')
      .select('id')
      .eq('user_id', TOM_USER_ID)
      .eq('shopify_url', `https://${shopifyUrl}/products/${SOURCE_PRODUCT_HANDLE}`)
      .eq('variant_angle', 'control')
      .maybeSingle();

    // 5. Insert into landing_pages
    const { data: lpRow, error: lpErr } = await sb
      .from('landing_pages')
      .insert({
        user_id: TOM_USER_ID,
        name: body.target_name,
        shopify_url: previewUrl,
        shopify_page_id: newPageId,
        status: 'testing',
        page_type: 'page',
        parent_page_id: parentPage?.id ?? null,
        variant_angle: body.variant_angle,
        notes: `Cloned from /products/${SOURCE_PRODUCT_HANDLE} on ${new Date().toISOString().split('T')[0]}. ${body.hypothesis ? 'Hypothesis: ' + body.hypothesis : ''} Changes: ${appliedChanges.length} applied.`,
      })
      .select('*')
      .single();
    if (lpErr) {
      console.error('landing_pages insert failed:', lpErr);
      // Page was created on Shopify but DB record failed — log warning, don't 500
    }

    // 6. Audit log
    await auditLog(
      sb,
      TOM_USER_ID,
      'page_cloned_draft',
      'shopify_page',
      newPageId,
      null,
      { handle: newHandle, published: false, source_handle: SOURCE_PRODUCT_HANDLE },
      'scheduled_agent',
      { variant_angle: body.variant_angle, changes_applied: appliedChanges, landing_page_id: lpRow?.id },
    );

    return NextResponse.json({
      success: true,
      landing_page_id: lpRow?.id ?? null,
      shopify_page_id: newPageId,
      shopify_handle: newHandle,
      preview_url: previewUrl,
      changes_applied: appliedChanges.length,
      published: false,
      note: 'Draft created. Approve via /inbox or platform_inbox UPDATE status=approved → process-approvals will publish.',
    });
  } catch (err) {
    console.error('clone-page error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
