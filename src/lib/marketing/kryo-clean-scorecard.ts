import { createHash, createSign } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type ScorecardWindow = { start: string; end: string };

type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type MetaMetricRow = {
  meta_ad_id: string | null;
  date: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  outbound_clicks: number | null;
  landing_page_views: number | null;
  add_to_carts: number | null;
  initiate_checkouts: number | null;
  purchases: number | null;
  revenue: number | null;
  roas: number | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_name?: string | null;
  adset_name?: string | null;
};

type MetaAdRow = {
  meta_ad_id: string;
  name: string | null;
  meta_adset_id: string | null;
};

type MetaAdsetRow = {
  meta_adset_id: string;
  meta_campaign_id: string | null;
  name: string | null;
};

type MetaCampaignRow = {
  meta_campaign_id: string;
  name: string | null;
};

type AttributionTouchRow = {
  ts: string;
  anonymous_id: string | null;
  event_type: string | null;
  page_path: string | null;
  ip_country: string | null;
  user_agent: string | null;
  traffic_class: string | null;
  is_internal: boolean | null;
  event_metadata: {
    shopify_product_handle?: string | null;
    shopify_variant_id?: string | null;
    internal_reason?: string | null;
    market_handle?: string | null;
    event_properties?: { tracking_source?: string | null } | null;
  } | null;
};

type SiteMetricSummary = {
  total_users: number;
  new_users: number;
  returning_users: number;
  sessions: number;
  engaged_sessions: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue: number;
  ga4_add_to_cart_events: number;
  ga4_checkout_events: number;
  ga4_purchase_events: number;
  ga4_purchase_revenue: number;
  returning_user_rate: number;
  sessions_per_user: number;
  engagement_rate: number;
  session_add_to_cart_rate: number;
  session_checkout_rate: number;
  session_purchase_rate: number;
  user_add_to_cart_rate: number;
  user_checkout_rate: number;
  user_purchase_rate: number;
  add_to_cart_rate: number;
  checkout_rate: number;
  purchase_rate: number;
};

type MetaAdGa4Summary = {
  campaign_id: string;
  ad_id: string;
  total_users: number;
  new_users: number;
  returning_users: number;
  sessions: number;
  engaged_sessions: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue: number;
  returning_user_rate: number;
  sessions_per_user: number;
  add_to_cart_rate: number;
  checkout_rate: number;
  purchase_rate: number;
  session_add_to_cart_rate: number;
  session_checkout_rate: number;
  session_purchase_rate: number;
};

type MetaNativeAccumulator = {
  spend: number;
  impressions: number;
  clicks_all: number;
  outbound_clicks: number;
  landing_page_views: number;
  website_add_to_carts: number;
  initiate_checkouts: number;
  purchases: number;
  revenue: number;
};

type MetaNativeSummary = MetaNativeAccumulator & {
  ctr_all: number;
  cpc_all: number | null;
  cpm: number | null;
  outbound_ctr: number;
  cost_per_outbound_click: number | null;
  cost_per_link_click: number | null;
  cost_per_lpv: number | null;
  landing_page_view_rate_from_outbound: number;
  cost_per_website_atc: number | null;
  landing_page_to_website_atc_rate: number;
  cost_per_initiate_checkout: number | null;
  website_atc_to_initiate_checkout_rate: number;
  cost_per_purchase: number | null;
  initiate_checkout_to_purchase_rate: number;
  purchase_roas: number | null;
  clicks: number;
  ctr: number;
  cpc: number | null;
  link_clicks: number;
};

type EnrichedMetaMetricRow = MetaMetricRow & {
  period: 'current' | 'prior';
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_name: string;
};

type MetaByAdSummary = MetaNativeSummary & {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
};

type MetaJoinedRow = MetaAdGa4Summary & {
  ad_name: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  meta_spend: number;
  meta_impressions: number;
  meta_clicks_all: number;
  meta_outbound_clicks: number;
  meta_landing_page_views: number;
  meta_website_add_to_carts: number;
  meta_initiate_checkouts: number;
  meta_purchases: number;
  meta_revenue: number;
  meta_ctr_all: number;
  meta_cpc_all: number | null;
  meta_cpm: number | null;
  meta_outbound_ctr: number;
  meta_cost_per_outbound_click: number | null;
  meta_cost_per_lpv: number | null;
  meta_cost_per_website_atc: number | null;
  meta_cost_per_initiate_checkout: number | null;
  meta_cost_per_purchase: number | null;
  meta_purchase_roas: number | null;
  spend: number;
  impressions: number;
  clicks_all: number;
  outbound_clicks: number;
  landing_page_views: number;
  website_add_to_carts: number;
  initiate_checkouts: number;
  ctr_all: number;
  cpc_all: number | null;
  cpm: number | null;
  outbound_ctr: number;
  cost_per_outbound_click: number | null;
  cost_per_lpv: number | null;
  cost_per_website_atc: number | null;
  cost_per_initiate_checkout: number | null;
  cost_per_purchase: number | null;
  purchase_roas: number | null;
  clicks: number;
  ctr: number;
  cpc: number | null;
  link_clicks: number;
  ga4_total_users: number;
  ga4_new_users: number;
  ga4_returning_users: number;
  ga4_sessions: number;
  ga4_engaged_sessions: number;
  ga4_add_to_cart_events: number;
  ga4_checkout_events: number;
  ga4_purchase_events: number;
  ga4_revenue: number;
  ga4_returning_user_rate: number;
  ga4_sessions_per_user: number;
  ga4_user_add_to_cart_rate: number;
  ga4_session_add_to_cart_rate: number;
  ga4_user_checkout_rate: number;
  ga4_session_checkout_rate: number;
  ga4_user_purchase_rate: number;
  ga4_session_purchase_rate: number;
};

type ExcludedReason =
  | 'country_hong_kong'
  | 'country_china'
  | 'country_australia'
  | 'internal_flag'
  | 'traffic_class_internal_qa'
  | 'traffic_class_bot'
  | 'crawler_user_agent'
  | 'admin_shopify_referral'
  | 'tom_laptop_pattern';

