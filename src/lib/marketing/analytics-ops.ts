import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { buildKryoCleanScorecard } from '@/lib/marketing/kryo-clean-scorecard';
import { buildKryoDailySummary } from '@/lib/marketing/kryo-daily-summary';

export type AnalyticsMode = 'sentinel' | 'hot' | 'cold' | 'backfill';
export type AnalyticsTrustState = 'fresh' | 'degraded' | 'stale' | 'partial';

export type AnalyticsFreshness = {
  scheduler_source: 'launchd' | 'vercel_daily' | 'manual';
  last_sentinel_sync_at: string | null;
  last_hot_sync_at: string | null;
  last_cold_sync_at: string | null;
  hot_data_fresh_until: string | null;
  cold_data_fresh_until: string | null;
  trust_state: AnalyticsTrustState;
  stale_reason: string | null;
  latest_job_status: Record<string, unknown> | null;
};

type JobRegistryRow = {
  job_key: string;
  lane: AnalyticsMode;
  scheduler_source: 'launchd' | 'vercel_daily' | 'manual';
  expected_interval_minutes: number | null;
};

type JobRunRow = {
  id: string;
  job_key: string;
  status: 'started' | 'success' | 'warning' | 'failed' | 'skipped';
  started_at: string;
  finished_at: string | null;
  stale_gap_minutes: number | null;
  summary: Record<string, unknown> | null;
  error_text: string | null;
};

const JOB_KEYS: Record<Exclude<AnalyticsMode, 'backfill'>, string> = {
  sentinel: 'kryo_analytics_sentinel',
  hot: 'kryo_analytics_hot',
  cold: 'kryo_analytics_cold',
};

function toIsoFromMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getJobRegistry(supabase: SupabaseClient, jobKey: string): Promise<JobRegistryRow | null> {
  const { data, error } = await supabase
    .from('analytics_job_registry')
    .select('job_key,lane,scheduler_source,expected_interval_minutes')
    .eq('job_key', jobKey)
    .maybeSingle();
  if (error) return null;
  return (data as JobRegistryRow | null) ?? null;
}

export async function getLatestJobRun(supabase: SupabaseClient, jobKey: string): Promise<JobRunRow | null> {
  const { data, error } = await supabase
    .from('analytics_job_runs')
    .select('id,job_key,status,started_at,finished_at,stale_gap_minutes,summary,error_text')
    .eq('job_key', jobKey)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as JobRunRow | null) ?? null;
}

export async function isJobDue(supabase: SupabaseClient, jobKey: string) {
  const registry = await getJobRegistry(supabase, jobKey);
  if (!registry) return { due: true, staleGapMinutes: null, registry: null };
  const latest = await getLatestJobRun(supabase, jobKey);
  if (!latest?.started_at || !registry.expected_interval_minutes) {
    return { due: true, staleGapMinutes: null, registry };
  }
  const started = parseDate(latest.started_at);
  if (!started) return { due: true, staleGapMinutes: null, registry };
  const ageMinutes = Math.floor((Date.now() - started.getTime()) / 60_000);
  const staleGapMinutes = Math.max(0, ageMinutes - registry.expected_interval_minutes);
  return {
    due: ageMinutes >= registry.expected_interval_minutes,
    staleGapMinutes: staleGapMinutes > 0 ? staleGapMinutes : null,
    registry,
  };
}

export async function startJobRun(
  supabase: SupabaseClient,
  jobKey: string,
  lane: AnalyticsMode,
  schedulerSource: 'launchd' | 'vercel_daily' | 'manual',
  requestedMode: AnalyticsMode,
  staleGapMinutes: number | null,
) {
  const { data, error } = await supabase
    .from('analytics_job_runs')
    .insert({
      job_key: jobKey,
      lane,
      scheduler_source: schedulerSource,
      status: 'started',
      requested_mode: requestedMode,
      stale_gap_minutes: staleGapMinutes,
    })
    .select('id,started_at')
    .single();
  if (error) {
    return { id: `in-memory-${Date.now()}`, started_at: new Date().toISOString() };
  }
  return data as { id: string; started_at: string };
}


export async function finishJobRun(
  supabase: SupabaseClient,
  runId: string,
  status: 'success' | 'warning' | 'failed' | 'skipped',
  startedAt: string,
  summary: Record<string, unknown>,
  errorText?: string | null,
) {
  const started = parseDate(startedAt);
  const durationMs = started ? Math.max(0, Date.now() - started.getTime()) : null;
  const { error } = await supabase
    .from('analytics_job_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      summary,
      error_text: errorText ?? null,
    })
    .eq('id', runId);
  if (error) return;
}


