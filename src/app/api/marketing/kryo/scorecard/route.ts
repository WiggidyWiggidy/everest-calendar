import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { chinaWindow, CHINA_REPORT_TIMEZONE } from '@/lib/timezones';

const PAGE_PATH = '/products/kryo2';
const PAID_SOURCES = new Set(['meta', 'facebook', 'instagram', 'fb']);
const PAID_MEDIUMS = new Set(['paid', 'cpc', 'paid_social']);

type Json = Record<string, unknown>;

function authorized(request: NextRequest) {
  return request.headers.get('x-sync-secret') === process.env.MARKETING_SYNC_SECRET;
}

function paidSourceMedium(value: string | null | undefined) {
  if (!value) return false;
  const [source = '', medium = ''] = value.toLowerCase().split('/').map(part => part.trim());
  return PAID_SOURCES.has(source) && PAID_MEDIUMS.has(medium);
}

function sum(rows: Json[], key: string) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function rate(a: number, b: number) {
  return b > 0 ? a / b : null;
}

function delta(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : null;
}

function canonicalUrl(raw: string) {
  try {
    const url = new URL(raw);
    return { url, path: url.pathname.replace(/\/+/g, '/') };
  } catch {
    return { url: null, path: raw.split('?')[0].replace(/\/+/g, '/') };
  }
}

function isPaidUrl(url: URL | null) {
  if (!url) return false;
  const source = (url.searchParams.get('utm_source') ?? '').toLowerCase();
  const medium = (url.searchParams.get('utm_medium') ?? '').toLowerCase();
  return PAID_SOURCES.has(source) && PAID_MEDIUMS.has(medium);
}

function actionAdId(url: URL | null) {
  if (!url) return null;
  return url.searchParams.get('ad_id') || url.searchParams.get('utm_ad_id') ||
    url.searchParams.get('meta_ad_id') || url.searchParams.get('utm_content');
}

async function clarityPaidMetrics() {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) return { metrics: {}, ad_ids: [] as string[], warning: 'clarity_credentials_missing' };
  const res = await fetch('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return { metrics: {}, ad_ids: [] as string[], warning: `clarity_api_${res.status}` };
  const data = await res.json() as Array<{ metricName: string; information: Json[] }>;
  const metric = (name: string) => data.find(item => item.metricName === name)?.information ?? [];
  const relevant = (rows: Json[]) => rows.filter(row => {
    const parsed = canonicalUrl(String(row.Url ?? ''));
    return parsed.path === PAGE_PATH && isPaidUrl(parsed.url);
  });
  const traffic = relevant(metric('Traffic'));
  const sessions = sum(traffic, 'totalSessionCount');
  const users = sum(traffic, 'distinctUserCount');
  const engagement = relevant(metric('EngagementTime'));
  const scroll = relevant(metric('ScrollDepth'));
  const weightedScroll = scroll.reduce((total, row) => {
    const trafficRow = traffic.find(item => String(item.Url ?? '') === String(row.Url ?? ''));
    return total + Number(row.averageScrollDepth ?? 0) * Number(trafficRow?.totalSessionCount ?? 0);
  }, 0);
  const frustration = (name: string) => sum(relevant(metric(name)), 'subTotal');
  const adIds = Array.from(new Set(traffic.map(row => actionAdId(canonicalUrl(String(row.Url ?? '')).url)).filter(Boolean))) as string[];
  return {
    metrics: {
      sessions,
      users,
      bots: sum(traffic, 'totalBotSessionCount'),
      active_time_sec: sum(engagement, 'activeTime'),
      elapsed_time_sec: sum(engagement, 'totalTime'),
      active_time_per_session_sec: rate(sum(engagement, 'activeTime'), sessions),
      elapsed_time_per_session_sec: rate(sum(engagement, 'totalTime'), sessions),
      avg_scroll_depth_pct: sessions > 0 ? weightedScroll / sessions : null,
      rage_clicks: frustration('RageClickCount'),
      dead_clicks: frustration('DeadClickCount'),
      quickbacks: frustration('QuickbackClick'),
      excessive_scrolls: frustration('ExcessiveScroll'),
      script_errors: frustration('ScriptErrorCount'),
      error_clicks: frustration('ErrorClickCount'),
      strict_paid_url_rows: traffic.length,
    },
    ad_ids: adIds,
  };
}

function ga4Metrics(rows: Json[]) {
  const sessions = sum(rows, 'sessions');
  const pageviews = sum(rows, 'screen_page_views');
  const engagement = sum(rows, 'user_engagement_duration_sec');
  return {
    sessions,
    active_users: sum(rows, 'active_users'),
    pageviews,
    pageviews_per_session: rate(pageviews, sessions),
    engagement_time_sec: engagement,
    engagement_time_per_session_sec: rate(engagement, sessions),
    average_session_duration_sec: rate(rows.reduce((total, row) => total + Number(row.average_session_duration_sec ?? 0) * Number(row.sessions ?? 0), 0), sessions),
    add_to_carts: sum(rows, 'add_to_carts'),
    begin_checkouts: sum(rows, 'begin_checkouts'),
    purchases: sum(rows, 'purchases'),
    revenue: sum(rows, 'purchase_revenue'),
  };
}