const EXCLUDED_COUNTRIES = new Set(['Hong Kong', 'China', 'Australia']);
const CRAWLER_PATTERNS = [/applebot/i, /bingbot/i, /headlesschrome/i, /curl\//i];
const PRIMARY_PRODUCT_PATTERNS = [/^kryo/i, /^\/products\/kryo/i];
const BONUS_PRODUCT_PATTERNS = [/performance-flow-upgrade/i, /everestpod/i, /upgrade/i, /upsell/i];

function fmtDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftIso(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function buildWindows(windowDays = 5, compareDays = 5, reportTimeZone = 'Asia/Dubai') {
  const todayInTz = fmtDateInTz(new Date(), reportTimeZone);
  const currentEnd = shiftIso(todayInTz, -1);
  const currentStart = shiftIso(currentEnd, -(windowDays - 1));
  const priorEnd = shiftIso(currentStart, -1);
  const priorStart = shiftIso(priorEnd, -(compareDays - 1));
  return {
    current: { start: currentStart, end: currentEnd },
    prior: { start: priorStart, end: priorEnd },
  };
}

async function getServiceAccountAccessToken(): Promise<string | null> {
  const saJson = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const sa = JSON.parse(Buffer.from(saJson, 'base64').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(sa.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      cache: 'no-store',
    });
    if (!tokenRes.ok) return null;
    const data = await tokenRes.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function getOAuthAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!tokenRes.ok) return null;
  const data = await tokenRes.json();
  return data.access_token ?? null;
}

async function getGoogleAccessToken() {
  const serviceAccountToken = await getServiceAccountAccessToken();
  if (serviceAccountToken) return { accessToken: serviceAccountToken, authMethod: 'service_account' };
  const oauthToken = await getOAuthAccessToken();
  if (oauthToken) return { accessToken: oauthToken, authMethod: 'oauth_refresh_token' };
  return { accessToken: null, authMethod: 'none' };
}

async function runGa4Report(body: Record<string, unknown>): Promise<Ga4Row[]> {
  const propertyId = process.env.GA_PROPERTY_ID;
  if (!propertyId) throw new Error('GA_PROPERTY_ID missing');
  const { accessToken, authMethod } = await getGoogleAccessToken();
  if (!accessToken) throw new Error('No Google Analytics credentials available');

  const execute = async (token: string) => {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`GA4 runReport failed ${res.status}: ${detail.slice(0, 500)}`);
    }
    const json = await res.json();
    return (json.rows ?? []) as Ga4Row[];
  };

  try {
    return await execute(accessToken);
  } catch (error) {
    if (authMethod === 'service_account') {
      const oauthToken = await getOAuthAccessToken();
      if (oauthToken) return execute(oauthToken);
    }
    throw error;
  }
}

function metricNumber(row: Ga4Row, index: number): number {
  const value = row.metricValues?.[index]?.value;
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function firstValue(values: Array<string | undefined>): string {
  return values.find((v) => v && v !== '(not set)' && v !== '(data not available)') ?? '(not set)';
}

function isPaidMetaSource(source: string): boolean {
  const s = source.toLowerCase();
  const hasPlatform = s.includes('meta') || s.includes('facebook') || s.includes('instagram');
  const hasPaid = s.includes('paid') || s.includes('paid_social') || s.includes('cpc');
  return hasPlatform && hasPaid && !s.includes('referral');
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function nullableRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function summariseSiteTotals(rows: Ga4Row[], countryFilter?: string): SiteMetricSummary {
  const totals = {
    total_users: 0,
    new_users: 0,
    returning_users: 0,
    sessions: 0,
    engaged_sessions: 0,
    add_to_carts: 0,
    checkouts: 0,
    purchases: 0,
    revenue: 0,
  };
  for (const row of rows) {
    const country = row.dimensionValues?.[0]?.value ?? '(not set)';
    const newVsReturning = (row.dimensionValues?.[1]?.value ?? '').toLowerCase();
    if (EXCLUDED_COUNTRIES.has(country)) continue;
    if (countryFilter && country !== countryFilter) continue;
    const users = metricNumber(row, 0);
    totals.total_users += users;
    totals.sessions += metricNumber(row, 1);
    totals.engaged_sessions += metricNumber(row, 2);
    totals.add_to_carts += metricNumber(row, 3);
    totals.checkouts += metricNumber(row, 4);
    totals.purchases += metricNumber(row, 5);
    totals.revenue += metricNumber(row, 6);
    if (newVsReturning.startsWith('return')) totals.returning_users += users;
    else totals.new_users += users;
  }

  return {
    ...totals,
    ga4_add_to_cart_events: totals.add_to_carts,
    ga4_checkout_events: totals.checkouts,
    ga4_purchase_events: totals.purchases,
    ga4_purchase_revenue: totals.revenue,
    returning_user_rate: rate(totals.returning_users, totals.total_users),
    sessions_per_user: rate(totals.sessions, totals.total_users),
    engagement_rate: rate(totals.engaged_sessions, totals.sessions),
    session_add_to_cart_rate: rate(totals.add_to_carts, totals.sessions),
    session_checkout_rate: rate(totals.checkouts, totals.sessions),
    session_purchase_rate: rate(totals.purchases, totals.sessions),
    user_add_to_cart_rate: rate(totals.add_to_carts, totals.total_users),
    user_checkout_rate: rate(totals.checkouts, totals.total_users),
    user_purchase_rate: rate(totals.purchases, totals.total_users),
    add_to_cart_rate: rate(totals.add_to_carts, totals.total_users),
    checkout_rate: rate(totals.checkouts, totals.total_users),
    purchase_rate: rate(totals.purchases, totals.total_users),
  };
}

function summariseMetaAdRows(rows: Ga4Row[]): MetaAdGa4Summary[] {
  const map = new Map<string, Omit<MetaAdGa4Summary, 'returning_user_rate' | 'sessions_per_user' | 'add_to_cart_rate' | 'checkout_rate' | 'purchase_rate' | 'session_add_to_cart_rate' | 'session_checkout_rate' | 'session_purchase_rate'>>();
  for (const row of rows) {
    const country = row.dimensionValues?.[0]?.value ?? '(not set)';
    if (EXCLUDED_COUNTRIES.has(country)) continue;
    const firstSource = firstValue([
      row.dimensionValues?.[1]?.value,
      row.dimensionValues?.[2]?.value,
    ]);
    if (!isPaidMetaSource(firstSource)) continue;
    const campaignId = row.dimensionValues?.[3]?.value ?? '(not set)';
    const adId = row.dimensionValues?.[4]?.value ?? '(not set)';
    const nvr = (row.dimensionValues?.[5]?.value ?? '').toLowerCase();
    const key = createHash('sha1').update(`${campaignId}\u001f${adId}`).digest('hex');
    const existing = map.get(key) ?? {
      campaign_id: campaignId,
      ad_id: adId,
      total_users: 0,
      new_users: 0,
      returning_users: 0,
      sessions: 0,
      engaged_sessions: 0,
      add_to_carts: 0,
      checkouts: 0,
      purchases: 0,
      revenue: 0,
    };
    const users = metricNumber(row, 0);
    existing.total_users += users;
    existing.sessions += metricNumber(row, 1);
    existing.engaged_sessions += metricNumber(row, 2);
    existing.add_to_carts += metricNumber(row, 3);
    existing.checkouts += metricNumber(row, 4);
    existing.purchases += metricNumber(row, 5);
    existing.revenue += metricNumber(row, 6);
    if (nvr.startsWith('return')) existing.returning_users += users;
    else existing.new_users += users;
    map.set(key, existing);
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    returning_user_rate: rate(row.returning_users, row.total_users),
    sessions_per_user: rate(row.sessions, row.total_users),
    add_to_cart_rate: rate(row.add_to_carts, row.total_users),
    checkout_rate: rate(row.checkouts, row.total_users),
    purchase_rate: rate(row.purchases, row.total_users),
    session_add_to_cart_rate: rate(row.add_to_carts, row.sessions),
    session_checkout_rate: rate(row.checkouts, row.sessions),
    session_purchase_rate: rate(row.purchases, row.sessions),
  }));
}