export async function getAnalyticsFreshness(supabase: SupabaseClient): Promise<AnalyticsFreshness> {
  const latestStatuses = await Promise.all([
    getLatestJobRun(supabase, JOB_KEYS.sentinel),
    getLatestJobRun(supabase, JOB_KEYS.hot),
    getLatestJobRun(supabase, JOB_KEYS.cold),
  ]);
  const [sentinel, hot, cold] = latestStatuses;
  const hotAt = hot?.finished_at ?? hot?.started_at ?? null;
  const coldAt = cold?.finished_at ?? cold?.started_at ?? null;
  const sentinelAt = sentinel?.finished_at ?? sentinel?.started_at ?? null;
  const hotDate = parseDate(hotAt);
  const coldDate = parseDate(coldAt);
  const now = Date.now();

  let trustState: AnalyticsTrustState = 'partial';
  let staleReason: string | null = null;

  if (!hotDate && !coldDate) {
    trustState = 'stale';
    staleReason = 'no_hot_or_cold_sync_recorded';
  } else if (hotDate && now - hotDate.getTime() <= 2 * 60 * 60 * 1000) {
    trustState = 'fresh';
  } else if (hotDate && now - hotDate.getTime() <= 6 * 60 * 60 * 1000) {
    trustState = 'degraded';
    staleReason = 'hot_sync_older_than_2h';
  } else if (coldDate && now - coldDate.getTime() <= 36 * 60 * 60 * 1000) {
    trustState = 'partial';
    staleReason = 'hot_sync_stale_using_cold_sync';
  } else {
    trustState = 'stale';
    staleReason = 'cold_sync_older_than_36h';
  }

  let latestJobStatus: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.rpc('get_latest_analytics_job_status');
    latestJobStatus = (data as Record<string, unknown> | null) ?? null;
  } catch {
    latestJobStatus = null;
  }

  return {
    scheduler_source: hotAt ? 'launchd' : coldAt ? 'vercel_daily' : 'manual',
    last_sentinel_sync_at: sentinelAt,
    last_hot_sync_at: hotAt,
    last_cold_sync_at: coldAt,
    hot_data_fresh_until: hotAt ? toIsoFromMinutes(120) : null,
    cold_data_fresh_until: coldAt ? new Date(new Date(coldAt).getTime() + 36 * 60 * 60 * 1000).toISOString() : null,
    trust_state: trustState,
    stale_reason: staleReason,
    latest_job_status: latestJobStatus,
  };
}

export async function persistOperatorSnapshots(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  freshness: AnalyticsFreshness,
) {
  const generatedAt = new Date().toISOString();
  try {
    await supabase.from('kryo_operator_snapshot_current').upsert({
    snapshot_key: 'AE:kryo2',
    market: 'AE',
    product_handle: 'kryo2',
    payload,
    trust_state: freshness.trust_state,
    stale_reason: freshness.stale_reason,
    scheduler_source: freshness.scheduler_source,
    generated_at: generatedAt,
  }, { onConflict: 'snapshot_key' });

    await supabase.from('kryo_operator_snapshot_daily').upsert({
    snapshot_date: new Date().toISOString().slice(0, 10),
    market: 'AE',
    product_handle: 'kryo2',
    payload,
    trust_state: freshness.trust_state,
    stale_reason: freshness.stale_reason,
    scheduler_source: freshness.scheduler_source,
    generated_at: generatedAt,
  }, { onConflict: 'snapshot_date' });
  } catch {
    return;
  }
}


