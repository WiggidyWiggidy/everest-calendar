export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

const KRYO_PATH = '/products/kryo-2-1';
const TRUST_PAGE_RE = /(shipping|return|returns|refund|warranty|contact|review|reviews|faq|about|privacy|terms|support)/i;
const TRUST_SEARCH_RE = /(review|reviews|legit|scam|shipping|delivery|refund|return|warranty|price|discount|complaint|complaints|support|contact|trust|real)/i;
const TECH_RE = /(404|not[-_ ]?found|unavailable|sold[-_ ]?out|out[-_ ]?of[-_ ]?stock|error|checkout|cart|currency|country|market|locale|challenge|captcha|blocked|payment|shipping)/i;

const FUNNEL_EVENTS = ['page_view', 'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'];

type JsonMap = Record<string, unknown>;
type GscSearchRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type GaReportResult = { ok: true; rows: JsonMap[]; raw?: JsonMap } | { ok: false; error: string; raw?: unknown };

type SyncStatus = {
  ga4_connected: boolean;
  gsc_connected: boolean;
  rows_updated: number;
  errors: string[];
  missing: string[];
  completed_at: string;
};

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.MARKETING_SYNC_SECRET;
  const auth = request.headers.get('authorization');
  const providedCron = request.headers.get('x-cron-secret') ?? request.nextUrl.searchParams.get('secret');
  const providedSync = request.headers.get('x-sync-secret') ?? request.nextUrl.searchParams.get('sync_secret');
  if (cronSecret && (auth === `Bearer ${cronSecret}` || providedCron === cronSecret)) return true;
  if (syncSecret && providedSync === syncSecret) return true;
  return !cronSecret && !syncSecret;
}

function metric(row: JsonMap, index: number): number {
  const metrics = row.metricValues as Array<{ value?: string }> | undefined;
  const n = Number(metrics?.[index]?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dim(row: JsonMap, index: number): string {
  const dims = row.dimensionValues as Array<{ value?: string }> | undefined;
  return String(dims?.[index]?.value ?? '');
}

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Number((numerator / denominator).toFixed(4));
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function stringContains(fieldName: string, value: string) {
  return { filter: { fieldName, stringFilter: { matchType: 'CONTAINS', value, caseSensitive: false } } };
}

function exact(fieldName: string, value: string) {
  return { filter: { fieldName, stringFilter: { matchType: 'EXACT', value, caseSensitive: false } } };
}

async function gaRunReport(accessToken: string, propertyId: string, body: JsonMap): Promise<GaReportResult> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let raw: JsonMap | unknown;
  try { raw = JSON.parse(text); } catch { raw = { raw: text.slice(0, 1000) }; }
  if (!res.ok) return { ok: false, error: JSON.stringify(raw).slice(0, 1000), raw };
  return { ok: true, rows: ((raw as JsonMap).rows as JsonMap[] | undefined) ?? [], raw: raw as JsonMap };
}

async function gscQuery(accessToken: string, siteUrl: string, body: JsonMap) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let raw: JsonMap | unknown;
  try { raw = JSON.parse(text); } catch { raw = { raw: text.slice(0, 1000) }; }
  if (!res.ok) return { ok: false as const, error: JSON.stringify(raw).slice(0, 1000), raw };
  return { ok: true as const, rows: ((raw as JsonMap).rows as JsonMap[] | undefined) ?? [], raw: raw as JsonMap };
}

