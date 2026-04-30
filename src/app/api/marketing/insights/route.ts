// /api/marketing/insights
// One-shot dashboard endpoint that aggregates Phase 2 data layers in a single response:
//  - anomalies: detect_metric_anomalies() — which KPIs are drifting vs 60-day baseline
//  - next_experiments: prioritize_next_experiments() — ICE-scored top-5 next-test queue
//  - running_experiments: compute_significance() per running experiment — lift_pct + p_value
//  - top_friction: clarity_friction_elements top 5 rage-click offenders
//  - recent_ad_metrics: ad_metrics_daily last 7 days, channel-agnostic
//  - lp_funnel_recent: lp_funnel_daily last 14 days for the canonical control LP
//
// Auth: standard Supabase user session (this is read-only dashboard data).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

export async function GET(request: NextRequest) {
  void request;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = user.id || TOM_USER_ID;

    const [anomaliesRes, nextExpRes, runningExpRes, frictionRes, adMetricsRes, lpFunnelRes] = await Promise.all([
      supabase.rpc('detect_metric_anomalies'),
      supabase.rpc('prioritize_next_experiments', { p_user_id: userId }),
      supabase.from('marketing_experiments')
        .select('id, name, type, target_metric, primary_metric, status, start_date, ice_score, expected_lift_pct')
        .eq('user_id', userId)
        .eq('status', 'running')
        .order('ice_score', { ascending: false }),
      supabase.from('clarity_friction_elements')
        .select('date, page_url, rage_click_count, dead_click_count, rage_click_zscore, landing_page_id')
        .eq('is_top_offender', true)
        .order('date', { ascending: false })
        .order('rage_click_count', { ascending: false })
        .limit(10),
      supabase.from('ad_metrics_daily')
        .select('date, channel, channel_ad_id, channel_campaign_id, spend, impressions, clicks, attributed_orders, attributed_revenue, attributed_cpa, attributed_roas')
        .gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
        .order('date', { ascending: false })
        .limit(50),
      supabase.from('lp_funnel_daily')
        .select('date, landing_page_id, sessions, add_to_carts, checkouts_started, orders, revenue, view_to_atc_rate, atc_to_checkout_rate, checkout_to_purchase_rate, overall_conversion_rate')
        .gte('date', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
        .order('date', { ascending: false })
        .limit(100),
    ]);

    // For each running experiment, fire compute_significance in parallel
    const runningExperiments = runningExpRes.data ?? [];
    const sigResults = await Promise.all(
      runningExperiments.map(async (e: { id: string }) => {
        const { data } = await supabase.rpc('compute_significance', { p_experiment_id: e.id });
        return { experiment_id: e.id, significance: (data?.[0] ?? null) };
      }),
    );
    const sigByExp = new Map(sigResults.map(r => [r.experiment_id, r.significance]));
    const runningEnriched = runningExperiments.map((e: { id: string }) => ({
      ...e,
      significance: sigByExp.get(e.id) ?? null,
    }));

    return NextResponse.json({
      computed_at: new Date().toISOString(),
      anomalies: anomaliesRes.data ?? [],
      next_experiments: nextExpRes.data ?? [],
      running_experiments: runningEnriched,
      top_friction_elements: frictionRes.data ?? [],
      recent_ad_metrics: adMetricsRes.data ?? [],
      lp_funnel_recent: lpFunnelRes.data ?? [],
      errors: {
        anomalies: anomaliesRes.error?.message ?? null,
        next_experiments: nextExpRes.error?.message ?? null,
        running_experiments: runningExpRes.error?.message ?? null,
        friction: frictionRes.error?.message ?? null,
        ad_metrics: adMetricsRes.error?.message ?? null,
        lp_funnel: lpFunnelRes.error?.message ?? null,
      },
    });
  } catch (err) {
    console.error('insights error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
