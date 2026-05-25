export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

const KRYO_PATH = '/products/kryo-2-1';
const KRYO_URL = 'https://everestlabs.co/products/kryo-2-1';
const KRYO_COUNTRY_AE_URL = 'https://everestlabs.co/products/kryo-2-1?country=AE';
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
type LivePageCheck = {
  url: string;
  http_status: number | null;
  final_url: string | null;
  page_title: string | null;
  live_fetch_sees_404: boolean;
  appears_product_available: boolean | null;
  currency_signals: string[];
  wrong_market_or_currency_signal: boolean;
  error?: string;
};

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


function stripQuery(path: string): string {
  return path.split('?')[0] || path;
}

function isExactKryoPath(path: string): boolean {
  return stripQuery(path) === KRYO_PATH;
}

function titleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
}

function currencySignalsFromHtml(html: string): string[] {
  const signals = new Set<string>();
  if (/AED|د\.إ|Dhs|Dirham/i.test(html)) signals.add('AED');
  if (/USD|US\$|\$\s?\d/i.test(html)) signals.add('USD');
  if (/GBP|£/i.test(html)) signals.add('GBP');
  if (/EUR|€/i.test(html)) signals.add('EUR');
  return Array.from(signals);
}

async function checkLivePage(url: string): Promise<LivePageCheck> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'user-agent': 'EverestLabs-KRYO-Diagnostics/1.0',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    const title = titleFromHtml(html);
    const haystack = `${res.url} ${title ?? ''} ${html.slice(0, 3000)}`;
    const currencySignals = currencySignalsFromHtml(html);
    const unavailable = /(sold\s*out|out\s*of\s*stock|unavailable|not\s*available)/i.test(haystack);
    const addToCartSignal = /(add\s*to\s*cart|name=["']add["']|\/cart\/add|buy\s*now)/i.test(haystack);
    return {
      url,
      http_status: res.status,
      final_url: res.url,
      page_title: title,
      live_fetch_sees_404: res.status === 404 || /404|not\s*found/i.test(`${title ?? ''} ${html.slice(0, 1000)}`),
      appears_product_available: unavailable ? false : addToCartSignal ? true : null,
      currency_signals: currencySignals,
      wrong_market_or_currency_signal: currencySignals.length > 0 && !currencySignals.includes('AED'),
    };
  } catch (err) {
    return {
      url,
      http_status: null,
      final_url: null,
      page_title: null,
      live_fetch_sees_404: false,
      appears_product_available: null,
      currency_signals: [],
      wrong_market_or_currency_signal: false,
      error: (err as Error).message,
    };
  }
}

function summarizeKryoPageHealth(technicalRows: JsonMap[], canonicalLive: LivePageCheck, aeLive: LivePageCheck) {
  const ga4RowsForKryo = technicalRows
    .filter(r => isExactKryoPath(dim(r, 0)))
    .map(r => ({
      page: dim(r, 0),
      title: dim(r, 1),
      sessions: Math.round(metric(r, 1)),
      pageviews: Math.round(metric(r, 0)),
    }));
  const ga4_404_rows = ga4RowsForKryo.filter(r => /404|not\s*found/i.test(`${r.page} ${r.title}`));
  const country_variant_behaves_differently = Boolean(
    canonicalLive.http_status !== aeLive.http_status ||
    canonicalLive.final_url !== aeLive.final_url ||
    canonicalLive.page_title !== aeLive.page_title ||
    canonicalLive.live_fetch_sees_404 !== aeLive.live_fetch_sees_404 ||
    canonicalLive.wrong_market_or_currency_signal !== aeLive.wrong_market_or_currency_signal
  );
  return {
    product_path: KRYO_PATH,
    canonical_live_check: canonicalLive,
    country_ae_live_check: aeLive,
    country_variant_behaves_differently,
    ga4_saw_404_on_this_path: ga4_404_rows.length > 0,
    ga4_404_rows,
    ga4_rows_for_this_path: ga4RowsForKryo.slice(0, 10),
    page_appears_product_available: canonicalLive.appears_product_available,
    page_appears_wrong_market_or_currency: canonicalLive.wrong_market_or_currency_signal || aeLive.wrong_market_or_currency_signal,
  };
}