function summarizeFunnel(productRows: JsonMap[], eventRows: JsonMap[]) {
  const productPageViews = productRows.reduce((s, r) => s + metric(r, 2), 0); // screenPageViews
  const sessions = productRows.reduce((s, r) => s + metric(r, 0), 0);
  const avgSessionDuration = sessions ? productRows.reduce((s, r) => s + metric(r, 4) * metric(r, 0), 0) / sessions : 0;
  const byEvent: Record<string, number> = Object.fromEntries(FUNNEL_EVENTS.map(e => [e, 0]));
  for (const r of eventRows) {
    const event = dim(r, 0);
    if (event in byEvent) byEvent[event] += metric(r, 0);
  }
  const steps = {
    product_page_views: Math.round(Math.max(productPageViews, byEvent.view_item || 0, byEvent.page_view || 0)),
    add_to_carts: Math.round(byEvent.add_to_cart || 0),
    cart_views: Math.round(byEvent.view_cart || 0),
    begin_checkouts: Math.round(byEvent.begin_checkout || 0),
    shipping_or_payment_events: Math.round((byEvent.add_shipping_info || 0) + (byEvent.add_payment_info || 0)),
    purchases: Math.round(byEvent.purchase || 0),
  };
  const drops = [
    { step: 'product_page_view_to_add_to_cart', from: steps.product_page_views, to: steps.add_to_carts, conversion_rate: pct(steps.add_to_carts, steps.product_page_views) },
    { step: 'add_to_cart_to_cart', from: steps.add_to_carts, to: steps.cart_views, conversion_rate: pct(steps.cart_views, steps.add_to_carts) },
    { step: 'cart_to_checkout', from: steps.cart_views, to: steps.begin_checkouts, conversion_rate: pct(steps.begin_checkouts, steps.cart_views) },
    { step: 'checkout_to_shipping_payment', from: steps.begin_checkouts, to: steps.shipping_or_payment_events, conversion_rate: pct(steps.shipping_or_payment_events, steps.begin_checkouts) },
    { step: 'shipping_payment_to_purchase', from: steps.shipping_or_payment_events || steps.begin_checkouts, to: steps.purchases, conversion_rate: pct(steps.purchases, steps.shipping_or_payment_events || steps.begin_checkouts) },
  ].map(d => ({ ...d, dropoff_count: Math.max(d.from - d.to, 0), dropoff_rate: d.from ? Number(((d.from - d.to) / d.from).toFixed(4)) : null }));
  const biggest = drops.filter(d => d.from > 0).sort((a, b) => (b.dropoff_count - a.dropoff_count) || ((b.dropoff_rate ?? 0) - (a.dropoff_rate ?? 0)))[0] ?? null;

  const byCountry: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of productRows) {
    byCountry[dim(r, 1) || '(not set)'] = (byCountry[dim(r, 1) || '(not set)'] || 0) + metric(r, 0);
    byDevice[dim(r, 2) || '(not set)'] = (byDevice[dim(r, 2) || '(not set)'] || 0) + metric(r, 0);
    bySource[dim(r, 3) || '(not set)'] = (bySource[dim(r, 3) || '(not set)'] || 0) + metric(r, 0);
  }

  return {
    product_path: KRYO_PATH,
    steps,
    biggest_dropoff_step: biggest,
    avg_session_duration_sec: Math.round(avgSessionDuration),
    split: {
      country: topMap(byCountry, 8),
      device: topMap(byDevice, 8),
      source_medium: topMap(bySource, 8),
    },
  };
}

function topMap(map: Record<string, number>, limit: number) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, value]) => ({ key, value: Math.round(value) }));
}

function summarizeTechnical(pageRows: JsonMap[]) {
  const issues = [] as Array<{ issue_type: string; page: string; title: string; sessions: number; pageviews: number; why: string }>;
  for (const r of pageRows) {
    const page = dim(r, 0);
    const title = dim(r, 1);
    const sessions = metric(r, 1);
    const pageviews = metric(r, 0);
    const haystack = `${page} ${title}`;
    if (TECH_RE.test(haystack)) {
      let issue_type = 'technical_signal';
      if (/404|not[-_ ]?found/i.test(haystack)) issue_type = 'possible_404_or_not_found';
      else if (/currency|country|market|locale|\/en-gb/i.test(haystack)) issue_type = 'possible_market_or_currency_mismatch';
      else if (/checkout|payment|shipping/i.test(haystack)) issue_type = 'checkout_or_shipping_signal';
      else if (/unavailable|sold[-_ ]?out|out[-_ ]?of[-_ ]?stock/i.test(haystack)) issue_type = 'possible_product_unavailable';
      issues.push({ issue_type, page, title, sessions: Math.round(sessions), pageviews: Math.round(pageviews), why: 'GA4 page/title matched diagnostic technical pattern' });
    }
  }
  return {
    issue_count: issues.length,
    top_issues: issues.sort((a, b) => b.sessions - a.sessions).slice(0, 15),
  };
}

