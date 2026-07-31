// /api/marketing/insights
// One-shot dashboard endpoint that aggregates Phase 2 + ICE Matrix data layers in one response:
//  - anomalies: detect_metric_anomalies() — which KPIs are drifting vs 60-day baseline
//  - next_experiments: prioritize_next_experiments() — ICE-scored top-5 next-test queue
//  - running_experiments: compute_significance() per running experiment — lift_pct + p_value
//  - top_friction: clarity_friction_elements top 5 rage-click offenders (URL-level, legacy)
//  - top_friction_sections: clarity_section_heatmap top friction sections (NEW, per-section)
//  - bottleneck: funnel_bottlenecks top row per KRYO LP — biggest gap vs benchmark
//  - proposed_lp_experiments: propose_lp_experiments() — ICE-scored hypotheses derived from
//    section friction + funnel bottleneck (the bridge from data to hypothesis)
//  - recent_learnings: hypothesis_learnings last 30 days — predicted vs actual lift calibration
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [
      anomaliesRes, nextExpRes, runningExpRes, frictionRes, adMetricsRes, lpFunnelRes,
      bottleneckRes, sectionFrictionRes, proposedRes, learningsRes,
      velocityRes, dctAssetsRes, dctPerfRes, fatigueRes,
    ] = await Promise.all([
      supabase.rpc('detect_metric_anomalies'),
      supabase.rpc('prioritize_next_experiments', { p_user_id: userId }),
      supabase.from('marketing_experiments')
        .select('id, name, type, target_metric, primary_metric, status, start_date, ice_impact, ice_confidence, ice_ease, ice_score, expected_lift_pct, hypothesis, execution_spec')
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
        .gte('date', sevenDaysAgo)
        .order('date', { ascending: false })
        .limit(50),
      supabase.from('lp_funnel_daily')
        .select('date, landing_page_id, sessions, add_to_carts, checkouts_started, orders, revenue, view_to_atc_rate, atc_to_checkout_rate, checkout_to_purchase_rate, overall_conversion_rate')
        .gte('date', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
        .order('date', { ascending: false })
        .limit(100),
      supabase.from('funnel_bottlenecks')
        .select('landing_page_id, lp_name, shopify_url, sessions_30d, funnel_step, actual_rate, benchmark_rate, gap_absolute, gap_pct_below_benchmark, gap_state')
        .order('gap_pct_below_benchmark', { ascending: false, nullsFirst: false })
        .limit(20),
      supabase.from('clarity_section_heatmap')
        .select('date, page_url, section_id, click_count, rage_click_count, dead_click_count, scroll_abandon_count, unique_sessions, landing_page_id')
        .gte('date', sevenDaysAgo)
        .order('rage_click_count', { ascending: false })
        .limit(20),
      supabase.rpc('propose_lp_experiments'),
      supabase.from('hypothesis_learnings')
        .select('id, experiment_id, predicted_lift_pct, actual_lift_pct, confidence_calibration_delta, source_insights, notes, recorded_at')
        .gte('recorded_at', thirtyDaysAgo)
        .order('recorded_at', { ascending: false })
        .limit(20),
      // Test velocity north-star metric (target 5 tests/week — tunable)
      supabase.rpc('get_test_velocity', { p_weekly_target: 5 }),
      // Dynamic Creative Testing — count of synced assets (sanity that DCT data is flowing)
      supabase.from('meta_creative_assets')
        .select('id', { count: 'exact', head: true }),
      // DCT performance — top assets by ROAS (will be empty until meta-dce sync writes here)
      supabase.from('meta_asset_performance_daily')
        .select('date, meta_ad_id, asset_type, asset_text, asset_image_url, spend, impressions, clicks, ctr, purchases, revenue, roas')
        .gte('date', sevenDaysAgo)
        .order('roas', { ascending: false, nullsFirst: false })
        .limit(10),
      // Fatigue signals per angle — informs creative rotation cadence
      supabase.from('vw_fatigue_signals')
        .select('angle, ctr_recent_14d, ctr_prior_14d, ctr_change_pct, impressions_recent_14d, fatigue_state'),
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

    // Pick the single biggest bottleneck across all KRYO LPs (skip rows with insufficient_data)
    const bottleneckRows = bottleneckRes.data ?? [];
    const top_bottleneck = bottleneckRows.find(
      (b: { gap_state: string; gap_pct_below_benchmark: number | null }) =>
        b.gap_state !== 'insufficient_data' && b.gap_state !== 'on_target',
    ) ?? null;

    return NextResponse.json({
      computed_at: new Date().toISOString(),
      anomalies: anomaliesRes.data ?? [],
      next_experiments: nextExpRes.data ?? [],
      running_experiments: runningEnriched,
      top_friction_elements: frictionRes.data ?? [],
      recent_ad_metrics: adMetricsRes.data ?? [],
      lp_funnel_recent: lpFunnelRes.data ?? [],
      // ── ICE Matrix layer ─────────────────────────────────────────────────
      bottleneck: top_bottleneck,
      bottlenecks_all: bottleneckRows,
      top_friction_sections: sectionFrictionRes.data ?? [],
      proposed_lp_experiments: proposedRes.data ?? [],
      recent_learnings: learningsRes.data ?? [],
      // ── Velocity layer (north-star) ──────────────────────────────────────
      velocity: velocityRes.data ?? null,
      // ── Dynamic Creative Testing layer ───────────────────────────────────
      dct: {
        assets_total: dctAssetsRes.count ?? 0,
        top_assets_7d: dctPerfRes.data ?? [],
        perf_data_present: (dctPerfRes.data ?? []).length > 0,
      },
      fatigue_signals: fatigueRes.data ?? [],
      errors: {
        anomalies: anomaliesRes.error?.message ?? null,
        next_experiments: nextExpRes.error?.message ?? null,
        running_experiments: runningExpRes.error?.message ?? null,
        friction: frictionRes.error?.message ?? null,
        ad_metrics: adMetricsRes.error?.message ?? null,
        lp_funnel: lpFunnelRes.error?.message ?? null,
        bottleneck: bottleneckRes.error?.message ?? null,
        section_friction: sectionFrictionRes.error?.message ?? null,
        proposed_lp_experiments: proposedRes.error?.message ?? null,
        recent_learnings: learningsRes.error?.message ?? null,
        velocity: velocityRes.error?.message ?? null,
        dct_assets: dctAssetsRes.error?.message ?? null,
        dct_perf: dctPerfRes.error?.message ?? null,
        fatigue: fatigueRes.error?.message ?? null,
      },
    });
  } catch (err) {
    console.error('insights error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