function summarizeEventIntegrity(funnel: ReturnType<typeof summarizeFunnel>, pageHealth: ReturnType<typeof summarizeKryoPageHealth>) {
  const s = funnel.steps;
  const contradictions: string[] = [];
  const likelyTrackingGaps: string[] = [];
  const likelyRealLeaks: string[] = [];
  if (s.add_to_carts > 0 && s.cart_views === 0) {
    contradictions.push('add_to_cart exists but view_cart is zero');
    likelyTrackingGaps.push('view_cart is probably missing or the cart drawer/page is not firing GA4 view_cart');
  }
  if (s.begin_checkouts > 0 && s.cart_views === 0) {
    contradictions.push('begin_checkout exists but view_cart is zero');
    likelyTrackingGaps.push('cart step tracking is incomplete before checkout');
  }
  if (s.begin_checkouts > 0 && s.shipping_or_payment_events === 0) {
    contradictions.push('begin_checkout exists but add_shipping_info/add_payment_info are zero');
    likelyTrackingGaps.push('checkout step tracking may stop after begin_checkout, or users cannot reach shipping/payment');
    likelyRealLeaks.push('shipping/payment eligibility may be blocking checkout progression');
  }
  if (s.begin_checkouts > 0 && s.purchases === 0) {
    contradictions.push('begin_checkout exists but purchases are zero');
    likelyRealLeaks.push('checkout/payment/shipping remains a likely real leak unless Shopify orders prove otherwise');
  }
  if (pageHealth.ga4_saw_404_on_this_path || pageHealth.canonical_live_check.live_fetch_sees_404) {
    contradictions.push('KRYO product path has 404 evidence');
    likelyRealLeaks.push('product page routing or market routing may intermittently show a 404');
  }
  return {
    events_seen: s,
    contradictions,
    likely_tracking_gap: likelyTrackingGaps.length > 0,
    likely_tracking_gaps: likelyTrackingGaps,
    likely_real_funnel_leak: likelyRealLeaks.length > 0,
    likely_real_leaks: likelyRealLeaks,
    exact_missing_event_or_step: likelyTrackingGaps[0] ?? likelyRealLeaks[0] ?? null,
  };
}

function summarizeKryoReturning(rows: JsonMap[], purchases: number) {
  const returning = rows.filter(r => /returning/i.test(dim(r, 1)));
  const totalSessions = returning.reduce((s, r) => s + metric(r, 0), 0);
  let toKryo21 = 0, toHome = 0, toCartCheckout = 0;
  const escaped: Record<string, number> = {};
  const landings: Record<string, number> = {};
  for (const r of returning) {
    const landing = dim(r, 0) || '(not set)';
    const sessions = metric(r, 0);
    landings[landing] = (landings[landing] || 0) + sessions;
    if (isExactKryoPath(landing)) toKryo21 += sessions;
    else if (/kryo/i.test(landing)) escaped[landing] = (escaped[landing] || 0) + sessions;
    if (landing === '/' || landing === '(not set)' || /^\/?(en-[a-z]{2})?\/?$/i.test(landing)) toHome += sessions;
    if (/cart|checkout/i.test(landing)) toCartCheckout += sessions;
  }
  return {
    returning_sessions: Math.round(totalSessions),
    return_to_kryo_2_1_sessions: Math.round(toKryo21),
    return_to_homepage_sessions: Math.round(toHome),
    return_to_cart_or_checkout_sessions: Math.round(toCartCheckout),
    not_returning_to_kryo_2_1_buying_path_sessions: Math.max(Math.round(totalSessions - toKryo21 - toCartCheckout - purchases), 0),
    escaped_from_canonical_kryo_2_1_path: topMap(escaped, 10),
    top_returning_landings: topMap(landings, 10),
  };
}