function metaMetrics(rows: Json[]) {
  const impressions = sum(rows, 'impressions');
  const linkClicks = sum(rows, 'link_clicks');
  const spend = sum(rows, 'spend');
  const purchases = sum(rows, 'purchases');
  const revenue = sum(rows, 'revenue');
  return {
    spend, impressions, reach: sum(rows, 'reach'), clicks: sum(rows, 'clicks'), link_clicks: linkClicks,
    landing_page_views: sum(rows, 'landing_page_views'), ctr: rate(linkClicks, impressions),
    cpc: rate(spend, linkClicks), cpm: impressions > 0 ? spend * 1000 / impressions : null,
    add_to_carts: sum(rows, 'add_to_carts'), checkouts_started: sum(rows, 'checkouts_started'),
    purchases, revenue, roas: rate(revenue, spend),
  };
}

function storefrontMetrics(rows: Json[]) {
  const events = (name: string) => rows.filter(row => row.event_type === name).length;
  return {
    sessions: new Set(rows.map(row => row.session_id).filter(Boolean)).size,
    page_views: events('page_view'),
    product_views: events('product_view'),
    add_to_carts: events('add_to_cart'),
    checkout_starts: events('checkout_start'),
    orders: events('order_placed'),
  };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createServiceClient();
  const current = chinaWindow(0);
  const previous = chinaWindow(24);
  const trailingStart = new Date(current.end.getTime() - 7 * 86400000);
  const warnings: string[] = ['historical_storefront_events_incomplete_before_tracking_alias_fix'];

  try {
    const clarity = await clarityPaidMetrics();
    if ('warning' in clarity && clarity.warning) warnings.push(clarity.warning);
    const { data: gaRows = [], error: gaError } = await sb.from('ga4_page_hourly').select('*')
      .eq('page_path', PAGE_PATH).gte('report_hour', trailingStart.toISOString()).lt('report_hour', current.end.toISOString());
    if (gaError) throw new Error(gaError.message);
    const paidGa = (gaRows ?? []).filter(row => paidSourceMedium(row.session_source_medium));
    const campaigns = Array.from(new Set(paidGa.map(row => row.session_campaign_name).filter(Boolean)));

    const { data: adsets = [] } = campaigns.length
      ? await sb.from('meta_adsets').select('meta_adset_id,meta_campaign_id').in('meta_campaign_id', campaigns)
      : { data: [] as Json[] };
    const adsetIds = (adsets ?? []).map(row => row.meta_adset_id);
    const { data: ads = [] } = adsetIds.length
      ? await sb.from('meta_ads').select('meta_ad_id').in('meta_adset_id', adsetIds)
      : { data: [] as Json[] };
    const metaAdIds = Array.from(new Set([...(clarity.ad_ids ?? []), ...(ads ?? []).map(row => row.meta_ad_id)].filter(Boolean)));
    const { data: metaRows = [] } = metaAdIds.length
      ? await sb.from('meta_ad_metrics_hourly').select('*').in('meta_ad_id', metaAdIds)
          .gte('report_hour', trailingStart.toISOString()).lt('report_hour', current.end.toISOString())
      : { data: [] as Json[] };
    if (!metaAdIds.length) warnings.push('meta_paid_ad_ids_not_resolved');
    if (!(metaRows ?? []).length) warnings.push('meta_hourly_rows_missing');

    const { data: touchRows = [] } = await sb.from('attribution_touches').select('*')
      .eq('page_path', PAGE_PATH).gte('ts', current.start.toISOString()).lt('ts', current.end.toISOString());
    const paidTouches = (touchRows ?? []).filter(row => PAID_SOURCES.has(String(row.utm_source ?? '').toLowerCase()) && PAID_MEDIUMS.has(String(row.utm_medium ?? '').toLowerCase()));

    const split = (rows: Json[], start: Date, end: Date, key: string) =>
      rows.filter(row => new Date(String(row[key])).getTime() >= start.getTime() && new Date(String(row[key])).getTime() < end.getTime());
    const gaNow = ga4Metrics(split(paidGa, current.start, current.end, 'report_hour'));
    const gaPrev = ga4Metrics(split(paidGa, previous.start, previous.end, 'report_hour'));
    const ga7 = ga4Metrics(paidGa);
    const metaNow = metaMetrics(split(metaRows ?? [], current.start, current.end, 'report_hour'));
    const metaPrev = metaMetrics(split(metaRows ?? [], previous.start, previous.end, 'report_hour'));

    const { data: gscRows = [] } = await sb.from('gsc_query_page_hourly').select('*')
      .ilike('normalized_page', `%${PAGE_PATH}%`).order('hour_start', { ascending: false }).limit(250);
    const newestGsc = (gscRows ?? [])[0]?.hour_start ?? null;
    if (!newestGsc) warnings.push('gsc_kryo2_rows_missing');

    const insights = [
      gaNow.sessions > 0 ? `GA4 paid engagement is ${Number(gaNow.engagement_time_per_session_sec ?? 0).toFixed(1)} seconds per session.` : null,
      Number(metaNow.landing_page_views) > 0 ? `Meta click-to-LPV rate is ${(Number(metaNow.landing_page_views) / Math.max(Number(metaNow.link_clicks), 1) * 100).toFixed(1)}%.` : null,
      Number(gaNow.add_to_carts) > 0 ? `GA4 paid session-to-ATC rate is ${(Number(gaNow.add_to_carts) / Math.max(Number(gaNow.sessions), 1) * 100).toFixed(1)}%.` : null,
    ].filter(Boolean);
    const [{ data: adLevelReport = [] }, { data: journeySummary = {} }, { data: guardrailRows = [] }] = await Promise.all([
      sb.rpc('get_kryo_ad_downstream_report', { p_page_path: PAGE_PATH, p_window_hours: 24 }),
      sb.rpc('get_kryo_purchase_journeys', { p_days: 30 }),
      sb.from('marketing_guardrail_alerts').select('*').eq('status', 'open').order('last_seen_at', { ascending: false }).limit(50),
    ]);
    const status = warnings.some(item => item.includes('missing')) ? 'partial' : 'success';
    const payload = {
      page_path: PAGE_PATH,
      report_timezone: CHINA_REPORT_TIMEZONE,
      window_start_at: current.start.toISOString(),
      window_end_at: current.end.toISOString(),
      status,
      source_freshness: {
        generated_at: new Date().toISOString(),
        ga4_latest_hour: paidGa.map(row => row.report_hour).sort().at(-1) ?? null,
        meta_latest_hour: (metaRows ?? []).map(row => row.report_hour).sort().at(-1) ?? null,
        gsc_latest_hour: newestGsc,
        clarity_window: 'rolling_24h',
      },
      meta_metrics: { ...metaNow, ad_ids: metaAdIds, campaigns },
      ga4_metrics: gaNow,
      clarity_metrics: clarity.metrics,
      gsc_metrics: {
        freshness_label: 'latest_available_provisional',
        newest_hour: newestGsc,
        clicks: sum(gscRows ?? [], 'clicks'),
        impressions: sum(gscRows ?? [], 'impressions'),
        ctr: rate(sum(gscRows ?? [], 'clicks'), sum(gscRows ?? [], 'impressions')),
        avg_position: rate((gscRows ?? []).reduce((total, row) => total + Number(row.avg_position ?? 0) * Number(row.impressions ?? 0), 0), sum(gscRows ?? [], 'impressions')),
      },
      storefront_metrics: storefrontMetrics(paidTouches),
      ad_level_report: adLevelReport ?? [],
      journey_summary: journeySummary ?? {},
      guardrail_alerts: guardrailRows ?? [],
      data_quality: {
        paid_storefront_sessions: new Set(paidTouches.map(row => row.session_id).filter(Boolean)).size,
        paid_storefront_rows: paidTouches.length,
        historical_storefront_events_incomplete: true,
        gsc_reporting_delay_expected: true,
      },
      comparisons: {
        previous_24h: {
          ga4_sessions_delta: delta(Number(gaNow.sessions), Number(gaPrev.sessions)),
          ga4_engagement_per_session_delta: delta(Number(gaNow.engagement_time_per_session_sec ?? 0), Number(gaPrev.engagement_time_per_session_sec ?? 0)),
          meta_spend_delta: delta(Number(metaNow.spend), Number(metaPrev.spend)),
          meta_link_clicks_delta: delta(Number(metaNow.link_clicks), Number(metaPrev.link_clicks)),
        },
        trailing_7d_daily_average: {
          ga4_sessions: Number(ga7.sessions) / 7,
          ga4_add_to_carts: Number(ga7.add_to_carts) / 7,
          ga4_engagement_time_per_session_sec: ga7.engagement_time_per_session_sec,
        },
      },
      warnings,
      insights,
    };
    const { data, error } = await sb.from('kryo_lp_scorecards').upsert(payload, { onConflict: 'page_path,window_end_at' }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, scorecard: data });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await createServiceClient().rpc('get_latest_kryo_lp_scorecard', { p_page_path: PAGE_PATH });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ scorecard: data });
}