export async function buildOperatorPacket(supabase: SupabaseClient, opts?: { windowDays?: number; compareDays?: number; reportTimeZone?: string; }) {
  const windowDays = opts?.windowDays ?? 5;
  const compareDays = opts?.compareDays ?? 5;
  const reportTimeZone = opts?.reportTimeZone ?? 'Asia/Dubai';
  const [scorecard, dailySummary, freshness, testBoardRes, metricGapRes, changesRes, readoutsRes] = await Promise.all([
    buildKryoCleanScorecard(supabase, { windowDays, compareDays, reportTimeZone }),
    buildKryoDailySummary(supabase, { reportTimeZone }),
    getAnalyticsFreshness(supabase),
    supabase.rpc('get_kryo_test_board', { p_market: 'AE', p_product_handle: 'kryo2' }),
    supabase.from('metric_gap_daily').select('*').eq('market', 'AE').eq('product_handle', 'kryo2').order('report_date', { ascending: false }).limit(30),
    supabase.from('marketing_change_log').select('*').eq('market', 'AE').eq('product_handle', 'kryo2').order('ts', { ascending: false }).limit(50),
    supabase.from('experiment_readouts_daily').select('*').eq('market', 'AE').eq('product_handle', 'kryo2').order('report_date', { ascending: false }).limit(50),
  ]);

  const testBoard = (testBoardRes.data as Record<string, unknown> | null) ?? null;
  const benchmarkGaps = metricGapRes.data ?? [];
  const changes = changesRes.data ?? [];
  const readouts = readoutsRes.data ?? [];

  const packet = {
    generated_at: new Date().toISOString(),
    report_time_zone: reportTimeZone,
    overview: scorecard.overview,
    meta_paid: scorecard.overview.meta_ads,
    site_behavior: {
      clean: scorecard.overview.site_clean,
      uae: scorecard.overview.site_uae,
      blended: scorecard.overview.blended,
    },
    return_source_mix: scorecard.returning_source_mix,
    return_landing_pages: scorecard.returning_page_paths,
    return_paths: {
      top_first_touch_ads: scorecard.top_first_touch_ads,
      return_path_facts: scorecard.returning_page_paths,
    },
    search_queries: {
      current: scorecard.search_queries?.current ?? [],
      prior: scorecard.search_queries?.prior ?? [],
      status: scorecard.assumptions?.search_data_status ?? 'partial',
    },
    funnel_primary_vs_bonus: scorecard.atc_breakdown_primary_vs_bonus,
    changes_last_7d: changes,
    running_experiments: testBoard && Array.isArray(testBoard.running_experiments) ? testBoard.running_experiments : [],
    testing_schedule: testBoard,
    benchmark_gaps: benchmarkGaps,
    reconciliation: scorecard.reconciliation,
    guardrails: {
      excluded_traffic_by_reason: scorecard.excluded_traffic_by_reason,
    },
    freshness,
    definitions_used: scorecard.metric_glossary,
    daily_summary: dailySummary,
    experiment_readouts: readouts,
    assumptions: scorecard.assumptions,
  };

  return packet;
}