function summariseReturningSource(rows: Ga4Row[]) {
  const totals = new Map<string, { session_source_medium: string; session_campaign_name: string; sessions: number; users: number; add_to_carts: number; checkouts: number; purchases: number; revenue: number }>();
  for (const row of rows) {
    const country = row.dimensionValues?.[0]?.value ?? '(not set)';
    if (EXCLUDED_COUNTRIES.has(country)) continue;
    const source = row.dimensionValues?.[1]?.value ?? '(not set)';
    const campaign = row.dimensionValues?.[2]?.value ?? '(not set)';
    const key = `${source}\u001f${campaign}`;
    const existing = totals.get(key) ?? { session_source_medium: source, session_campaign_name: campaign, sessions: 0, users: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue: 0 };
    existing.users += metricNumber(row, 0);
    existing.sessions += metricNumber(row, 1);
    existing.add_to_carts += metricNumber(row, 2);
    existing.checkouts += metricNumber(row, 3);
    existing.purchases += metricNumber(row, 4);
    existing.revenue += metricNumber(row, 5);
    totals.set(key, existing);
  }
  return Array.from(totals.values()).sort((a, b) => b.sessions - a.sessions);
}

function summariseReturningPaths(rows: Ga4Row[]) {
  const totals = new Map<string, { campaign_id: string; ad_id: string; page_path: string; session_source_medium: string; session_campaign_name: string; sessions: number; users: number; add_to_carts: number; checkouts: number; purchases: number; revenue: number }>();
  for (const row of rows) {
    const country = row.dimensionValues?.[0]?.value ?? '(not set)';
    if (EXCLUDED_COUNTRIES.has(country)) continue;
    const firstSource = firstValue([row.dimensionValues?.[1]?.value, row.dimensionValues?.[2]?.value]);
    if (!isPaidMetaSource(firstSource)) continue;
    const campaignId = row.dimensionValues?.[3]?.value ?? '(not set)';
    const adId = row.dimensionValues?.[4]?.value ?? '(not set)';
    const pagePath = row.dimensionValues?.[5]?.value ?? '(not set)';
    const sessionSource = row.dimensionValues?.[6]?.value ?? '(not set)';
    const sessionCampaign = row.dimensionValues?.[7]?.value ?? '(not set)';
    const key = `${campaignId}\u001f${adId}\u001f${pagePath}\u001f${sessionSource}\u001f${sessionCampaign}`;
    const existing = totals.get(key) ?? { campaign_id: campaignId, ad_id: adId, page_path: pagePath, session_source_medium: sessionSource, session_campaign_name: sessionCampaign, sessions: 0, users: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue: 0 };
    existing.users += metricNumber(row, 0);
    existing.sessions += metricNumber(row, 1);
    existing.add_to_carts += metricNumber(row, 2);
    existing.checkouts += metricNumber(row, 3);
    existing.purchases += metricNumber(row, 4);
    existing.revenue += metricNumber(row, 5);
    totals.set(key, existing);
  }
  return Array.from(totals.values()).sort((a, b) => b.sessions - a.sessions);
}

