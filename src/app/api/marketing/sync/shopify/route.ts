import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

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

    let shopifyUrl: string;
    let shopifyToken: string;
    try {
      shopifyUrl = getShopifyStoreUrl();
      shopifyToken = await getShopifyToken();
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    // Accept optional date from request body, default to yesterday
    let dateStr: string;
    try {
      const body = await request.json().catch(() => ({}));
      dateStr = body.date || '';
    } catch { dateStr = ''; }
    if (!dateStr) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateStr = yesterday.toISOString().split('T')[0];
    }

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

    // Count unique customers (by email) as customers_acquired
    const uniqueEmails = new Set(
      orders
        .map((o: { email?: string }) => o.email?.toLowerCase())
        .filter(Boolean)
    );
    const customersAcquired = uniqueEmails.size;

    // Use service client when authenticated via sync secret (no user session)
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();
    const userId = auth.userId || '174f2dff-7a96-464c-a919-b473c328d531';

    const { error: upsertError } = await supabase
      .from('marketing_metrics_daily')
      .upsert({
        user_id: userId,
        date: dateStr,
        shopify_revenue: revenue,
        shopify_orders: orderCount,
        shopify_aov: aov,
        customers_acquired: customersAcquired,
        data_source: 'api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Compute CPA and profit metrics if Meta spend exists for this date
    const { data: row } = await supabase
      .from('marketing_metrics_daily')
      .select('meta_spend, customers_acquired, shopify_revenue')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .single();

    if (row?.meta_spend && row.customers_acquired && row.customers_acquired > 0) {
      const cpa = row.meta_spend / row.customers_acquired;
      const profitPerCustomer = row.shopify_revenue && row.customers_acquired > 0
        ? (row.shopify_revenue - row.meta_spend) / row.customers_acquired
        : null;
      const grossProfit = row.shopify_revenue ? row.shopify_revenue - row.meta_spend : null;

      // Get prior 7-day avg revenue for growth rate
      const { data: priorRows } = await supabase
        .from('marketing_metrics_daily')
        .select('shopify_revenue')
        .eq('user_id', userId)
        .gte('date', new Date(Date.now() - 8 * 86400000).toISOString().split('T')[0])
        .lt('date', dateStr)
        .order('date', { ascending: false });

      let salesGrowthRate = null;
      if (priorRows && priorRows.length > 0) {
        const priorAvg = priorRows.reduce((s, r) => s + (r.shopify_revenue || 0), 0) / priorRows.length;
        if (priorAvg > 0) {
          salesGrowthRate = ((revenue - priorAvg) / priorAvg) * 100;
        }
      }

      await supabase
        .from('marketing_metrics_daily')
        .update({
          cpa,
          profit_per_customer: profitPerCustomer,
          gross_profit: grossProfit,
          sales_growth_rate: salesGrowthRate,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('date', dateStr);
    }

    return NextResponse.json({
      synced: true,
      date: dateStr,
      metrics: { revenue, orders: orderCount, aov, customers_acquired: customersAcquired },
    });
  } catch (err) {
    console.error('sync/shopify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
