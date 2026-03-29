import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PUT: Publish or unpublish a Shopify page
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { landing_page_id, published } = await request.json();
    if (!landing_page_id || typeof published !== 'boolean') {
      return NextResponse.json({ error: 'landing_page_id and published (boolean) required' }, { status: 400 });
    }

    const shopifyUrl = process.env.SHOPIFY_STORE_URL;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopifyUrl || !shopifyToken) {
      return NextResponse.json({ error: 'Shopify credentials not configured' }, { status: 400 });
    }

    // Get the landing page to find shopify_page_id
    const { data: page, error: pageError } = await supabase
      .from('landing_pages')
      .select('shopify_page_id, name')
      .eq('id', landing_page_id)
      .eq('user_id', user.id)
      .single();

    if (pageError || !page) {
      return NextResponse.json({ error: 'Landing page not found' }, { status: 404 });
    }
    if (!page.shopify_page_id) {
      return NextResponse.json({ error: 'No Shopify page linked. Create a draft first.' }, { status: 400 });
    }

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

    return NextResponse.json({
      published,
      status: newStatus,
      preview_url: previewUrl,
      admin_url: `https://${shopifyUrl}/admin/pages/${page.shopify_page_id}`,
    });
  } catch (err) {
    console.error('shopify/publish error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
