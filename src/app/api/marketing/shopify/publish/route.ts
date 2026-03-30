import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { snapshotShopifyPage, auditLog, checkThrottle, recordThrottle } from '@/lib/marketing-safety';

// PUT: Publish or unpublish a Shopify page
// SAFETY: Snapshots page state before change, audit logs after, throttle-checked
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { landing_page_id, published } = await request.json();
    if (!landing_page_id || typeof published !== 'boolean') {
      return NextResponse.json({ error: 'landing_page_id and published (boolean) required' }, { status: 400 });
    }

    let shopifyUrl: string;
    let shopifyToken: string;
    try {
      shopifyUrl = getShopifyStoreUrl();
      shopifyToken = await getShopifyToken();
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    // Throttle check
    const actionType = published ? 'page_publish' : 'page_unpublish';
    const throttle = await checkThrottle(supabase, user.id, actionType);
    if (!throttle.allowed) {
      return NextResponse.json({
        error: `Daily ${actionType} limit reached (${throttle.count}/${throttle.limit}). Try again tomorrow.`,
      }, { status: 429 });
    }

    // Get the landing page to find shopify_page_id
    const { data: page, error: pageError } = await supabase
      .from('landing_pages')
      .select('shopify_page_id, name, status')
      .eq('id', landing_page_id)
      .eq('user_id', user.id)
      .single();

    if (pageError || !page) {
      return NextResponse.json({ error: 'Landing page not found' }, { status: 404 });
    }
    if (!page.shopify_page_id) {
      return NextResponse.json({ error: 'No Shopify page linked. Create a draft first.' }, { status: 400 });
    }

    // SAFETY: Snapshot the current Shopify page state before any modification
    const snapshotId = await snapshotShopifyPage(
      supabase, user.id, page.shopify_page_id, shopifyUrl, shopifyToken,
      published ? 'pre_publish' : 'pre_unpublish'
    );

    const beforeState = { status: page.status, published: !published, shopify_page_id: page.shopify_page_id };

    // Update Shopify page published status
    const shopifyRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/pages/${page.shopify_page_id}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyToken,
        },
        body: JSON.stringify({
          page: {
            id: parseInt(page.shopify_page_id),
            published: published,
          },
        }),
      }
    );

    if (!shopifyRes.ok) {
      const err = await shopifyRes.text();
      return NextResponse.json({ error: 'Shopify API error: ' + shopifyRes.status, detail: err }, { status: 500 });
    }

    // Update local status
    const newStatus = published ? 'monitoring' : 'paused';
    await supabase
      .from('landing_pages')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', landing_page_id)
      .eq('user_id', user.id);

    const shopifyData = await shopifyRes.json();
    const handle = shopifyData.page?.handle;
    const previewUrl = handle ? `https://${shopifyUrl}/pages/${handle}` : null;

    const afterState = { status: newStatus, published, shopify_page_id: page.shopify_page_id };

    // SAFETY: Audit log + throttle record
    await auditLog(
      supabase, user.id,
      published ? 'page_published' : 'page_unpublished',
      'landing_page', landing_page_id, beforeState, afterState, 'user',
      { snapshot_id: snapshotId, page_name: page.name }
    );
    await recordThrottle(supabase, user.id, actionType);

    return NextResponse.json({
      published,
      status: newStatus,
      preview_url: previewUrl,
      admin_url: `https://${shopifyUrl}/admin/pages/${page.shopify_page_id}`,
      safety: { snapshot_id: snapshotId, throttle: `${throttle.count + 1}/${throttle.limit}` },
    });
  } catch (err) {
    console.error('shopify/publish error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