function summarizeReturning(rows: JsonMap[], purchases: number) {
  const returning = rows.filter(r => /returning/i.test(dim(r, 1)));
  const totalSessions = returning.reduce((s, r) => s + metric(r, 0), 0);
  let toKryo = 0, toHome = 0, toCartCheckout = 0, toTrust = 0;
  const landings: Record<string, number> = {};
  for (const r of returning) {
    const landing = dim(r, 0) || '(not set)';
    const sessions = metric(r, 0);
    landings[landing] = (landings[landing] || 0) + sessions;
    if (landing.includes(KRYO_PATH) || landing.includes('kryo-2-1')) toKryo += sessions;
    if (landing === '/' || landing === '(not set)' || /^\/?(en-[a-z]{2})?\/?$/i.test(landing)) toHome += sessions;
    if (/cart|checkout/i.test(landing)) toCartCheckout += sessions;
    if (TRUST_PAGE_RE.test(landing)) toTrust += sessions;
  }
  const lost = Math.max(totalSessions - toKryo - toCartCheckout - purchases, 0);
  return {
    returning_sessions: Math.round(totalSessions),
    return_to_kryo_sessions: Math.round(toKryo),
    return_to_homepage_sessions: Math.round(toHome),
    return_to_cart_or_checkout_sessions: Math.round(toCartCheckout),
    return_to_trust_page_sessions: Math.round(toTrust),
    appear_lost_before_purchase_sessions: Math.round(lost),
    top_returning_landings: topMap(landings, 12),
  };
}

