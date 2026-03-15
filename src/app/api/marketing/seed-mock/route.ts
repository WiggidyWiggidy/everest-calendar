import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function seeded(seed: number, min: number, max: number): number {
  // Deterministic pseudo-random based on seed
  const x = Math.sin(seed) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const dateStr = date.toISOString().split('T')[0];
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const wm = isWeekend ? 0.65 : 1.0; // weekend multiplier

      const seed = i * 7 + 13;

      const shopifyRevenue = Math.round(seeded(seed, 2000, 8000) * wm * 100) / 100;
      const shopifyOrders = Math.round(seeded(seed + 1, 8, 30) * wm);
      const shopifySessions = Math.round(seeded(seed + 2, 400, 1200) * wm);
      const metaCtr = Math.round(seeded(seed + 3, 0.007, 0.022) * 10000) / 10000; // 0.7%–2.2%
      const metaRoas = Math.round(seeded(seed + 4, 1.3, 4.5) * 100) / 100;
      const metaSpend = Math.round(seeded(seed + 5, 100, 500) * 100) / 100;
      const metaImpressions = Math.round(seeded(seed + 6, 15000, 60000));
      const metaClicks = Math.round(metaImpressions * metaCtr);
      const metaPurchases = Math.round(seeded(seed + 7, 3, 25));
      const gaSessions = Math.round(seeded(seed + 8, 450, 1400) * wm);
      const gaBounceRate = Math.round(seeded(seed + 9, 0.42, 0.82) * 10000) / 10000; // 42%–82%
      const addToCartRate = Math.round(seeded(seed + 10, 0.022, 0.055) * 10000) / 10000;
      const convRate = Math.round(seeded(seed + 11, 0.012, 0.038) * 10000) / 10000;
      const customersAcquired = Math.round(seeded(seed + 12, 4, 20) * wm);
      const grossProfit = Math.round(shopifyRevenue * 0.38 * 100) / 100;

      rows.push({
        user_id: user.id,
        date: dateStr,
        shopify_revenue: shopifyRevenue,
        shopify_orders: shopifyOrders,
        shopify_aov: Math.round((shopifyRevenue / Math.max(shopifyOrders, 1)) * 100) / 100,
        shopify_sessions: shopifySessions,
        shopify_conversion_rate: convRate,
        shopify_add_to_cart_rate: addToCartRate,
        shopify_checkout_rate: Math.round(seeded(seed + 13, 0.008, 0.025) * 10000) / 10000,
        meta_spend: metaSpend,
        meta_impressions: metaImpressions,
        meta_clicks: metaClicks,
        meta_ctr: metaCtr,
        meta_cpm: Math.round((metaSpend / metaImpressions * 1000) * 100) / 100,
        meta_cpc: Math.round((metaSpend / Math.max(metaClicks, 1)) * 100) / 100,
        meta_roas: metaRoas,
        meta_purchases: metaPurchases,
        meta_cost_per_purchase: Math.round((metaSpend / Math.max(metaPurchases, 1)) * 100) / 100,
        ga_sessions: gaSessions,
        ga_users: Math.round(gaSessions * 0.82),
        ga_new_users: Math.round(gaSessions * 0.61),
        ga_bounce_rate: gaBounceRate,
        ga_avg_session_duration: Math.round(seeded(seed + 14, 70, 240)),
        ga_conversion_rate: convRate,
        clarity_engagement_score: Math.round(seeded(seed + 15, 35, 75) * 100) / 100,
        clarity_rage_clicks: Math.round(seeded(seed + 16, 0, 40)),
        clarity_dead_clicks: Math.round(seeded(seed + 17, 0, 70)),
        clarity_avg_scroll_depth: Math.round(seeded(seed + 18, 32, 72) * 100) / 100,
        customers_acquired: customersAcquired,
        gross_profit: grossProfit,
        profit_per_customer: Math.round((grossProfit / Math.max(customersAcquired, 1)) * 100) / 100,
        data_source: 'mock',
      });
    }

    const { error } = await supabase
      .from('marketing_metrics_daily')
      .upsert(rows, { onConflict: 'user_id,date' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, rows_seeded: rows.length });
  } catch (err) {
    console.error('marketing/seed-mock error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
