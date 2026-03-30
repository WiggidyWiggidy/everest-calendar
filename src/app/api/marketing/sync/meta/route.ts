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

    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!metaToken || !adAccountId) {
      return NextResponse.json({
        error: 'Meta credentials not configured',
        missing: [!metaToken && 'META_ACCESS_TOKEN', !adAccountId && 'META_AD_ACCOUNT_ID'].filter(Boolean),
      }, { status: 400 });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Fetch account-level insights
    const insightsRes = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/insights?` +
      `fields=spend,impressions,clicks,ctr,cpm,cpc,actions,action_values,purchase_roas` +
      `&time_range={"since":"${dateStr}","until":"${dateStr}"}` +
      `&access_token=${metaToken}`
    );

    if (!insightsRes.ok) {
      const err = await insightsRes.text();
      return NextResponse.json({ error: 'Meta API error', detail: err }, { status: 500 });
    }

    const insightsData = await insightsRes.json();
    const insight = insightsData.data?.[0];

    // Parse actions for purchases
    const purchases = insight?.actions?.find((a: { action_type: string }) => a.action_type === 'purchase')?.value ?? 0;
    const purchaseValue = insight?.action_values?.find((a: { action_type: string }) => a.action_type === 'purchase')?.value ?? 0;
    const spend = parseFloat(insight?.spend ?? '0');
    const roas = spend > 0 ? parseFloat(purchaseValue) / spend : 0;

    // Use service client when authenticated via sync secret (no user session)
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();
    const userId = auth.userId || '174f2dff-7a96-464c-a919-b473c328d531';

    const { error: upsertError } = await supabase
      .from('marketing_metrics_daily')
      .upsert({
        user_id: userId,
        date: dateStr,
        meta_spend: spend,
        meta_impressions: parseInt(insight?.impressions ?? '0'),
        meta_clicks: parseInt(insight?.clicks ?? '0'),
        meta_ctr: parseFloat(insight?.ctr ?? '0'),
        meta_cpm: parseFloat(insight?.cpm ?? '0'),
        meta_cpc: parseFloat(insight?.cpc ?? '0'),
        meta_roas: roas,
        meta_purchases: parseInt(purchases),
        meta_cost_per_purchase: parseInt(purchases) > 0 ? spend / parseInt(purchases) : null,
        data_source: 'api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Recompute CPA if Shopify data already exists for this date
    const { data: row } = await supabase
      .from('marketing_metrics_daily')
      .select('shopify_revenue, customers_acquired')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .single();

    if (row?.customers_acquired && row.customers_acquired > 0 && spend > 0) {
      const cpa = spend / row.customers_acquired;
      const grossProfit = row.shopify_revenue ? row.shopify_revenue - spend : null;
      const profitPerCustomer = row.shopify_revenue
        ? (row.shopify_revenue - spend) / row.customers_acquired
        : null;

      await supabase
        .from('marketing_metrics_daily')
        .update({
          cpa,
          gross_profit: grossProfit,
          profit_per_customer: profitPerCustomer,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('date', dateStr);
    }

    return NextResponse.json({
      synced: true,
      date: dateStr,
      metrics: {
        spend,
        impressions: parseInt(insight?.impressions ?? '0'),
        clicks: parseInt(insight?.clicks ?? '0'),
        purchases: parseInt(purchases),
        roas,
      },
    });
  } catch (err) {
    console.error('sync/meta error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