function summarizeTrust(trustPageRows: JsonMap[], gscRows: JsonMap[]) {
  const pageMap: Record<string, number> = {};
  for (const r of trustPageRows) pageMap[dim(r, 0)] = (pageMap[dim(r, 0)] || 0) + metric(r, 0);
  const trustSearches = [] as Array<{ query: string; page: string; date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  for (const r of gscRows) {
    const row = r as GscSearchRow;
    const keys = Array.isArray(row.keys) ? row.keys : [];
    const query = String(keys[0] ?? '').toLowerCase();
    if (!TRUST_SEARCH_RE.test(query)) continue;
    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    trustSearches.push({
      query,
      page: String(keys[1] ?? ''),
      date: String(keys[2] ?? ''),
      clicks,
      impressions,
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    });
  }
  return {
    trust_page_views: topMap(pageMap, 12),
    trust_search_terms: trustSearches.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    trust_search_impressions: trustSearches.reduce((s, r) => s + r.impressions, 0),
    trust_search_clicks: trustSearches.reduce((s, r) => s + r.clicks, 0),
  };
}

function finalDiagnosis(funnel: ReturnType<typeof summarizeFunnel>, tech: ReturnType<typeof summarizeTechnical>, returning: ReturnType<typeof summarizeReturning>, trust: ReturnType<typeof summarizeTrust>) {
  const s = funnel.steps;
  let issue = 'not enough diagnostic data yet';
  let next = 'let the twice-daily GA4/GSC diagnostic sync run, then inspect the KRYO product page and checkout path with the highest drop-off.';

  if (tech.issue_count > 0) {
    issue = `possible technical or market issue on ${tech.top_issues[0].page}`;
    next = `manually inspect ${tech.top_issues[0].page} from UAE/Dubai mobile and desktop, checking product availability, market, currency, redirects and checkout access.`;
  }
  if (s.product_page_views > 20 && (s.add_to_carts === 0 || (s.add_to_carts / s.product_page_views) < 0.05)) {
    issue = 'KRYO product page is not turning enough high-intent product views into add-to-carts.';
    next = `manually inspect ${KRYO_PATH} above the fold, price/trust objections, product availability, variant selection, and add-to-cart behavior.`;
  } else if (s.add_to_carts > 0 && s.begin_checkouts === 0) {
    issue = 'users are showing purchase intent with add-to-carts, but they are not reaching checkout.';
    next = 'manually inspect cart drawer/cart page, checkout button, market/currency handling, shipping availability and any app conflicts after add-to-cart.';
  } else if (s.begin_checkouts > 0 && s.purchases === 0) {
    issue = 'checkout/payment/shipping is the likely leak after users begin checkout.';
    next = 'manually inspect checkout shipping/payment for UAE/Dubai, payment methods, shipping rates and product eligibility.';
  } else if (returning.returning_sessions > 0 && returning.appear_lost_before_purchase_sessions > returning.return_to_kryo_sessions) {
    issue = 'returning users are not reliably landing back on the KRYO buying path.';
    next = 'inspect returning landing pages and retargeting/search links so returning users land on KRYO or cart/checkout, not generic pages.';
  } else if (trust.trust_search_impressions > 0 || trust.trust_page_views.length > 0) {
    issue = 'users are showing trust-resolution behavior before buying.';
    next = 'inspect shipping, returns, warranty, reviews and support messaging on the KRYO page and checkout path.';
  }

  return {
    most_likely_website_issue: issue,
    next_manual_inspection_or_fix: next,
  };
}

async function upsertSummary(summary: JsonMap, status: SyncStatus) {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const compact = JSON.stringify(summary);
  const statusCompact = JSON.stringify(status);
  const [{ error: summaryErr }, { error: statusErr }] = await Promise.all([
    supabase.from('system_config').upsert({
      key: 'google_diagnostics.kryo_latest',
      value_text: compact,
      description: 'Compressed GA4/GSC KRYO buying journey diagnostic summary',
      source: 'api/cron/google-diagnostics-sync',
      updated_at: now,
    }, { onConflict: 'key' }),
    supabase.from('system_config').upsert({
      key: 'google_diagnostics.sync_status',
      value_text: statusCompact,
      description: 'Latest GA4/GSC KRYO diagnostic sync status',
      source: 'api/cron/google-diagnostics-sync',
      updated_at: now,
    }, { onConflict: 'key' }),
  ]);
  if (summaryErr || statusErr) throw new Error(summaryErr?.message || statusErr?.message);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const errors: string[] = [];
  const missing: string[] = [];
  const propertyId = process.env.GA_PROPERTY_ID;
  const siteUrl = process.env.GSC_SITE_URL;
  if (!propertyId) missing.push('GA_PROPERTY_ID');
  if (!siteUrl) missing.push('GSC_SITE_URL');
  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) missing.push('GOOGLE_OAUTH_REFRESH_TOKEN');
  if (missing.length) {
    const status: SyncStatus = { ga4_connected: false, gsc_connected: false, rows_updated: 0, errors: [], missing, completed_at: new Date().toISOString() };
    await upsertSummary({ status, final_diagnosis: { most_likely_website_issue: 'Google credentials are incomplete', next_manual_inspection_or_fix: `Missing ${missing.join(', ')}` } }, status);
    return NextResponse.json({ status, error: 'missing_google_config' }, { status: 400 });
  }

  const accessToken = await getGoogleAccessTokenFromRefreshToken();

  const [productReport, eventReport, returningReport, technicalReport, trustPageReport] = await Promise.all([
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }, { name: 'country' }, { name: 'deviceCategory' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }, { name: 'userEngagementDuration' }],
      dimensionFilter: stringContains('pagePath', KRYO_PATH),
      limit: 1000,
    }),
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }, { name: 'pagePath' }, { name: 'country' }, { name: 'deviceCategory' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        orGroup: { expressions: [
          { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_EVENTS, caseSensitive: false } } },
          stringContains('pagePath', 'cart'),
          stringContains('pagePath', 'checkout'),
          stringContains('pagePath', KRYO_PATH),
        ] },
      },
      limit: 10000,
    }),
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'landingPagePlusQueryString' }, { name: 'newVsReturning' }, { name: 'country' }, { name: 'sessionSourceMedium' }, { name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
      dimensionFilter: exact('newVsReturning', 'returning'),
      limit: 1000,
    }),
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePathPlusQueryString' }, { name: 'pageTitle' }, { name: 'country' }, { name: 'deviceCategory' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
      limit: 5000,
    }),
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }, { name: 'country' }, { name: 'sessionSourceMedium' }, { name: 'newVsReturning' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
      dimensionFilter: { orGroup: { expressions: ['shipping', 'return', 'refund', 'warranty', 'contact', 'review', 'faq', 'about', 'privacy', 'terms', 'support'].map(v => stringContains('pagePath', v)) } },
      limit: 1000,
    }),
  ]);

  for (const [name, report] of Object.entries({ productReport, eventReport, returningReport, technicalReport, trustPageReport })) {
    if (!report.ok) errors.push(`${name}: ${report.error}`);
  }

  const gscEnd = todayIso(-3);
  const gscStart = todayIso(-30);
  const gscReport = await gscQuery(accessToken, siteUrl!, {
    startDate: gscStart,
    endDate: gscEnd,
    dimensions: ['query', 'page', 'date'],
    rowLimit: 25000,
  });
  if (!gscReport.ok) errors.push(`gscReport: ${gscReport.error}`);

  const productRows = productReport.ok ? productReport.rows : [];
  const eventRows = eventReport.ok ? eventReport.rows : [];
  const returningRows = returningReport.ok ? returningReport.rows : [];
  const technicalRows = technicalReport.ok ? technicalReport.rows : [];
  const trustPageRows = trustPageReport.ok ? trustPageReport.rows : [];
  const gscRows = gscReport.ok ? gscReport.rows : [];

  const funnel = summarizeFunnel(productRows, eventRows);
  const technical = summarizeTechnical(technicalRows);
  const returning = summarizeReturning(returningRows, funnel.steps.purchases);
  const trust = summarizeTrust(trustPageRows, gscRows);
  const diagnosis = finalDiagnosis(funnel, technical, returning, trust);

  const rowsUpdated = productRows.length + eventRows.length + returningRows.length + technicalRows.length + trustPageRows.length + gscRows.length;
  const syncStatus: SyncStatus = {
    ga4_connected: productReport.ok || eventReport.ok || returningReport.ok || technicalReport.ok || trustPageReport.ok,
    gsc_connected: gscReport.ok,
    rows_updated: rowsUpdated,
    errors,
    missing,
    completed_at: new Date().toISOString(),
  };

  const summary = {
    generated_at: syncStatus.completed_at,
    product: { name: 'KRYO 2.1', url: 'https://everestlabs.co/products/kryo-2-1', path: KRYO_PATH },
    date_ranges: { ga4: { start: '7daysAgo', end: 'today' }, gsc: { start: gscStart, end: gscEnd } },
    sync_status: syncStatus,
    kryo_funnel_leak_summary: funnel,
    website_technical_issue_summary: technical,
    returning_user_journey_summary: returning,
    trust_issue_summary: trust,
    final_diagnosis: diagnosis,
  };

  await upsertSummary(summary, syncStatus);
  return NextResponse.json(summary, { status: errors.length && rowsUpdated === 0 ? 500 : 200 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
