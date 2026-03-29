import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function authenticateSync(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, userId: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, userId: user.id };
  return { authenticated: false, userId: null };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shopifyUrl = process.env.SHOPIFY_STORE_URL;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopifyUrl || !shopifyToken) {
      return NextResponse.json({
        error: 'Shopify credentials not configured',
        missing: [!shopifyUrl && 'SHOPIFY_STORE_URL', !shopifyToken && 'SHOPIFY_ACCESS_TOKEN'].filter(Boolean),
      }, { status: 400 });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Fetch orders from yesterday
    const ordersRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/orders.json?created_at_min=${dateStr}T00:00:00&created_at_max=${dateStr}T23:59:59&status=any&limit=250`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );

    if (!ordersRes.ok) {
      const err = await ordersRes.text();
      return NextResponse.json({ error: 'Shopify API error', detail: err }, { status: 500 });
    }

    const ordersData = await ordersRes.json();
    const orders = ordersData.orders ?? [];

    // Calculate metrics
    const revenue = orders.reduce((sum: number, o: { total_price: string }) => sum + parseFloat(o.total_price || '0'), 0);
    const orderCount = orders.length;
    const aov = orderCount > 0 ? revenue / orderCount : 0;

    // Upsert into marketing_metrics_daily using service client
    const supabase = await createClient();

    // Get user ID - for sync secret auth, get first user (single-tenant)
    let userId = auth.userId;
    if (!userId) {
      const { data: users } = await supabase.from('marketing_metrics_daily').select('user_id').limit(1);
      userId = users?.[0]?.user_id;
      if (!userId) {
        return NextResponse.json({ error: 'No user found for metrics' }, { status: 400 });
      }
    }

    const { error: upsertError } = await supabase
      .from('marketing_metrics_daily')
      .upsert({
        user_id: userId,
        date: dateStr,
        shopify_revenue: revenue,
        shopify_orders: orderCount,
        shopify_aov: aov,
        data_source: 'api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      synced: true,
      date: dateStr,
      metrics: { revenue, orders: orderCount, aov },
    });
  } catch (err) {
    console.error('sync/shopify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