function summarizeKryoTrust(trustPageRows: JsonMap[], gscRows: JsonMap[]) {
  const pageMap: Record<string, number> = {};
  for (const r of trustPageRows) pageMap[dim(r, 0)] = (pageMap[dim(r, 0)] || 0) + metric(r, 0);
  const trustSearches = [] as Array<{ query: string; page: string; date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  for (const r of gscRows) {
    const row = r as GscSearchRow;
    const keys = Array.isArray(row.keys) ? row.keys : [];
    const query = String(keys[0] ?? '').toLowerCase();
    const page = String(keys[1] ?? '');
    const brandOrProductRelated = /(kryo|everest|ice\s*shower)/i.test(`${query} ${page}`);
    if (!brandOrProductRelated || !TRUST_SEARCH_RE.test(query)) continue;
    trustSearches.push({
      query,
      page,
      date: String(keys[2] ?? ''),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    });
  }
  return {
    trust_page_views_near_kryo_2_1: topMap(pageMap, 12),
    trust_pages_after_product_or_add_to_cart: 'not available from current aggregated GA4 report; requires event/session capture or GA4 exploration export',
    kryo_or_everest_trust_search_terms: trustSearches.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    trust_search_impressions: trustSearches.reduce((s, r) => s + r.impressions, 0),
    trust_search_clicks: trustSearches.reduce((s, r) => s + r.clicks, 0),
  };
}

function focusedDiagnosis(
  pageHealth: ReturnType<typeof summarizeKryoPageHealth>,
  integrity: ReturnType<typeof summarizeEventIntegrity>,
  returning: ReturnType<typeof summarizeKryoReturning>,
  trust: ReturnType<typeof summarizeKryoTrust>,
) {
  const evidence: string[] = [];
  const trackingGaps: string[] = [...integrity.likely_tracking_gaps];
  let issue = 'not enough diagnostic data yet';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let next = `continue collecting GA4/GSC data for ${KRYO_PATH}, then re-run the diagnostic.`;

  if (pageHealth.canonical_live_check.live_fetch_sees_404 || pageHealth.ga4_saw_404_on_this_path) {
    issue = 'KRYO 2.1 product page routing is showing 404 evidence.';
    confidence = pageHealth.canonical_live_check.live_fetch_sees_404 ? 'high' : 'medium';
    evidence.push(`GA4 404 rows on ${KRYO_PATH}: ${pageHealth.ga4_404_rows.length}`);
    evidence.push(`Live canonical 404: ${pageHealth.canonical_live_check.live_fetch_sees_404}`);
    next = `manually inspect and fix routing/market availability for https://everestlabs.co${KRYO_PATH} before diagnosing copy or ads.`;
  } else if (integrity.events_seen.add_to_carts > 0 && integrity.events_seen.cart_views === 0) {
    issue = 'KRYO 2.1 cart step tracking or cart drawer/page is broken after add-to-cart.';
    confidence = 'high';
    evidence.push(`${integrity.events_seen.add_to_carts} add_to_cart events but 0 view_cart events.`);
    next = 'manually inspect add-to-cart, cart drawer, cart page, and GA4 view_cart firing for KRYO 2.1.';
  } else if (integrity.events_seen.begin_checkouts > 0 && integrity.events_seen.purchases === 0) {
    issue = 'KRYO 2.1 checkout/payment/shipping is the likely leak after users begin checkout.';
    confidence = 'medium';
    evidence.push(`${integrity.events_seen.begin_checkouts} begin_checkout events but 0 purchases.`);
    next = 'manually inspect checkout shipping/payment eligibility for UAE/Dubai and confirm purchase event tracking.';
  } else if (returning.returning_sessions > 0 && returning.not_returning_to_kryo_2_1_buying_path_sessions > returning.return_to_kryo_2_1_sessions) {
    issue = 'Returning users are not reliably landing back on the KRYO 2.1 buying path.';
    confidence = 'medium';
    evidence.push(`${returning.not_returning_to_kryo_2_1_buying_path_sessions} returning sessions did not land on KRYO 2.1 or cart/checkout.`);
    next = 'inspect return links, organic sitelinks, email/retarget links, and redirects so returning users land on /products/kryo-2-1.';
  } else if (trust.trust_search_impressions > 0 || trust.trust_page_views_near_kryo_2_1.length > 0) {
    issue = 'KRYO 2.1 users are showing trust-resolution behavior before buying.';
    confidence = 'low';
    evidence.push(`${trust.trust_page_views_near_kryo_2_1.length} trust page paths appeared in the GA4 trust report.`);
    next = 'inspect KRYO 2.1 trust proof: shipping, warranty, refund, support, contact and reviews messaging.';
  }

  if (pageHealth.country_variant_behaves_differently) evidence.push('?country=AE behaves differently from the canonical URL.');
  if (pageHealth.page_appears_wrong_market_or_currency) evidence.push('Live page currency/market signals may be wrong for UAE.');
  if (!pageHealth.page_appears_product_available) evidence.push('Live page availability/add-to-cart signal is missing or unavailable.');

  return {
    most_likely_website_issue: issue,
    confidence,
    evidence,
    tracking_gaps: trackingGaps,
    next_manual_inspection_or_fix: next,
  };
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

  const [canonicalLiveCheck, countryAeLiveCheck, productReport, eventReport, returningReport, technicalReport, trustPageReport] = await Promise.all([
    checkLivePage(KRYO_URL),
    checkLivePage(KRYO_COUNTRY_AE_URL),
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }, { name: 'country' }, { name: 'deviceCategory' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }, { name: 'userEngagementDuration' }],
      dimensionFilter: exact('pagePath', KRYO_PATH),
      limit: 1000,
    }),
    gaRunReport(accessToken, propertyId!, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }, { name: 'pagePath' }, { name: 'country' }, { name: 'deviceCategory' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: { expressions: [
          { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_EVENTS, caseSensitive: false } } },
          { orGroup: { expressions: [
            exact('pagePath', KRYO_PATH),
            stringContains('pagePath', 'cart'),
            stringContains('pagePath', 'checkout'),
          ] } },
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
  const pageHealth = summarizeKryoPageHealth(technicalRows, canonicalLiveCheck, countryAeLiveCheck);
  const eventIntegrity = summarizeEventIntegrity(funnel, pageHealth);
  const kryoReturning = summarizeKryoReturning(returningRows, funnel.steps.purchases);
  const kryoTrust = summarizeKryoTrust(trustPageRows, gscRows);
  const diagnosis = finalDiagnosis(funnel, technical, returning, trust);
  const basedOnCurrentData = focusedDiagnosis(pageHealth, eventIntegrity, kryoReturning, kryoTrust);

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
    kryo_2_1_page_health_summary: pageHealth,
    kryo_2_1_event_integrity_summary: eventIntegrity,
    kryo_2_1_returning_summary: kryoReturning,
    kryo_2_1_trust_summary: kryoTrust,
    based_on_current_data: basedOnCurrentData,
    final_diagnosis: diagnosis,
  };

  await upsertSummary(summary, syncStatus);
  return NextResponse.json(summary, { status: errors.length && rowsUpdated === 0 ? 500 : 200 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
