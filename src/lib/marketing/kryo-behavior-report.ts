import type { SupabaseClient } from '@supabase/supabase-js';
import {
  shouldExcludeGaCountry,
  shouldExcludeKryoTouch,
  summarizeExclusionReasons,
  type KRYOTouchLike,
} from '@/lib/marketing/kryo-clean-filters';

type TouchRow = KRYOTouchLike & {
  ts: string;
  event_type: string | null;
  page_path: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  meta_ad_id?: string | null;
  event_metadata: {
    page_url?: string | null;
    page_type?: string | null;
    event_properties?: Record<string, unknown> | null;
    shopify_product_handle?: string | null;
  } | null;
};

type SectionRow = {
  date?: string | null;
  page_url: string;
  section_id: string;
  click_count: number | null;
  rage_click_count: number | null;
  dead_click_count: number | null;
  scroll_abandon_count: number | null;
  unique_sessions: number | null;
};

type ClarityRow = {
  date?: string | null;
  page_url: string;
  total_sessions: number | null;
  dead_click_count: number | null;
  rage_click_count: number | null;
  quick_back_count: number | null;
  script_error_count: number | null;
  avg_scroll_depth_pct: number | null;
  avg_engagement_time_sec: number | null;
};

type GA4Row = {
  report_hour: string;
  page_path: string | null;
  country: string | null;
  sessions: number | null;
  total_users: number | null;
  screen_page_views: number | null;
  add_to_carts: number | null;
  begin_checkouts: number | null;
  purchases: number | null;
  purchase_revenue: number | null;
  session_source_medium: string | null;
};

type MetaHourlyRow = {
  meta_ad_id: string;
  report_hour: string;
  impressions: number | null;
  clicks: number | null;
  link_clicks: number | null;
  landing_page_views: number | null;
  spend: number | null;
  add_to_carts: number | null;
  checkouts_started: number | null;
  purchases: number | null;
  revenue: number | null;
};

const CONTROL_EVENTS = [
  'hero_cta_click',
  'sticky_cta_click',
  'chatway_click',
  'whatsapp_click',
  'compatibility_cta_click',
  'cart_add_request',
  'add_to_cart',
  'cart_add_failed',
  'cart_view',
  'cart_checkout_click',
  'checkout_start',
  'cart_remove_item',
  'cart_quantity_change',
  'scroll_depth_25',
  'scroll_depth_50',
  'scroll_depth_75',
  'scroll_depth_90',
] as const;

function rate(num: number, denom: number) {
  return denom > 0 ? Number(((num / denom) * 100).toFixed(1)) : null;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((acc, value) => acc + Number(value ?? 0), 0);
}

function normalizeEventType(value: string | null) {
  if (value === 'shopify_inbox_click') return 'chatway_click';
  if (value === 'product_viewed') return 'product_view';
  if (value === 'product_added_to_cart') return 'add_to_cart';
  if (value === 'checkout_started') return 'checkout_start';
  return value ?? '';
}