export async function persistCanonicalFactsFromScorecard(supabase: SupabaseClient, reportTimeZone = 'Asia/Dubai') {
  const scorecard = await buildKryoCleanScorecard(supabase, { windowDays: 5, compareDays: 5, reportTimeZone });
  const current = scorecard.overview.site_uae.current;
  const currentDate = scorecard.windows.current.end;

  try {
    const metaWebsiteAtc = Number(scorecard.overview.meta_ads.current.website_add_to_carts ?? 0);
    const ga4AddToCartEvents = Number(current.ga4_add_to_cart_events ?? 0);
    const firstPartyPrimaryAtcUsers = Number(scorecard.atc_breakdown_primary_vs_bonus.current.primary_atc_users ?? 0);
    const firstPartyPrimaryAtcEvents = Number(scorecard.atc_breakdown_primary_vs_bonus.current.primary_atc_events ?? 0);

    await supabase.from('kryo_uae_daily_fact').upsert({
    report_date: currentDate,
    market: 'AE',
    product_handle: 'kryo2',
    total_users: current.total_users,
    new_users: current.new_users,
    returning_users: current.returning_users,
    sessions: current.sessions,
    engaged_sessions: current.engaged_sessions,
    ga4_add_to_cart_events: current.ga4_add_to_cart_events,
    ga4_checkout_events: current.ga4_checkout_events,
    ga4_purchase_events: current.ga4_purchase_events,
    purchase_revenue: current.revenue,
    excluded_sessions: (scorecard.excluded_traffic_by_reason.ga4_sessions_current ?? []).reduce((sum, row) => sum + Number(row.sessions ?? 0), 0),
    source_mix: scorecard.returning_source_mix.current ?? [],
    return_source_mix: scorecard.returning_source_mix.current ?? [],
    return_landing_pages: scorecard.returning_page_paths.current ?? [],
    trust_state: 'partial',
    stale_reason: scorecard.assumptions?.search_data_status ?? null,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'report_date' });

    await supabase.from('kryo_funnel_daily').upsert({
    report_date: currentDate,
    market: 'AE',
    product_handle: 'kryo2',
    meta_website_add_to_carts: metaWebsiteAtc,
    ga4_add_to_cart_events: ga4AddToCartEvents,
    primary_kryo_atc_users: firstPartyPrimaryAtcUsers,
    primary_kryo_atc_events: firstPartyPrimaryAtcEvents,
    bonus_atc_users: Number(scorecard.atc_breakdown_primary_vs_bonus.current.bonus_atc_users ?? 0),
    bonus_atc_events: Number(scorecard.atc_breakdown_primary_vs_bonus.current.bonus_atc_events ?? 0),
    ga4_checkout_events: current.ga4_checkout_events,
    ga4_purchase_events: current.ga4_purchase_events,
    shopify_orders: current.purchases,
    shopify_revenue: current.revenue,
    trust_state: 'partial',
    stale_reason: null,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'report_date,market,product_handle' });

    const reconRows = [
    {
      report_date: currentDate,
      market: 'AE',
      product_handle: 'kryo2',
      metric_key: 'website_add_to_cart_gap',
      lhs_source: 'meta',
      rhs_source: 'ga4',
      lhs_value: metaWebsiteAtc,
      rhs_value: ga4AddToCartEvents,
    },
    {
      report_date: currentDate,
      market: 'AE',
      product_handle: 'kryo2',
      metric_key: 'purchase_revenue_gap',
      lhs_source: 'shopify',
      rhs_source: 'ga4',
      lhs_value: Number(current.revenue ?? 0),
      rhs_value: Number(current.ga4_purchase_revenue ?? 0),
    },
    {
      report_date: currentDate,
      market: 'AE',
      product_handle: 'kryo2',
      metric_key: 'first_party_primary_atc_vs_ga4_add_to_cart',
      lhs_source: 'first_party',
      rhs_source: 'ga4',
      lhs_value: firstPartyPrimaryAtcUsers,
      rhs_value: ga4AddToCartEvents,
    },
    {
      report_date: currentDate,
      market: 'AE',
      product_handle: 'kryo2',
      metric_key: 'first_party_primary_atc_vs_meta_website_atc',
      lhs_source: 'first_party',
      rhs_source: 'meta',
      lhs_value: firstPartyPrimaryAtcUsers,
      rhs_value: metaWebsiteAtc,
    },
  ].map((row) => {
    const deltaAbs = (row.lhs_value ?? 0) - (row.rhs_value ?? 0);
    const deltaPct = row.rhs_value ? deltaAbs / row.rhs_value : null;
    const thresholdPct = 0.2;
    const status = row.rhs_value === 0 && row.lhs_value === 0 ? 'ok' : (deltaPct != null && Math.abs(deltaPct) > thresholdPct ? 'breach' : 'ok');
    return { ...row, delta_abs: deltaAbs, delta_pct: deltaPct, threshold_pct: thresholdPct, status, notes: null, synced_at: new Date().toISOString() };
  });
    await supabase.from('analytics_reconciliation_daily').upsert(reconRows, { onConflict: 'report_date,market,product_handle,metric_key,lhs_source,rhs_source' });
  } catch {
    // Migration not applied yet. Keep the packet path working.
  }

  return scorecard;
}


export async function createGuardrailAlertIfNeeded(supabase: SupabaseClient, category: string, message: string, metadata: Record<string, unknown>) {
  const alertType = typeof metadata.alert_type === 'string' ? metadata.alert_type : category;
  const entityType = typeof metadata.entity_type === 'string' ? metadata.entity_type : 'analytics';
  const entityId = typeof metadata.entity_id === 'string' ? metadata.entity_id : null;
  const rawFingerprint = typeof metadata.fingerprint === 'string'
    ? metadata.fingerprint
    : `${alertType}:${entityType}:${entityId ?? message}`;
  const fingerprint = rawFingerprint
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .slice(0, 180);
  const severity = typeof metadata.severity === 'string' ? metadata.severity : 'warning';
  const evidence = {
    message,
    category,
    ...metadata,
  };

  try {
    await supabase.from('marketing_guardrail_alerts').upsert({
      fingerprint,
      alert_type: alertType,
      severity,
      entity_type: entityType,
      entity_id: entityId,
      status: 'open',
      evidence,
      last_seen_at: new Date().toISOString(),
      resolved_at: null,
    }, { onConflict: 'fingerprint' });
  } catch {
    // Table may not exist in repo yet. Soft-fail until migration is applied.
  }

  try {
    await supabase.from('platform_inbox').insert({
      platform: 'marketing',
      contact_name: 'KRYO analytics sentinel',
      raw_content: message,
      ai_summary: message,
      ai_recommendation: 'Review analytics guardrail alert',
      status: 'pending',
      metadata: { category: 'analytics_guardrail', ...metadata },
    });
  } catch {
    // Soft-fail.
  }
}

export function getSupabaseService() {
  return createServiceClient();
}
