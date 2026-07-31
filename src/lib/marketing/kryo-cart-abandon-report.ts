import type { SupabaseClient } from '@supabase/supabase-js';

type TouchRow = {
  ts: string;
  session_id: string | null;
  anonymous_id: string | null;
  event_type: string | null;
  page_path: string | null;
  is_internal: boolean | null;
  traffic_class: string | null;
  channel: string | null;
  meta_campaign_id: string | null;
  meta_ad_id: string | null;
  event_metadata: Record<string, unknown> | null;
};

type CartAbandonOptions = {
  startDate?: string;
  endDate?: string;
  windowDays?: number;
  productPath?: string;
  includeInternal?: boolean;
  trafficClass?: string;
};

const CART_EVENTS = [
  'page_view',
  'product_view',
  'product_viewed',
  'hero_cta_click',
  'sticky_cta_click',
  'cart_add_request',
  'add_to_cart',
  'product_added_to_cart',
  'cart_add_failed',
  'cart_view',
  'cart_checkout_click',
  'cart_exit_without_checkout',
  'checkout_start',
  'checkout_started',
  'order_placed',
] as const;

function isoStart(date: string) {
  return `${date}T00:00:00.000Z`;
}

function isoEnd(date: string) {
  return `${date}T23:59:59.999Z`;
}

function pct(num: number, denom: number) {
  return denom > 0 ? Number(((num / denom) * 100).toFixed(1)) : null;
}

function eventName(row: TouchRow) {
  if (row.event_type === 'product_added_to_cart') return 'add_to_cart';
  if (row.event_type === 'checkout_started') return 'checkout_start';
  if (row.event_type === 'product_viewed') return 'product_view';
  return row.event_type ?? '';
}

function sessionKey(row: TouchRow) {
  return row.session_id || row.anonymous_id || `row:${row.ts}:${row.event_type}`;
}

function countSessions(rows: TouchRow[], eventTypes: string[]) {
  const allowed = new Set(eventTypes);
  return new Set(rows.filter((row) => allowed.has(eventName(row))).map(sessionKey)).size;
}

function countEvents(rows: TouchRow[], eventTypes: string[]) {
  const allowed = new Set(eventTypes);
  return rows.filter((row) => allowed.has(eventName(row))).length;
}