function topCounts(rows: TouchRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const eventType = normalizeEventType(row.event_type);
    if (!CONTROL_EVENTS.includes(eventType as (typeof CONTROL_EVENTS)[number])) continue;
    counts.set(eventType, (counts.get(eventType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([event_type, count]) => ({ event_type, count }))
    .sort((a, b) => b.count - a.count);
}

function uniqueSessions(rows: TouchRow[]) {
  return new Set(rows.map((row) => row.session_id).filter(Boolean)).size;
}

export async function buildKryoBehaviorReport(
  supabase: SupabaseClient,
  opts?: { windowDays?: number; includeInternal?: boolean; productPath?: string }
) {
  const windowDays = Math.min(Math.max(opts?.windowDays ?? 7, 1), 30);
  const includeInternal = opts?.includeInternal ?? false;
  const productPath = opts?.productPath ?? '/products/kryo2';
  const sinceIso = new Date(Date.now() - windowDays * 86400000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const [touchRes, sectionRes, clarityRes, gaRes, cartGaRes] = await Promise.all([
    supabase
      .from('attribution_touches')
      .select('ts,event_type,page_path,anonymous_id,session_id,is_internal,ip_country,user_agent,traffic_class,referrer,event_metadata,meta_ad_id')
      .gte('ts', sinceIso)
      .or(`page_path.like.*${productPath}*,page_path.eq./cart`)
      .order('ts', { ascending: false })
      .limit(15000),
    supabase
      .from('clarity_section_heatmap')
      .select('date,page_url,section_id,click_count,rage_click_count,dead_click_count,scroll_abandon_count,unique_sessions')
      .gte('date', sinceDate)
      .ilike('page_url', `%${productPath}%`)
      .limit(2000),
    supabase
      .from('clarity_friction_elements')
      .select('date,page_url,total_sessions,dead_click_count,rage_click_count,quick_back_count,script_error_count,avg_scroll_depth_pct,avg_engagement_time_sec')
      .gte('date', sinceDate)
      .ilike('page_url', `%${productPath}%`)
      .limit(2000),
    supabase
      .from('ga4_page_hourly')
      .select('report_hour,page_path,country,sessions,total_users,screen_page_views,add_to_carts,begin_checkouts,purchases,purchase_revenue,session_source_medium')
      .eq('page_path', productPath)
      .gte('report_hour', sinceIso)
      .limit(3000),
    supabase
      .from('ga4_page_hourly')
      .select('report_hour,page_path,country,sessions,total_users,screen_page_views,add_to_carts,begin_checkouts,purchases,purchase_revenue,session_source_medium')
      .eq('page_path', '/cart')
      .gte('report_hour', sinceIso)
      .limit(3000),
  ]);

  if (touchRes.error) throw new Error(`attribution_touches query failed: ${touchRes.error.message}`);
  if (sectionRes.error) throw new Error(`clarity_section_heatmap query failed: ${sectionRes.error.message}`);
  if (clarityRes.error) throw new Error(`clarity_friction_elements query failed: ${clarityRes.error.message}`);
  if (gaRes.error) throw new Error(`ga4_page_hourly query failed: ${gaRes.error.message}`);
  if (cartGaRes.error) throw new Error(`ga4_page_hourly cart query failed: ${cartGaRes.error.message}`);

  const rawTouches = (touchRes.data ?? []) as TouchRow[];
  const excludedTouches = includeInternal ? [] : rawTouches.filter((row) => shouldExcludeKryoTouch(row));
  const touches = includeInternal ? rawTouches : rawTouches.filter((row) => !shouldExcludeKryoTouch(row));
  const pageTouches = touches.filter((row) => (row.page_path ?? '').includes(productPath));
  const cartTouches = touches.filter((row) => (row.page_path ?? '') === '/cart');
  const paidTouches = pageTouches.filter((row) => row.traffic_class === 'paid_meta');
  const sectionRows = (sectionRes.data ?? []) as SectionRow[];
  const clarityRows = (clarityRes.data ?? []) as ClarityRow[];
  const cleanGaRows = ((gaRes.data ?? []) as GA4Row[]).filter((row) => !shouldExcludeGaCountry(row.country));
  const cleanCartGaRows = ((cartGaRes.data ?? []) as GA4Row[]).filter((row) => !shouldExcludeGaCountry(row.country));

  const metaAdIds = Array.from(new Set(paidTouches.map((row) => row.meta_ad_id).filter(Boolean))) as string[];
  const metaRes = metaAdIds.length
    ? await supabase
        .from('meta_ad_metrics_hourly')
        .select('meta_ad_id,report_hour,impressions,clicks,link_clicks,landing_page_views,spend,add_to_carts,checkouts_started,purchases,revenue')
        .in('meta_ad_id', metaAdIds)
        .gte('report_hour', sinceIso)
        .limit(5000)
    : { data: [], error: null };
  if (metaRes.error) throw new Error(`meta_ad_metrics_hourly query failed: ${metaRes.error.message}`);
  const metaRows = (metaRes.data ?? []) as MetaHourlyRow[];

  const productPageViews = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'page_view').length;
  const productViews = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'product_view').length;
  const cartAddRequests = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'cart_add_request').length;
  const addToCart = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'add_to_cart').length;
  const cartAddFailed = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'cart_add_failed').length;
  const cartViews = cartTouches.filter((row) => normalizeEventType(row.event_type) === 'cart_view').length;
  const cartCheckoutClicks = cartTouches.filter((row) => normalizeEventType(row.event_type) === 'cart_checkout_click').length;
  const checkoutStarts = touches.filter((row) => normalizeEventType(row.event_type) === 'checkout_start').length;
  const chatClicks = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'chatway_click').length;
  const whatsappClicks = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'whatsapp_click').length;
  const compatibilityClicks = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'compatibility_cta_click').length;
  const comparisonViews = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'comparison_section_view').length;
  const offerViews = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'offer_section_view').length;
  const guaranteeViews = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'guarantee_section_view').length;
  const scroll25 = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'scroll_depth_25').length;
  const scroll50 = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'scroll_depth_50').length;
  const scroll75 = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'scroll_depth_75').length;
  const scroll90 = pageTouches.filter((row) => normalizeEventType(row.event_type) === 'scroll_depth_90').length;

  const sectionAgg = new Map<string, SectionRow>();
  for (const row of sectionRows) {
    const current = sectionAgg.get(row.section_id) ?? {
      date: row.date,
      page_url: row.page_url,
      section_id: row.section_id,
      click_count: 0,
      rage_click_count: 0,
      dead_click_count: 0,
      scroll_abandon_count: 0,
      unique_sessions: 0,
    };
    current.click_count = Number(current.click_count ?? 0) + Number(row.click_count ?? 0);
    current.rage_click_count = Number(current.rage_click_count ?? 0) + Number(row.rage_click_count ?? 0);
    current.dead_click_count = Number(current.dead_click_count ?? 0) + Number(row.dead_click_count ?? 0);
    current.scroll_abandon_count = Number(current.scroll_abandon_count ?? 0) + Number(row.scroll_abandon_count ?? 0);
    current.unique_sessions = Number(current.unique_sessions ?? 0) + Number(row.unique_sessions ?? 0);
    sectionAgg.set(row.section_id, current);
  }

  const topSections = Array.from(sectionAgg.values())
    .map((row) => ({
      ...row,
      friction_score:
        Number(row.rage_click_count ?? 0) * 3 +
        Number(row.dead_click_count ?? 0) * 2 +
        Number(row.scroll_abandon_count ?? 0),
    }))
    .sort((a, b) => b.friction_score - a.friction_score)
    .slice(0, 12);

  const clarityAvgScrollDepth = clarityRows.length
    ? Number((sum(clarityRows.map((row) => row.avg_scroll_depth_pct)) / clarityRows.length).toFixed(1))
    : null;
  const clarityAvgEngagement = clarityRows.length
    ? Number((sum(clarityRows.map((row) => row.avg_engagement_time_sec)) / clarityRows.length).toFixed(1))
    : null;

  const clarityTotals = {
    sessions: sum(clarityRows.map((row) => row.total_sessions)),
    dead_clicks: sum(clarityRows.map((row) => row.dead_click_count)),
    rage_clicks: sum(clarityRows.map((row) => row.rage_click_count)),
    quick_backs: sum(clarityRows.map((row) => row.quick_back_count)),
    script_errors: sum(clarityRows.map((row) => row.script_error_count)),
    avg_scroll_depth_pct: clarityAvgScrollDepth,
    avg_engagement_time_sec: clarityAvgEngagement,
  };

  const gaTotals = {
    product_sessions: sum(cleanGaRows.map((row) => row.sessions)),
    product_users: sum(cleanGaRows.map((row) => row.total_users)),
    product_pageviews: sum(cleanGaRows.map((row) => row.screen_page_views)),
    product_add_to_carts: sum(cleanGaRows.map((row) => row.add_to_carts)),
    product_begin_checkouts: sum(cleanGaRows.map((row) => row.begin_checkouts)),
    cart_sessions: sum(cleanCartGaRows.map((row) => row.sessions)),
    cart_users: sum(cleanCartGaRows.map((row) => row.total_users)),
    cart_pageviews: sum(cleanCartGaRows.map((row) => row.screen_page_views)),
  };

  const metaTotals = {
    tracked_meta_ads: metaAdIds.length,
    spend: Number((sum(metaRows.map((row) => row.spend))).toFixed(2)),
    impressions: sum(metaRows.map((row) => row.impressions)),
    clicks: sum(metaRows.map((row) => row.clicks)),
    link_clicks: sum(metaRows.map((row) => row.link_clicks)),
    landing_page_views: sum(metaRows.map((row) => row.landing_page_views)),
    add_to_carts: sum(metaRows.map((row) => row.add_to_carts)),
    checkouts_started: sum(metaRows.map((row) => row.checkouts_started)),
    purchases: sum(metaRows.map((row) => row.purchases)),
    revenue: Number((sum(metaRows.map((row) => row.revenue))).toFixed(2)),
  };

  const findings: Array<{ priority: 'high' | 'medium'; signal: string; why_it_matters: string; action: string }> = [];

  if (cartAddRequests >= 5 && cartAddFailed / Math.max(cartAddRequests, 1) >= 0.15) {
    findings.push({
      priority: 'high',
      signal: `Clean KRYO2 cart-add failures are ${rate(cartAddFailed, cartAddRequests)}% of requests`,
      why_it_matters: 'This is technical leakage before CRO copy work.',
      action: 'Review product form, variant state, and cart API failures before changing the page narrative.',
    });
  }

  if (chatClicks >= 3) {
    findings.push({
      priority: 'medium',
      signal: `Chatway is being clicked ${chatClicks} times in the clean 7-day window`,
      why_it_matters: 'Support demand usually means unresolved objections on-page.',
      action: 'Pull top Chatway objections into the KRYO2 offer, guarantee, or compatibility copy.',
    });
  }

  if (topSections.length === 0) {
    findings.push({
      priority: 'high',
      signal: 'No KRYO2 section heatmap rows exist yet',
      why_it_matters: 'Clarity export still only tells us URL-level friction, not which KRYO2 section is causing it.',
      action: 'Verify the live theme is sending section events and confirm clarity_section_events starts filling today.',
    });
  }

  if (excludedTouches.length > 0) {
    findings.push({
      priority: 'medium',
      signal: `${excludedTouches.length} first-party rows were excluded from the clean 7-day view`,
      why_it_matters: 'This proves the raw dataset is materially different from the operator truth layer.',
      action: 'Use the clean 7-day report, not raw totals, for KRYO2 decisions after the overhaul.',
    });
  }

  return {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    product_path: productPath,
    source_of_truth: {
      report_scope: 'clean_post_overhaul_last_7d',
      raw_touch_rows: rawTouches.length,
      clean_touch_rows: touches.length,
      excluded_touch_rows: excludedTouches.length,
      excluded_reasons: summarizeExclusionReasons(excludedTouches),
    },
    first_party: {
      clean_product_sessions: uniqueSessions(pageTouches),
      clean_cart_sessions: uniqueSessions(cartTouches),
      product_page_views: productPageViews,
      product_views: productViews,
      cart_views: cartViews,
      top_clicked_controls: topCounts(touches).slice(0, 12),
    },
    funnel: {
      cart_add_requests: cartAddRequests,
      add_to_cart_successes: addToCart,
      cart_add_failed: cartAddFailed,
      cart_add_success_rate_pct: rate(addToCart, cartAddRequests),
      cart_add_failure_rate_pct: rate(cartAddFailed, cartAddRequests),
      cart_checkout_clicks: cartCheckoutClicks,
      checkout_starts: checkoutStarts,
      cart_to_checkout_click_rate_pct: rate(cartCheckoutClicks, cartViews),
      checkout_click_to_start_rate_pct: rate(checkoutStarts, cartCheckoutClicks),
    },
    support_and_objection_signals: {
      chatway_clicks: chatClicks,
      whatsapp_clicks: whatsappClicks,
      compatibility_clicks: compatibilityClicks,
      comparison_section_views: comparisonViews,
      offer_section_views: offerViews,
      guarantee_section_views: guaranteeViews,
    },
    scroll_depth: {
      milestone_sessions: {
        scroll_25: scroll25,
        scroll_50: scroll50,
        scroll_75: scroll75,
        scroll_90: scroll90,
      },
      clarity_avg_scroll_depth_pct: clarityTotals.avg_scroll_depth_pct,
      clarity_avg_engagement_time_sec: clarityTotals.avg_engagement_time_sec,
    },
    ga4: {
      clean_product_sessions: gaTotals.product_sessions,
      clean_product_users: gaTotals.product_users,
      clean_product_pageviews: gaTotals.product_pageviews,
      clean_product_add_to_carts: gaTotals.product_add_to_carts,
      clean_product_begin_checkouts: gaTotals.product_begin_checkouts,
      clean_cart_sessions: gaTotals.cart_sessions,
      clean_cart_users: gaTotals.cart_users,
      clean_cart_pageviews: gaTotals.cart_pageviews,
    },
    meta: metaTotals,
    clarity_friction: clarityTotals,
    top_friction_sections: topSections,
    findings,
    next_unlock: topSections.length === 0
      ? 'Get the live KRYO2 theme sending section friction events so the clean report can rank exact sections, not just pagewide Clarity counts.'
      : 'Join Chatway conversations to the triggering KRYO2 section so support demand turns directly into page edits.',
  };
}
