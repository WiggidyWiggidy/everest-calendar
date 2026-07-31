import type { SupabaseClient } from '@supabase/supabase-js';
import { buildKryoCleanScorecard } from '@/lib/marketing/kryo-clean-scorecard';

type MetricDelta = {
  current: number | null;
  prior: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
  trend: 'up' | 'down' | 'flat';
};

type SummaryMetricKey =
  | 'clean_users'
  | 'uae_users'
  | 'returning_users'
  | 'returning_user_rate'
  | 'sessions_per_user'
  | 'primary_atc_users'
  | 'primary_atc_rate'
  | 'checkout_events'
  | 'purchase_events'
  | 'revenue'
  | 'meta_spend'
  | 'meta_outbound_clicks'
  | 'meta_ctr_all'
  | 'meta_outbound_ctr'
  | 'meta_cpc_all'
  | 'meta_cost_per_website_atc'
  | 'site_session_conversion_rate'
  | 'site_user_conversion_rate'
  | 'excluded_ga4_sessions'
  | 'excluded_touch_rows';

type Scorecard = Awaited<ReturnType<typeof buildKryoCleanScorecard>>;

type SummaryWindow = {
  label: string;
  current_dates: { start: string; end: string };
  prior_dates: { start: string; end: string };
  metrics: Record<SummaryMetricKey, MetricDelta>;
  top_ad: {
    ad_name: string;
    campaign_name: string;
    returning_users: number;
    ga4_add_to_cart_events: number;
    meta_website_add_to_carts: number;
    spend: number;
    outbound_clicks: number;
    ctr_all: number;
  } | null;
  diagnosis: string;
  headline: string;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function trendFromDelta(deltaAbs: number): 'up' | 'down' | 'flat' {
  if (Math.abs(deltaAbs) < 1e-9) return 'flat';
  return deltaAbs > 0 ? 'up' : 'down';
}

function compare(current: number | null | undefined, prior: number | null | undefined): MetricDelta {
  const cur = current == null ? null : num(current);
  const prev = prior == null ? null : num(prior);
  if (cur == null || prev == null) {
    return { current: cur, prior: prev, delta_abs: null, delta_pct: null, trend: 'flat' };
  }
  const deltaAbs = cur - prev;
  const deltaPct = prev === 0 ? (cur === 0 ? 0 : null) : deltaAbs / prev;
  return {
    current: cur,
    prior: prev,
    delta_abs: deltaAbs,
    delta_pct: deltaPct,
    trend: trendFromDelta(deltaAbs),
  };
}

function sumExcluded(list: Array<{ sessions?: number; rows?: number }> | undefined, key: 'sessions' | 'rows') {
  return (list ?? []).reduce((acc, row) => acc + num(row[key]), 0);
}

function pickTopAd(scorecard: Scorecard) {
  const row = scorecard.top_first_touch_ads.current[0];
  if (!row) return null;
  return {
    ad_name: row.ad_name,
    campaign_name: row.campaign_name,
    returning_users: num(row.ga4_returning_users),
    ga4_add_to_cart_events: num(row.ga4_add_to_cart_events),
    meta_website_add_to_carts: num(row.website_add_to_carts),
    spend: num(row.spend),
    outbound_clicks: num(row.outbound_clicks),
    ctr_all: num(row.ctr_all),
  };
}

function buildHeadline(label: string, metrics: SummaryWindow['metrics']) {
  const users = metrics.clean_users;
  const returners = metrics.returning_users;
  const atc = metrics.primary_atc_users;
  const purchase = metrics.purchase_events;
  return `${label}: users ${users.trend}, returners ${returners.trend}, primary ATC ${atc.trend}, purchases ${purchase.trend}`;
}

function diagnose(metrics: SummaryWindow['metrics']) {
  const excludedShare = metrics.excluded_ga4_sessions.current && metrics.clean_users.current
    ? metrics.excluded_ga4_sessions.current / Math.max(metrics.clean_users.current, 1)
    : 0;
  if (excludedShare > 0.5) return 'Noise is still high. Check exclusions before trusting trend.';
  if ((metrics.returning_users.delta_abs ?? 0) < 0 && (metrics.clean_users.delta_abs ?? 0) >= 0) return 'Traffic is up but return behaviour is weaker.';
  if ((metrics.primary_atc_users.delta_abs ?? 0) < 0 && (metrics.clean_users.delta_abs ?? 0) >= 0) return 'Traffic volume is up but main-product cart intent is weaker.';
  if ((metrics.meta_cost_per_website_atc.current ?? 0) > 0 && (metrics.site_session_conversion_rate.current ?? 0) < 0.01) return 'Paid traffic is reaching cart, but purchase conversion is still the bottleneck.';
  if ((metrics.clean_users.current ?? 0) < 20) return 'Volume is still low. Top-of-funnel remains the main constraint.';
  return 'Definitions are clean enough to trust the directional trend.';
}

function summariseWindow(scorecard: Scorecard, label: string): SummaryWindow {
  const cleanCurrent = scorecard.overview.site_clean.current;
  const cleanPrior = scorecard.overview.site_clean.prior;
  const uaeCurrent = scorecard.overview.site_uae.current;
  const uaePrior = scorecard.overview.site_uae.prior;
  const atcCurrent = scorecard.atc_breakdown_primary_vs_bonus.current;
  const atcPrior = scorecard.atc_breakdown_primary_vs_bonus.prior;
  const metaCurrent = scorecard.overview.meta_ads.current;
  const metaPrior = scorecard.overview.meta_ads.prior;
  const blendedCurrent = scorecard.overview.blended.current;
  const blendedPrior = scorecard.overview.blended.prior;
  const excludedCurrentGa4 = sumExcluded(scorecard.excluded_traffic_by_reason.ga4_sessions_current, 'sessions');
  const excludedPriorGa4 = sumExcluded(scorecard.excluded_traffic_by_reason.ga4_sessions_prior, 'sessions');
  const excludedCurrentTouch = sumExcluded(scorecard.excluded_traffic_by_reason.touch_rows_current, 'rows');
  const excludedPriorTouch = sumExcluded(scorecard.excluded_traffic_by_reason.touch_rows_prior, 'rows');

  const metrics: SummaryWindow['metrics'] = {
    clean_users: compare(cleanCurrent.total_users, cleanPrior.total_users),
    uae_users: compare(uaeCurrent.total_users, uaePrior.total_users),
    returning_users: compare(cleanCurrent.returning_users, cleanPrior.returning_users),
    returning_user_rate: compare(cleanCurrent.returning_user_rate, cleanPrior.returning_user_rate),
    sessions_per_user: compare(cleanCurrent.sessions_per_user, cleanPrior.sessions_per_user),
    primary_atc_users: compare(atcCurrent.primary_atc_users, atcPrior.primary_atc_users),
    primary_atc_rate: compare(atcCurrent.primary_atc_rate_vs_clean_users, atcPrior.primary_atc_rate_vs_clean_users),
    checkout_events: compare(cleanCurrent.ga4_checkout_events, cleanPrior.ga4_checkout_events),
    purchase_events: compare(cleanCurrent.ga4_purchase_events, cleanPrior.ga4_purchase_events),
    revenue: compare(cleanCurrent.revenue, cleanPrior.revenue),
    meta_spend: compare(metaCurrent.spend, metaPrior.spend),
    meta_outbound_clicks: compare(metaCurrent.outbound_clicks, metaPrior.outbound_clicks),
    meta_ctr_all: compare(metaCurrent.ctr_all, metaPrior.ctr_all),
    meta_outbound_ctr: compare(metaCurrent.outbound_ctr, metaPrior.outbound_ctr),
    meta_cpc_all: compare(metaCurrent.cpc_all, metaPrior.cpc_all),
    meta_cost_per_website_atc: compare(metaCurrent.cost_per_website_atc, metaPrior.cost_per_website_atc),
    site_session_conversion_rate: compare(blendedCurrent.site_session_conversion_rate, blendedPrior.site_session_conversion_rate),
    site_user_conversion_rate: compare(blendedCurrent.site_user_conversion_rate, blendedPrior.site_user_conversion_rate),
    excluded_ga4_sessions: compare(excludedCurrentGa4, excludedPriorGa4),
    excluded_touch_rows: compare(excludedCurrentTouch, excludedPriorTouch),
  };

  return {
    label,
    current_dates: scorecard.windows.current,
    prior_dates: scorecard.windows.prior,
    metrics,
    top_ad: pickTopAd(scorecard),
    diagnosis: diagnose(metrics),
    headline: buildHeadline(label, metrics),
  };
}

export async function buildKryoDailySummary(
  supabase: SupabaseClient,
  opts?: { reportTimeZone?: string },
) {
  const reportTimeZone = opts?.reportTimeZone ?? 'Asia/Dubai';
  const [dailyScorecard, rollingFiveScorecard] = await Promise.all([
    buildKryoCleanScorecard(supabase, { windowDays: 1, compareDays: 1, reportTimeZone }),
    buildKryoCleanScorecard(supabase, { windowDays: 5, compareDays: 5, reportTimeZone }),
  ]);

  return {
    generated_at: new Date().toISOString(),
    report_time_zone: reportTimeZone,
    assumptions: dailyScorecard.assumptions,
    metric_glossary: dailyScorecard.metric_glossary,
    daily: summariseWindow(dailyScorecard, 'Latest complete day'),
    rolling_5d: summariseWindow(rollingFiveScorecard, 'Last 5 complete days'),
    limitations: [
      'GA4 remains the source of truth for behaviour and return visits.',
      'Meta paid metrics now use Meta-native definitions with 7d_click + 1d_view attribution.',
      'Search remains partial until full GSC query-page-country-device sync is live.',
    ],
  };
}