export async function buildKryoCartAbandonReport(
  supabase: SupabaseClient,
  opts: CartAbandonOptions = {},
) {
  const productPath = opts.productPath ?? '/products/kryo2';
  const includeInternal = opts.includeInternal ?? false;
  const windowDays = Math.min(Math.max(opts.windowDays ?? 14, 1), 90);
  const endDate = opts.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate = opts.startDate ?? new Date(Date.now() - (windowDays - 1) * 86400000).toISOString().slice(0, 10);
  const sinceIso = isoStart(startDate);
  const untilIso = isoEnd(endDate);

  const { data, error } = await supabase
    .from('attribution_touches')
    .select('ts,session_id,anonymous_id,event_type,page_path,is_internal,traffic_class,channel,meta_campaign_id,meta_ad_id,event_metadata')
    .gte('ts', sinceIso)
    .lte('ts', untilIso)
    .in('event_type', [...CART_EVENTS])
    .order('ts', { ascending: true })
    .limit(20000);

  if (error) throw new Error(`attribution_touches cart-abandon query failed: ${error.message}`);

  const allRows = ((data ?? []) as TouchRow[]).filter((row) => includeInternal || !row.is_internal);
  const filteredRows = opts.trafficClass
    ? allRows.filter((row) => row.traffic_class === opts.trafficClass)
    : allRows;

  const kryoSessionIds = new Set(
    filteredRows
      .filter((row) => (row.page_path ?? '').includes(productPath))
      .map(sessionKey),
  );
  const sessionRows = filteredRows.filter((row) => kryoSessionIds.has(sessionKey(row)));
  const paidRows = sessionRows.filter((row) => row.traffic_class === 'paid_meta');

  const productPageViewSessions = countSessions(sessionRows, ['page_view', 'product_view']);
  const ctaClickSessions = countSessions(sessionRows, ['hero_cta_click', 'sticky_cta_click', 'cart_add_request']);
  const atcSessions = countSessions(sessionRows, ['add_to_cart']);
  const cartViewSessions = countSessions(sessionRows, ['cart_view']);
  const checkoutClickSessions = countSessions(sessionRows, ['cart_checkout_click']);
  const checkoutStartSessions = countSessions(sessionRows, ['checkout_start']);
  const purchaseSessions = countSessions(sessionRows, ['order_placed']);

  const atcSessionKeys = new Set(sessionRows.filter((row) => eventName(row) === 'add_to_cart').map(sessionKey));
  const checkoutStartKeys = new Set(sessionRows.filter((row) => eventName(row) === 'checkout_start').map(sessionKey));
  const purchaseKeys = new Set(sessionRows.filter((row) => eventName(row) === 'order_placed').map(sessionKey));
  const atcNoCheckoutSessions = Array.from(atcSessionKeys).filter((id) => !checkoutStartKeys.has(id)).length;
  const checkoutNoPurchaseSessions = Array.from(checkoutStartKeys).filter((id) => !purchaseKeys.has(id)).length;

  const cartAddRequests = countEvents(sessionRows, ['cart_add_request']);
  const cartAddFailed = countEvents(sessionRows, ['cart_add_failed']);
  const cartExitWithoutCheckout = countEvents(sessionRows, ['cart_exit_without_checkout']);

  const topMetaAds = Array.from(sessionRows.reduce((map, row) => {
    if (!row.meta_ad_id) return map;
    const current = map.get(row.meta_ad_id) ?? { meta_ad_id: row.meta_ad_id, events: 0, atc_events: 0, checkout_start_events: 0, purchase_events: 0 };
    current.events += 1;
    if (eventName(row) === 'add_to_cart') current.atc_events += 1;
    if (eventName(row) === 'checkout_start') current.checkout_start_events += 1;
    if (eventName(row) === 'order_placed') current.purchase_events += 1;
    map.set(row.meta_ad_id, current);
    return map;
  }, new Map<string, { meta_ad_id: string; events: number; atc_events: number; checkout_start_events: number; purchase_events: number }>()).values())
    .sort((a, b) => b.events - a.events)
    .slice(0, 10);

  const warnings: string[] = [];
  if (cartAddRequests > 0 && cartAddFailed / cartAddRequests >= 0.1) warnings.push('cart_add_failure_rate_above_10pct');
  if (atcSessions >= 5 && checkoutStartSessions / atcSessions < 0.2) warnings.push('atc_to_checkout_below_20pct');
  if (atcSessions > 0 && checkoutClickSessions === 0) warnings.push('checkout_click_tracking_missing_or_zero');
  if (paidRows.length === 0) warnings.push('no_paid_meta_rows_in_window');

  return {
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, product_path: productPath, include_internal: includeInternal, traffic_class: opts.trafficClass ?? 'all' },
    volume: {
      kryo_sessions: kryoSessionIds.size,
      paid_meta_events: paidRows.length,
      rows_scanned: allRows.length,
      kryo_rows: sessionRows.length,
    },
    funnel_sessions: {
      product_page_views: productPageViewSessions,
      cta_clicks_or_cart_add_requests: ctaClickSessions,
      add_to_carts: atcSessions,
      cart_views: cartViewSessions,
      cart_checkout_clicks: checkoutClickSessions,
      checkout_starts: checkoutStartSessions,
      purchases: purchaseSessions,
      atc_no_checkout: atcNoCheckoutSessions,
      checkout_no_purchase: checkoutNoPurchaseSessions,
    },
    funnel_rates_pct: {
      product_view_to_atc: pct(atcSessions, productPageViewSessions),
      atc_to_cart_view: pct(cartViewSessions, atcSessions),
      atc_to_checkout_click: pct(checkoutClickSessions, atcSessions),
      atc_to_checkout_start: pct(checkoutStartSessions, atcSessions),
      checkout_click_to_checkout_start: pct(checkoutStartSessions, checkoutClickSessions),
      checkout_start_to_purchase: pct(purchaseSessions, checkoutStartSessions),
      atc_no_checkout: pct(atcNoCheckoutSessions, atcSessions),
    },
    technical_events: {
      cart_add_requests: cartAddRequests,
      cart_add_failed: cartAddFailed,
      cart_add_failure_rate_pct: pct(cartAddFailed, cartAddRequests),
      cart_exit_without_checkout: cartExitWithoutCheckout,
    },
    top_meta_ads: topMetaAds,
    warnings,
  };
}