function classifyTouchExclusion(row: AttributionTouchRow): ExcludedReason[] {
  const reasons: ExcludedReason[] = [];
  const country = row.ip_country ?? '';
  const ua = row.user_agent ?? '';
  if (country === 'HK') reasons.push('country_hong_kong');
  if (country === 'CN') reasons.push('country_china');
  if (country === 'AU') reasons.push('country_australia');
  if (row.is_internal) reasons.push('internal_flag');
  if (row.traffic_class === 'internal_qa') reasons.push('traffic_class_internal_qa');
  if (row.traffic_class === 'bot') reasons.push('traffic_class_bot');
  if (CRAWLER_PATTERNS.some((pattern) => pattern.test(ua))) reasons.push('crawler_user_agent');
  if (country === 'HK' && /Macintosh; Intel Mac OS X/i.test(ua) && /Chrome\//i.test(ua)) reasons.push('tom_laptop_pattern');
  return reasons;
}

function isPrimaryAddToCart(row: AttributionTouchRow): boolean {
  const handle = row.event_metadata?.shopify_product_handle ?? '';
  const pagePath = row.page_path ?? '';
  return PRIMARY_PRODUCT_PATTERNS.some((pattern) => pattern.test(handle) || pattern.test(pagePath));
}

function isBonusAddToCart(row: AttributionTouchRow): boolean {
  const handle = row.event_metadata?.shopify_product_handle ?? '';
  const pagePath = row.page_path ?? '';
  return BONUS_PRODUCT_PATTERNS.some((pattern) => pattern.test(handle) || pattern.test(pagePath));
}

function inWindow(ts: string, window: ScorecardWindow): boolean {
  return ts >= `${window.start}T00:00:00` && ts < `${shiftIso(window.end, 1)}T00:00:00`;
}

function summariseAtc(rows: AttributionTouchRow[], window: ScorecardWindow) {
  const canonical = rows.filter((row) => inWindow(row.ts, window) && classifyTouchExclusion(row).length === 0);
  const primaryUsers = new Set<string>();
  const bonusUsers = new Set<string>();
  const failedUsers = new Set<string>();
  let primaryEvents = 0;
  let bonusEvents = 0;
  let unknownEvents = 0;
  let cartAddRequests = 0;
  let cartAddFailed = 0;

  for (const row of canonical) {
    if (!row.event_type) continue;
    const anonId = row.anonymous_id ?? `anon:${row.ts}`;
    if (row.event_type === 'cart_add_request') cartAddRequests += 1;
    if (row.event_type === 'cart_add_failed') {
      cartAddFailed += 1;
      failedUsers.add(anonId);
    }
    if (row.event_type !== 'add_to_cart') continue;
    if (isPrimaryAddToCart(row)) {
      primaryEvents += 1;
      primaryUsers.add(anonId);
    } else if (isBonusAddToCart(row)) {
      bonusEvents += 1;
      bonusUsers.add(anonId);
    } else {
      unknownEvents += 1;
    }
  }

  return {
    primary_atc_users: primaryUsers.size,
    primary_atc_events: primaryEvents,
    bonus_atc_users: bonusUsers.size,
    bonus_atc_events: bonusEvents,
    unattributed_atc_events: unknownEvents,
    cart_add_request_events: cartAddRequests,
    cart_add_failed_events: cartAddFailed,
    cart_add_failed_users: failedUsers.size,
  };
}

async function fetchAllAttributionTouches(supabase: SupabaseClient, earliestDate: string, latestDateExclusive: string) {
  const pageSize = 1000;
  const rows: AttributionTouchRow[] = [];
  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabase
      .from('attribution_touches')
      .select('ts,anonymous_id,event_type,page_path,ip_country,user_agent,traffic_class,is_internal,event_metadata')
      .gte('ts', `${earliestDate}T00:00:00Z`)
      .lt('ts', `${latestDateExclusive}T00:00:00Z`)
      .order('ts', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`attribution_touches query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as AttributionTouchRow[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

async function fetchExcludedGa4Audit(supabase: SupabaseClient, earliestDate: string, latestDateExclusive: string) {
  const { data, error } = await supabase
    .from('ga4_page_hourly')
    .select('date_hour,country,session_source_medium,sessions')
    .gte('report_hour', `${earliestDate}T00:00:00Z`)
    .lt('report_hour', `${latestDateExclusive}T00:00:00Z`)
    .limit(50000);
  if (error) throw new Error(`ga4_page_hourly query failed: ${error.message}`);
  return (data ?? []) as Array<{ date_hour: string; country: string | null; session_source_medium: string | null; sessions: number | null }>;
}

function summariseExcludedAudit(hourlyRows: Array<{ date_hour: string; country: string | null; session_source_medium: string | null; sessions: number | null }>, window: ScorecardWindow) {
  const startKey = window.start.replace(/-/g, '');
  const endExclusiveKey = shiftIso(window.end, 1).replace(/-/g, '');
  const byReason = new Map<string, number>();
  for (const row of hourlyRows) {
    const dateKey = (row.date_hour ?? '').slice(0, 8);
    if (dateKey < startKey || dateKey >= endExclusiveKey) continue;
    const sessions = row.sessions ?? 0;
    const country = row.country ?? '(not set)';
    const source = row.session_source_medium ?? '(not set)';
    if (country === 'Hong Kong') byReason.set('country_hong_kong', (byReason.get('country_hong_kong') ?? 0) + sessions);
    if (country === 'China') byReason.set('country_china', (byReason.get('country_china') ?? 0) + sessions);
    if (country === 'Australia') byReason.set('country_australia', (byReason.get('country_australia') ?? 0) + sessions);
    if (source === 'admin.shopify.com / referral') byReason.set('admin_shopify_referral', (byReason.get('admin_shopify_referral') ?? 0) + sessions);
  }
  return Array.from(byReason.entries())
    .map(([reason, sessions]) => ({ reason, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
}

function isKryoMetaScope(campaignName: string, adName: string) {
  const haystack = `${campaignName} ${adName}`.toLowerCase();
  return haystack.includes('kryo');
}

function emptyMetaAccumulator(): MetaNativeAccumulator {
  return {
    spend: 0,
    impressions: 0,
    clicks_all: 0,
    outbound_clicks: 0,
    landing_page_views: 0,
    website_add_to_carts: 0,
    initiate_checkouts: 0,
    purchases: 0,
    revenue: 0,
  };
}

function accumulateMetaMetric(acc: MetaNativeAccumulator, row: MetaNativeAccumulator) {
  acc.spend += Number(row.spend ?? 0);
  acc.impressions += Number(row.impressions ?? 0);
  acc.clicks_all += Number(row.clicks_all ?? 0);
  acc.outbound_clicks += Number(row.outbound_clicks ?? 0);
  acc.landing_page_views += Number(row.landing_page_views ?? 0);
  acc.website_add_to_carts += Number(row.website_add_to_carts ?? 0);
  acc.initiate_checkouts += Number(row.initiate_checkouts ?? 0);
  acc.purchases += Number(row.purchases ?? 0);
  acc.revenue += Number(row.revenue ?? 0);
}

function finalizeMetaAccumulator(acc: MetaNativeAccumulator): MetaNativeSummary {
  const ctrAll = rate(acc.clicks_all, acc.impressions);
  const outboundCtr = rate(acc.outbound_clicks, acc.impressions);
  const cpcAll = nullableRate(acc.spend, acc.clicks_all);
  const cpm = acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : null;
  const costPerOutboundClick = nullableRate(acc.spend, acc.outbound_clicks);
  const costPerLpv = nullableRate(acc.spend, acc.landing_page_views);
  const costPerWebsiteAtc = nullableRate(acc.spend, acc.website_add_to_carts);
  const costPerInitiateCheckout = nullableRate(acc.spend, acc.initiate_checkouts);
  const costPerPurchase = nullableRate(acc.spend, acc.purchases);
  const purchaseRoas = acc.spend > 0 ? acc.revenue / acc.spend : null;

  return {
    ...acc,
    ctr_all: ctrAll,
    cpc_all: cpcAll,
    cpm,
    outbound_ctr: outboundCtr,
    cost_per_outbound_click: costPerOutboundClick,
    cost_per_link_click: costPerOutboundClick,
    cost_per_lpv: costPerLpv,
    landing_page_view_rate_from_outbound: rate(acc.landing_page_views, acc.outbound_clicks),
    cost_per_website_atc: costPerWebsiteAtc,
    landing_page_to_website_atc_rate: rate(acc.website_add_to_carts, acc.landing_page_views),
    cost_per_initiate_checkout: costPerInitiateCheckout,
    website_atc_to_initiate_checkout_rate: rate(acc.initiate_checkouts, acc.website_add_to_carts),
    cost_per_purchase: costPerPurchase,
    initiate_checkout_to_purchase_rate: rate(acc.purchases, acc.initiate_checkouts),
    purchase_roas: purchaseRoas,
    clicks: acc.clicks_all,
    ctr: ctrAll,
    cpc: cpcAll,
    link_clicks: acc.outbound_clicks,
  };
}

async function fetchMetaPerformanceDataset(supabase: SupabaseClient, windows: { current: ScorecardWindow; prior: ScorecardWindow }) {
  const [adsRes, adsetsRes, campaignsRes, metricsRes] = await Promise.all([
    supabase.from('meta_ads').select('meta_ad_id,name,meta_adset_id').limit(5000),
    supabase.from('meta_adsets').select('meta_adset_id,meta_campaign_id,name').limit(5000),
    supabase.from('meta_campaigns').select('meta_campaign_id,name').limit(5000),
    supabase
      .from('meta_ad_metrics_daily')
      .select('meta_ad_id,date,spend,impressions,clicks,outbound_clicks,landing_page_views,add_to_carts,initiate_checkouts,purchases,revenue,roas,campaign_id,adset_id,ad_name,adset_name')
      .gte('date', windows.prior.start)
      .lte('date', windows.current.end)
      .limit(50000),
  ]);

  if (adsRes.error) throw new Error(`meta_ads query failed: ${adsRes.error.message}`);
  if (adsetsRes.error) throw new Error(`meta_adsets query failed: ${adsetsRes.error.message}`);
  if (campaignsRes.error) throw new Error(`meta_campaigns query failed: ${campaignsRes.error.message}`);
  if (metricsRes.error) throw new Error(`meta_ad_metrics_daily query failed: ${metricsRes.error.message}`);

  const adsById = new Map<string, MetaAdRow>((adsRes.data ?? []).map((row) => [row.meta_ad_id, row as MetaAdRow]));
  const adsetsById = new Map<string, MetaAdsetRow>((adsetsRes.data ?? []).map((row) => [row.meta_adset_id, row as MetaAdsetRow]));
  const campaignsById = new Map<string, MetaCampaignRow>((campaignsRes.data ?? []).map((row) => [row.meta_campaign_id, row as MetaCampaignRow]));

  const enrichedRows: EnrichedMetaMetricRow[] = [];
  for (const row of (metricsRes.data ?? []) as MetaMetricRow[]) {
    if (!row.meta_ad_id) continue;
    const period = row.date >= windows.current.start ? 'current' : 'prior';
    const adMeta = adsById.get(row.meta_ad_id);
    const adsetId = row.adset_id ?? adMeta?.meta_adset_id ?? '';
    const adsetMeta = adsetId ? adsetsById.get(adsetId) : undefined;
    const campaignId = row.campaign_id ?? adsetMeta?.meta_campaign_id ?? '';
    const campaignMeta = campaignId ? campaignsById.get(campaignId) : undefined;
    const adName = row.ad_name ?? adMeta?.name ?? row.meta_ad_id;
    const adsetName = row.adset_name ?? adsetMeta?.name ?? adsetId ?? '(not set)';
    const campaignName = campaignMeta?.name ?? campaignId ?? '(not set)';
    if (!isKryoMetaScope(campaignName, adName)) continue;

    enrichedRows.push({
      ...row,
      period,
      campaign_id: campaignId || '(not set)',
      campaign_name: campaignName || '(not set)',
      adset_id: adsetId || '(not set)',
      adset_name: adsetName || '(not set)',
      ad_name: adName || row.meta_ad_id,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      outbound_clicks: Number(row.outbound_clicks ?? 0),
      landing_page_views: Number(row.landing_page_views ?? 0),
      add_to_carts: Number(row.add_to_carts ?? 0),
      initiate_checkouts: Number(row.initiate_checkouts ?? 0),
      purchases: Number(row.purchases ?? 0),
      revenue: Number(row.revenue ?? 0),
      roas: row.roas == null ? null : Number(row.roas),
    });
  }

  const overviewAcc = {
    current: emptyMetaAccumulator(),
    prior: emptyMetaAccumulator(),
  };
  const byAd = new Map<string, MetaByAdSummary>();

  for (const row of enrichedRows) {
    const rowMetrics = {
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks_all: Number(row.clicks ?? 0),
      outbound_clicks: Number(row.outbound_clicks ?? 0),
      landing_page_views: Number(row.landing_page_views ?? 0),
      website_add_to_carts: Number(row.add_to_carts ?? 0),
      initiate_checkouts: Number(row.initiate_checkouts ?? 0),
      purchases: Number(row.purchases ?? 0),
      revenue: Number(row.revenue ?? 0),
    };
    accumulateMetaMetric(overviewAcc[row.period], rowMetrics);

    const key = `${row.period}\u001f${row.meta_ad_id}`;
    const existing = byAd.get(key) ?? {
      ad_id: row.meta_ad_id ?? '(not set)',
      ad_name: row.ad_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      ...finalizeMetaAccumulator(emptyMetaAccumulator()),
    };
    const acc = {
      spend: existing.spend,
      impressions: existing.impressions,
      clicks_all: existing.clicks_all,
      outbound_clicks: existing.outbound_clicks,
      landing_page_views: existing.landing_page_views,
      website_add_to_carts: existing.website_add_to_carts,
      initiate_checkouts: existing.initiate_checkouts,
      purchases: existing.purchases,
      revenue: existing.revenue,
    };
    accumulateMetaMetric(acc, rowMetrics);
    byAd.set(key, {
      ad_id: row.meta_ad_id ?? '(not set)',
      ad_name: row.ad_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      ...finalizeMetaAccumulator(acc),
    });
  }

  return {
    overview: {
      current: finalizeMetaAccumulator(overviewAcc.current),
      prior: finalizeMetaAccumulator(overviewAcc.prior),
    },
    byAd,
  };
}

function withMetaJoin(rows: MetaAdGa4Summary[], byAd: Map<string, MetaByAdSummary>, period: 'current' | 'prior'): MetaJoinedRow[] {
  return rows.map((row) => {
    const fallbackMeta = {
      ad_id: String(row.ad_id ?? '(not set)'),
      ad_name: String(row.ad_id ?? '(not set)'),
      campaign_id: String(row.campaign_id ?? '(not set)'),
      campaign_name: String(row.campaign_id ?? '(not set)'),
      adset_id: '(not set)',
      adset_name: '(not set)',
      ...finalizeMetaAccumulator(emptyMetaAccumulator()),
    };
    const meta = byAd.get(`${period}\u001f${row.ad_id}`) ?? fallbackMeta;
    return {
      ...row,
      ad_name: meta.ad_name,
      campaign_name: meta.campaign_name,
      adset_id: meta.adset_id,
      adset_name: meta.adset_name,
      meta_spend: meta.spend,
      meta_impressions: meta.impressions,
      meta_clicks_all: meta.clicks_all,
      meta_outbound_clicks: meta.outbound_clicks,
      meta_landing_page_views: meta.landing_page_views,
      meta_website_add_to_carts: meta.website_add_to_carts,
      meta_initiate_checkouts: meta.initiate_checkouts,
      meta_purchases: meta.purchases,
      meta_revenue: meta.revenue,
      meta_ctr_all: meta.ctr_all,
      meta_cpc_all: meta.cpc_all,
      meta_cpm: meta.cpm,
      meta_outbound_ctr: meta.outbound_ctr,
      meta_cost_per_outbound_click: meta.cost_per_outbound_click,
      meta_cost_per_lpv: meta.cost_per_lpv,
      meta_cost_per_website_atc: meta.cost_per_website_atc,
      meta_cost_per_initiate_checkout: meta.cost_per_initiate_checkout,
      meta_cost_per_purchase: meta.cost_per_purchase,
      meta_purchase_roas: meta.purchase_roas,
      spend: meta.spend,
      impressions: meta.impressions,
      clicks_all: meta.clicks_all,
      outbound_clicks: meta.outbound_clicks,
      landing_page_views: meta.landing_page_views,
      website_add_to_carts: meta.website_add_to_carts,
      initiate_checkouts: meta.initiate_checkouts,
      ctr_all: meta.ctr_all,
      cpc_all: meta.cpc_all,
      cpm: meta.cpm,
      outbound_ctr: meta.outbound_ctr,
      cost_per_outbound_click: meta.cost_per_outbound_click,
      cost_per_lpv: meta.cost_per_lpv,
      cost_per_website_atc: meta.cost_per_website_atc,
      cost_per_initiate_checkout: meta.cost_per_initiate_checkout,
      cost_per_purchase: meta.cost_per_purchase,
      purchase_roas: meta.purchase_roas,
      clicks: meta.clicks,
      ctr: meta.ctr,
      cpc: meta.cpc,
      link_clicks: meta.link_clicks,
      ga4_total_users: row.total_users,
      ga4_new_users: row.new_users,
      ga4_returning_users: row.returning_users,
      ga4_sessions: row.sessions,
      ga4_engaged_sessions: row.engaged_sessions,
      ga4_add_to_cart_events: row.add_to_carts,
      ga4_checkout_events: row.checkouts,
      ga4_purchase_events: row.purchases,
      ga4_revenue: row.revenue,
      ga4_returning_user_rate: row.returning_user_rate,
      ga4_sessions_per_user: row.sessions_per_user,
      ga4_user_add_to_cart_rate: row.add_to_cart_rate,
      ga4_session_add_to_cart_rate: row.session_add_to_cart_rate,
      ga4_user_checkout_rate: row.checkout_rate,
      ga4_session_checkout_rate: row.session_checkout_rate,
      ga4_user_purchase_rate: row.purchase_rate,
      ga4_session_purchase_rate: row.session_purchase_rate,
    };
  });
}

function buildMathCheck(name: string, actual: number | null, expected: number | null, tolerance = 1e-9) {
  const variance = actual == null || expected == null ? null : actual - expected;
  const absolute_variance = variance == null ? null : Math.abs(variance);
  return {
    name,
    actual,
    expected,
    variance,
    absolute_variance,
    status: absolute_variance == null ? 'not_applicable' : absolute_variance <= tolerance ? 'ok' : 'warning',
  };
}

export async function buildKryoCleanScorecard(supabase: SupabaseClient, opts?: { windowDays?: number; compareDays?: number; reportTimeZone?: string }) {
  const windows = buildWindows(opts?.windowDays ?? 5, opts?.compareDays ?? 5, opts?.reportTimeZone ?? 'Asia/Dubai');
  const fullEndExclusive = shiftIso(windows.current.end, 1);
  const ga4Metrics = [
    { name: 'totalUsers' },
    { name: 'sessions' },
    { name: 'engagedSessions' },
    { name: 'addToCarts' },
    { name: 'checkouts' },
    { name: 'ecommercePurchases' },
    { name: 'purchaseRevenue' },
    { name: 'sessionsPerUser' },
  ];

  const siteTotalsBody = (window: ScorecardWindow) => ({
    dateRanges: [{ startDate: window.start, endDate: window.end }],
    dimensions: [{ name: 'country' }, { name: 'newVsReturning' }],
    metrics: ga4Metrics,
    limit: 1000,
  });

  const metaFilter = {
    orGroup: {
      expressions: [
        { filter: { fieldName: 'firstUserManualSourceMedium', stringFilter: { value: 'meta', matchType: 'CONTAINS', caseSensitive: false } } },
        { filter: { fieldName: 'firstUserManualSourceMedium', stringFilter: { value: 'facebook', matchType: 'CONTAINS', caseSensitive: false } } },
        { filter: { fieldName: 'firstUserManualSourceMedium', stringFilter: { value: 'instagram', matchType: 'CONTAINS', caseSensitive: false } } },
        { filter: { fieldName: 'firstUserSourceMedium', stringFilter: { value: 'meta', matchType: 'CONTAINS', caseSensitive: false } } },
        { filter: { fieldName: 'firstUserSourceMedium', stringFilter: { value: 'facebook', matchType: 'CONTAINS', caseSensitive: false } } },
        { filter: { fieldName: 'firstUserSourceMedium', stringFilter: { value: 'instagram', matchType: 'CONTAINS', caseSensitive: false } } },
      ],
    },
  };

  const metaTotalsBody = (window: ScorecardWindow) => ({
    dateRanges: [{ startDate: window.start, endDate: window.end }],
    dimensions: [
      { name: 'country' },
      { name: 'firstUserManualSourceMedium' },
      { name: 'firstUserSourceMedium' },
      { name: 'firstUserManualCampaignName' },
      { name: 'firstUserManualAdContent' },
      { name: 'newVsReturning' },
    ],
    metrics: ga4Metrics,
    dimensionFilter: metaFilter,
    limit: 5000,
  });

  const returningSourceBody = (window: ScorecardWindow) => ({
    dateRanges: [{ startDate: window.start, endDate: window.end }],
    dimensions: [{ name: 'country' }, { name: 'sessionSourceMedium' }, { name: 'sessionCampaignName' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'addToCarts' },
      { name: 'checkouts' },
      { name: 'ecommercePurchases' },
      { name: 'purchaseRevenue' },
    ],
    dimensionFilter: { filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning', matchType: 'EXACT' } } },
    limit: 5000,
  });

  const metaReturningPathsBody = (window: ScorecardWindow) => ({
    dateRanges: [{ startDate: window.start, endDate: window.end }],
    dimensions: [
      { name: 'country' },
      { name: 'firstUserManualSourceMedium' },
      { name: 'firstUserSourceMedium' },
      { name: 'firstUserManualCampaignName' },
      { name: 'firstUserManualAdContent' },
      { name: 'pagePath' },
      { name: 'sessionSourceMedium' },
      { name: 'sessionCampaignName' },
    ],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'addToCarts' },
      { name: 'checkouts' },
      { name: 'ecommercePurchases' },
      { name: 'purchaseRevenue' },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          metaFilter,
          { filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning', matchType: 'EXACT' } } },
        ],
      },
    },
    limit: 5000,
  });

  const [
    currentSiteRows,
    priorSiteRows,
    currentMetaRows,
    priorMetaRows,
    currentReturningSourceRows,
    priorReturningSourceRows,
    currentReturningPathRows,
    priorReturningPathRows,
    touchRows,
    excludedAuditRows,
    metaDataset,
  ] = await Promise.all([
    runGa4Report(siteTotalsBody(windows.current)),
    runGa4Report(siteTotalsBody(windows.prior)),
    runGa4Report(metaTotalsBody(windows.current)),
    runGa4Report(metaTotalsBody(windows.prior)),
    runGa4Report(returningSourceBody(windows.current)),
    runGa4Report(returningSourceBody(windows.prior)),
    runGa4Report(metaReturningPathsBody(windows.current)),
    runGa4Report(metaReturningPathsBody(windows.prior)),
    fetchAllAttributionTouches(supabase, windows.prior.start, fullEndExclusive),
    fetchExcludedGa4Audit(supabase, windows.prior.start, fullEndExclusive),
    fetchMetaPerformanceDataset(supabase, windows),
  ]);

  const currentSite = summariseSiteTotals(currentSiteRows);
  const priorSite = summariseSiteTotals(priorSiteRows);
  const currentUae = summariseSiteTotals(currentSiteRows, 'United Arab Emirates');
  const priorUae = summariseSiteTotals(priorSiteRows, 'United Arab Emirates');
  const currentMetaAdsRaw = summariseMetaAdRows(currentMetaRows);
  const priorMetaAdsRaw = summariseMetaAdRows(priorMetaRows);

  const currentMetaAds = withMetaJoin(currentMetaAdsRaw, metaDataset.byAd, 'current')
    .sort((a, b) => Number(b.ga4_returning_users) - Number(a.ga4_returning_users) || Number(b.ga4_total_users) - Number(a.ga4_total_users));
  const priorMetaAds = withMetaJoin(priorMetaAdsRaw, metaDataset.byAd, 'prior')
    .sort((a, b) => Number(b.ga4_returning_users) - Number(a.ga4_returning_users) || Number(b.ga4_total_users) - Number(a.ga4_total_users));

  const currentAtc = summariseAtc(touchRows, windows.current);
  const priorAtc = summariseAtc(touchRows, windows.prior);
  const currentExcludedAudit = summariseExcludedAudit(excludedAuditRows, windows.current);
  const priorExcludedAudit = summariseExcludedAudit(excludedAuditRows, windows.prior);

  const excludedTouchReasons = (window: ScorecardWindow) => {
    const counts = new Map<string, number>();
    for (const row of touchRows) {
      if (!inWindow(row.ts, window)) continue;
      for (const reason of classifyTouchExclusion(row)) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([reason, rows]) => ({ reason, rows })).sort((a, b) => b.rows - a.rows);
  };

  const { data: canonicalSearchRows, error: canonicalSearchError } = await supabase
    .from('kryo_search_daily')
    .select('report_date,query,page,country,device,clicks,impressions,avg_position')
    .gte('report_date', windows.prior.start)
    .lte('report_date', windows.current.end)
    .order('report_date', { ascending: false })
    .limit(500);

  if (canonicalSearchError && !canonicalSearchError.message.includes("Could not find the table 'public.kryo_search_daily'")) {
    throw new Error(`kryo_search_daily query failed: ${canonicalSearchError.message}`);
  }

  const hasCanonicalSearch = Array.isArray(canonicalSearchRows) && canonicalSearchRows.length > 0;

  const { data: legacySearchRows, error: legacySearchError } = hasCanonicalSearch
    ? { data: [], error: null as null | { message: string } }
    : await supabase
        .from('brand_tracking_daily')
        .select('date,term,clicks,impressions,avg_position')
        .gte('date', windows.prior.start)
        .lte('date', windows.current.end)
        .order('date', { ascending: false })
        .limit(200);

  if (legacySearchError) throw new Error(`brand_tracking_daily query failed: ${legacySearchError.message}`);

  const searchSummary = (window: ScorecardWindow) => {
    if (hasCanonicalSearch) {
      return (canonicalSearchRows ?? [])
        .filter((row) => row.report_date >= window.start && row.report_date <= window.end)
        .reduce<Record<string, { term: string; clicks: number; impressions: number; weighted_position_sum: number }>>((acc, row) => {
          const key = row.query ?? '(not set)';
          acc[key] ??= { term: key, clicks: 0, impressions: 0, weighted_position_sum: 0 };
          acc[key].clicks += Number(row.clicks ?? 0);
          acc[key].impressions += Number(row.impressions ?? 0);
          acc[key].weighted_position_sum += Number(row.avg_position ?? 0) * Number(row.impressions ?? 0);
          return acc;
        }, {});
    }

    return (legacySearchRows ?? [])
      .filter((row) => row.date >= window.start && row.date <= window.end)
      .reduce<Record<string, { term: string; clicks: number; impressions: number; weighted_position_sum: number }>>((acc, row) => {
        const key = row.term ?? '(not set)';
        acc[key] ??= { term: key, clicks: 0, impressions: 0, weighted_position_sum: 0 };
        acc[key].clicks += Number(row.clicks ?? 0);
        acc[key].impressions += Number(row.impressions ?? 0);
        acc[key].weighted_position_sum += Number(row.avg_position ?? 0) * Number(row.impressions ?? 0);
        return acc;
      }, {});
  };

  const foldSearch = (window: ScorecardWindow) =>
    Object.values(searchSummary(window))
      .map((row) => ({
        term: row.term,
        clicks: row.clicks,
        impressions: row.impressions,
        avg_position: row.impressions > 0 ? row.weighted_position_sum / row.impressions : null,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

  const blendedOverview = {
    current: {
      meta_spend: metaDataset.overview.current.spend,
      site_revenue: currentSite.revenue,
      blended_roas: metaDataset.overview.current.spend > 0 ? currentSite.revenue / metaDataset.overview.current.spend : null,
      site_session_conversion_rate: currentSite.session_purchase_rate,
      site_user_conversion_rate: currentSite.user_purchase_rate,
      site_session_add_to_cart_rate: currentSite.session_add_to_cart_rate,
      site_user_add_to_cart_rate: currentSite.user_add_to_cart_rate,
      ga4_checkout_events: currentSite.ga4_checkout_events,
      ga4_purchase_events: currentSite.ga4_purchase_events,
      first_party_primary_atc_users: currentAtc.primary_atc_users,
      first_party_primary_atc_events: currentAtc.primary_atc_events,
      first_party_bonus_atc_users: currentAtc.bonus_atc_users,
      first_party_bonus_atc_events: currentAtc.bonus_atc_events,
    },
    prior: {
      meta_spend: metaDataset.overview.prior.spend,
      site_revenue: priorSite.revenue,
      blended_roas: metaDataset.overview.prior.spend > 0 ? priorSite.revenue / metaDataset.overview.prior.spend : null,
      site_session_conversion_rate: priorSite.session_purchase_rate,
      site_user_conversion_rate: priorSite.user_purchase_rate,
      site_session_add_to_cart_rate: priorSite.session_add_to_cart_rate,
      site_user_add_to_cart_rate: priorSite.user_add_to_cart_rate,
      ga4_checkout_events: priorSite.ga4_checkout_events,
      ga4_purchase_events: priorSite.ga4_purchase_events,
      first_party_primary_atc_users: priorAtc.primary_atc_users,
      first_party_primary_atc_events: priorAtc.primary_atc_events,
      first_party_bonus_atc_users: priorAtc.bonus_atc_users,
      first_party_bonus_atc_events: priorAtc.bonus_atc_events,
    },
  };

  const reconciliation = {
    current: {
      math_checks: [
        buildMathCheck('meta_ctr_all', metaDataset.overview.current.ctr_all, nullableRate(metaDataset.overview.current.clicks_all, metaDataset.overview.current.impressions)),
        buildMathCheck('meta_outbound_ctr', metaDataset.overview.current.outbound_ctr, nullableRate(metaDataset.overview.current.outbound_clicks, metaDataset.overview.current.impressions)),
        buildMathCheck('meta_cost_per_website_atc', metaDataset.overview.current.cost_per_website_atc, nullableRate(metaDataset.overview.current.spend, metaDataset.overview.current.website_add_to_carts)),
        buildMathCheck('meta_cost_per_purchase', metaDataset.overview.current.cost_per_purchase, nullableRate(metaDataset.overview.current.spend, metaDataset.overview.current.purchases)),
        buildMathCheck('meta_purchase_roas', metaDataset.overview.current.purchase_roas, metaDataset.overview.current.spend > 0 ? metaDataset.overview.current.revenue / metaDataset.overview.current.spend : null),
        buildMathCheck('blended_roas', blendedOverview.current.blended_roas, metaDataset.overview.current.spend > 0 ? currentSite.revenue / metaDataset.overview.current.spend : null),
      ],
      scope_split: {
        meta_website_add_to_carts: metaDataset.overview.current.website_add_to_carts,
        ga4_add_to_cart_events: currentSite.ga4_add_to_cart_events,
        first_party_primary_atc_users: currentAtc.primary_atc_users,
        first_party_primary_atc_events: currentAtc.primary_atc_events,
        first_party_bonus_atc_users: currentAtc.bonus_atc_users,
        first_party_bonus_atc_events: currentAtc.bonus_atc_events,
        note: 'These are intentionally different metrics. Meta website ATC is paid-attributed. GA4 addToCarts is site-wide event count. First-party primary ATC isolates the main KRYO product only.',
      },
    },
    prior: {
      math_checks: [
        buildMathCheck('meta_ctr_all', metaDataset.overview.prior.ctr_all, nullableRate(metaDataset.overview.prior.clicks_all, metaDataset.overview.prior.impressions)),
        buildMathCheck('meta_outbound_ctr', metaDataset.overview.prior.outbound_ctr, nullableRate(metaDataset.overview.prior.outbound_clicks, metaDataset.overview.prior.impressions)),
        buildMathCheck('meta_cost_per_website_atc', metaDataset.overview.prior.cost_per_website_atc, nullableRate(metaDataset.overview.prior.spend, metaDataset.overview.prior.website_add_to_carts)),
        buildMathCheck('meta_cost_per_purchase', metaDataset.overview.prior.cost_per_purchase, nullableRate(metaDataset.overview.prior.spend, metaDataset.overview.prior.purchases)),
        buildMathCheck('meta_purchase_roas', metaDataset.overview.prior.purchase_roas, metaDataset.overview.prior.spend > 0 ? metaDataset.overview.prior.revenue / metaDataset.overview.prior.spend : null),
        buildMathCheck('blended_roas', blendedOverview.prior.blended_roas, metaDataset.overview.prior.spend > 0 ? priorSite.revenue / metaDataset.overview.prior.spend : null),
      ],
      scope_split: {
        meta_website_add_to_carts: metaDataset.overview.prior.website_add_to_carts,
        ga4_add_to_cart_events: priorSite.ga4_add_to_cart_events,
        first_party_primary_atc_users: priorAtc.primary_atc_users,
        first_party_primary_atc_events: priorAtc.primary_atc_events,
        first_party_bonus_atc_users: priorAtc.bonus_atc_users,
        first_party_bonus_atc_events: priorAtc.bonus_atc_events,
        note: 'These are intentionally different metrics. Meta website ATC is paid-attributed. GA4 addToCarts is site-wide event count. First-party primary ATC isolates the main KRYO product only.',
      },
    },
  };

  const metric_glossary = {
    meta_ctr_all: {
      source: 'Meta Ads / meta_ad_metrics_daily',
      definition: 'All clicks divided by impressions.',
      scope: 'KRYO-scoped Meta campaigns and ads only.',
      note: 'Matches Ads Manager CTR (all).',
    },
    meta_outbound_ctr: {
      source: 'Meta Ads / meta_ad_metrics_daily',
      definition: 'Outbound clicks divided by impressions.',
      scope: 'KRYO-scoped Meta campaigns and ads only.',
      note: 'Use this when evaluating clickthrough to the website, not engagement clicks.',
    },
    meta_website_add_to_carts: {
      source: 'Meta Ads / meta_ad_metrics_daily',
      definition: 'Attributed website add-to-cart conversions from Meta using 7d_click + 1d_view.',
      scope: 'Paid Meta only.',
      note: 'Should never be compared 1:1 with GA4 event totals without noting attribution scope.',
    },
    ga4_add_to_cart_events: {
      source: 'GA4 runReport',
      definition: 'Site-wide addToCarts event count in the reporting window after exclusions.',
      scope: 'Clean site behavior across channels.',
      note: 'Event count, not unique users.',
    },
    primary_kryo_atc_users: {
      source: 'First-party attribution_touches',
      definition: 'Unique canonical users who added the main KRYO product at least once.',
      scope: 'Clean site behavior across channels.',
      note: 'Bonus/upsell adds are excluded.',
    },
    site_session_conversion_rate: {
      source: 'GA4 runReport',
      definition: 'GA4 purchase events divided by clean sessions.',
      scope: 'Clean site behavior across channels.',
      note: 'Use for on-site funnel health, not Meta attribution.',
    },
    site_user_conversion_rate: {
      source: 'GA4 runReport',
      definition: 'GA4 purchase events divided by clean users.',
      scope: 'Clean site behavior across channels.',
      note: 'User-based site conversion rate.',
    },
    meta_purchase_roas: {
      source: 'Meta Ads / meta_ad_metrics_daily',
      definition: 'Meta-attributed purchase revenue divided by Meta spend.',
      scope: 'Paid Meta only.',
      note: 'Matches Ads Manager purchase ROAS when the sync is current.',
    },
    blended_roas: {
      source: 'Meta spend + GA4 purchaseRevenue',
      definition: 'Clean site revenue divided by Meta spend for the same window.',
      scope: 'Blended cross-system diagnostic.',
      note: 'Useful as a directional business metric, not a replacement for Meta purchase ROAS.',
    },
  };

  return {
    generated_at: new Date().toISOString(),
    windows,
    assumptions: {
      excluded_countries: Array.from(EXCLUDED_COUNTRIES),
      excluded_touch_rules: ['is_internal', 'traffic_class=internal_qa', 'traffic_class=bot', 'crawler UAs', 'tom laptop HK Mac Chrome pattern'],
      primary_atc_definition: 'Unique canonical users who added main KRYO product at least once in the window',
      bonus_atc_definition: 'Unique canonical users who added identified non-KRYO upsell/bonus products in the window',
      meta_attribution_window: '7d_click + 1d_view',
      meta_default_ctr_definition: 'ctr_all',
      meta_outbound_click_definition: 'Meta outbound click / link click to website',
      search_data_status: hasCanonicalSearch ? 'full_query_page_country_device' : 'partial_brand_only_until_full_gsc_query_page_sync',
    },
    metric_glossary,
    overview: {
      site_clean: {
        current: currentSite,
        prior: priorSite,
      },
      site_uae: {
        current: currentUae,
        prior: priorUae,
      },
      meta_ads: metaDataset.overview,
      blended: blendedOverview,
    },
    excluded_traffic_by_reason: {
      ga4_sessions_current: currentExcludedAudit,
      ga4_sessions_prior: priorExcludedAudit,
      touch_rows_current: excludedTouchReasons(windows.current),
      touch_rows_prior: excludedTouchReasons(windows.prior),
    },
    top_first_touch_ads: {
      current: currentMetaAds,
      prior: priorMetaAds,
    },
    returning_source_mix: {
      current: summariseReturningSource(currentReturningSourceRows),
      prior: summariseReturningSource(priorReturningSourceRows),
    },
    returning_page_paths: {
      current: summariseReturningPaths(currentReturningPathRows).slice(0, 30),
      prior: summariseReturningPaths(priorReturningPathRows).slice(0, 30),
    },
    atc_breakdown_primary_vs_bonus: {
      current: {
        ...currentAtc,
        primary_atc_rate_vs_clean_users: rate(currentAtc.primary_atc_users, currentSite.total_users),
      },
      prior: {
        ...priorAtc,
        primary_atc_rate_vs_clean_users: rate(priorAtc.primary_atc_users, priorSite.total_users),
      },
    },
    reconciliation,
    search_queries: {
      status: 'partial_brand_only',
      limitation: 'Current repo stores branded GSC summary rows only. Full query-page-country-device sync is not live yet.',
      current: foldSearch(windows.current),
      prior: foldSearch(windows.prior),
    },
  };
}
