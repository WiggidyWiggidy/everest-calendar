import type { SupabaseClient } from '@supabase/supabase-js';

type TouchRow = {
  ts: string;
  event_type: string | null;
  page_path: string | null;
  anonymous_id: string | null;
  is_internal: boolean | null;
  event_metadata: {
    page_url?: string | null;
    page_type?: string | null;
    event_properties?: Record<string, unknown> | null;
  } | null;
};

type SectionRow = {
  page_url: string;
  section_id: string;
  click_count: number;
  rage_click_count: number;
  dead_click_count: number;
  scroll_abandon_count: number;
  unique_sessions: number;
};

type ClarityRow = {
  page_url: string;
  total_sessions: number | null;
  dead_click_count: number | null;
  rage_click_count: number | null;
  quick_back_count: number | null;
  script_error_count: number | null;
  avg_scroll_depth_pct: number | null;
  avg_engagement_time_sec: number | null;
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

function sum(rows: number[]) {
  return rows.reduce((acc, value) => acc + value, 0);
}

function topCounts(rows: TouchRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const rawEventType = row.event_type ?? '';
    const eventType = rawEventType === 'shopify_inbox_click' ? 'chatway_click' : rawEventType;
    if (!CONTROL_EVENTS.includes(eventType as (typeof CONTROL_EVENTS)[number])) continue;
    counts.set(eventType, (counts.get(eventType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([event_type, count]) => ({ event_type, count }))
    .sort((a, b) => b.count - a.count);
}

export async function buildKryoBehaviorReport(
  supabase: SupabaseClient,
  opts?: { windowDays?: number; includeInternal?: boolean; productPath?: string }
) {
  const windowDays = Math.min(Math.max(opts?.windowDays ?? 30, 1), 90);
  const includeInternal = opts?.includeInternal ?? false;
  const productPath = opts?.productPath ?? '/products/kryo2';
  const sinceIso = new Date(Date.now() - windowDays * 86400000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const [touchRes, sectionRes, clarityRes] = await Promise.all([
    supabase
      .from('attribution_touches')
      .select('ts,event_type,page_path,anonymous_id,is_internal,event_metadata')
      .gte('ts', sinceIso)
      .or(`page_path.like.*${productPath}*,page_path.like.*/cart*`)
      .order('ts', { ascending: false })
      .limit(10000),
    supabase
      .from('clarity_section_heatmap')
      .select('page_url,section_id,click_count,rage_click_count,dead_click_count,scroll_abandon_count,unique_sessions')
      .gte('date', sinceDate)
      .ilike('page_url', `%${productPath}%`)
      .limit(1000),
    supabase
      .from('clarity_friction_elements')
      .select('page_url,total_sessions,dead_click_count,rage_click_count,quick_back_count,script_error_count,avg_scroll_depth_pct,avg_engagement_time_sec')
      .gte('date', sinceDate)
      .ilike('page_url', `%${productPath}%`)
      .limit(1000),
  ]);

  if (touchRes.error) throw new Error(`attribution_touches query failed: ${touchRes.error.message}`);
  if (sectionRes.error) throw new Error(`clarity_section_heatmap query failed: ${sectionRes.error.message}`);
  if (clarityRes.error) throw new Error(`clarity_friction_elements query failed: ${clarityRes.error.message}`);

  const touches = ((touchRes.data ?? []) as TouchRow[]).filter((row) => includeInternal || !row.is_internal);
  const pageTouches = touches.filter((row) => (row.page_path ?? '').includes(productPath));
  const cartTouches = touches.filter((row) => (row.page_path ?? '').includes('/cart'));
  const sectionRows = (sectionRes.data ?? []) as SectionRow[];
  const clarityRows = (clarityRes.data ?? []) as ClarityRow[];

  const productPageViews = pageTouches.filter((row) => row.event_type === 'page_view').length;
  const productViews = pageTouches.filter((row) => row.event_type === 'product_view').length;
  const cartAddRequests = pageTouches.filter((row) => row.event_type === 'cart_add_request').length;
  const addToCart = pageTouches.filter((row) => row.event_type === 'add_to_cart').length;
  const cartAddFailed = pageTouches.filter((row) => row.event_type === 'cart_add_failed').length;
  const cartViews = cartTouches.filter((row) => row.event_type === 'cart_view').length;
  const cartCheckoutClicks = cartTouches.filter((row) => row.event_type === 'cart_checkout_click').length;
  const checkoutStarts = touches.filter((row) => row.event_type === 'checkout_start').length;
  const chatClicks = pageTouches.filter((row) => row.event_type === 'chatway_click' || row.event_type === 'shopify_inbox_click').length;
  const whatsappClicks = pageTouches.filter((row) => row.event_type === 'whatsapp_click').length;
  const compatibilityClicks = pageTouches.filter((row) => row.event_type === 'compatibility_cta_click').length;
  const comparisonViews = pageTouches.filter((row) => row.event_type === 'comparison_section_view').length;
  const offerViews = pageTouches.filter((row) => row.event_type === 'offer_section_view').length;
  const guaranteeViews = pageTouches.filter((row) => row.event_type === 'guarantee_section_view').length;
  const scroll25 = pageTouches.filter((row) => row.event_type === 'scroll_depth_25').length;
  const scroll50 = pageTouches.filter((row) => row.event_type === 'scroll_depth_50').length;
  const scroll75 = pageTouches.filter((row) => row.event_type === 'scroll_depth_75').length;
  const scroll90 = pageTouches.filter((row) => row.event_type === 'scroll_depth_90').length;

  const sectionAgg = new Map<string, SectionRow>();
  for (const row of sectionRows) {
    const current = sectionAgg.get(row.section_id) ?? {
      page_url: row.page_url,
      section_id: row.section_id,
      click_count: 0,
      rage_click_count: 0,
      dead_click_count: 0,
      scroll_abandon_count: 0,
      unique_sessions: 0,
    };
    current.click_count += Number(row.click_count ?? 0);
    current.rage_click_count += Number(row.rage_click_count ?? 0);
    current.dead_click_count += Number(row.dead_click_count ?? 0);
    current.scroll_abandon_count += Number(row.scroll_abandon_count ?? 0);
    current.unique_sessions += Number(row.unique_sessions ?? 0);
    sectionAgg.set(row.section_id, current);
  }

  const topSections = Array.from(sectionAgg.values())
    .map((row) => ({
      ...row,
      friction_score: row.rage_click_count * 3 + row.dead_click_count * 2 + row.scroll_abandon_count,
    }))
    .sort((a, b) => b.friction_score - a.friction_score)
    .slice(0, 10);

  const clarityTotals = {
    sessions: sum(clarityRows.map((row) => Number(row.total_sessions ?? 0))),
    dead_clicks: sum(clarityRows.map((row) => Number(row.dead_click_count ?? 0))),
    rage_clicks: sum(clarityRows.map((row) => Number(row.rage_click_count ?? 0))),
    quick_backs: sum(clarityRows.map((row) => Number(row.quick_back_count ?? 0))),
    script_errors: sum(clarityRows.map((row) => Number(row.script_error_count ?? 0))),
    avg_scroll_depth_pct: clarityRows.length
      ? Number((sum(clarityRows.map((row) => Number(row.avg_scroll_depth_pct ?? 0))) / clarityRows.length).toFixed(1))
      : null,
    avg_engagement_time_sec: clarityRows.length
      ? Number((sum(clarityRows.map((row) => Number(row.avg_engagement_time_sec ?? 0))) / clarityRows.length).toFixed(1))
      : null,
  };

  const findings: Array<{ priority: 'high' | 'medium'; signal: string; why_it_matters: string; action: string }> = [];

  if (cartAddRequests >= 10 && cartAddFailed / Math.max(cartAddRequests, 1) >= 0.15) {
    findings.push({
      priority: 'high',
      signal: `Cart add failures are ${rate(cartAddFailed, cartAddRequests)}% of KRYO2 add requests`,
      why_it_matters: 'This is technical leakage. Fixing it is usually worth more than copy changes.',
      action: 'Audit the KRYO2 ATC flow first. Check variant, permalink, cart API, and theme JS before running more CRO tests.',
    });
  }

  if (cartViews >= 10 && cartCheckoutClicks / Math.max(cartViews, 1) < 0.35) {
    findings.push({
      priority: 'high',
      signal: `Cart checkout clicks are only ${rate(cartCheckoutClicks, cartViews)}% of cart views`,
      why_it_matters: 'Intent reaches the cart but does not progress. The cart is likely adding friction.',
      action: 'Instrument and review cart trust, shipping, total-cost clarity, and checkout button prominence.',
    });
  }

  if (chatClicks + whatsappClicks >= 5) {
    findings.push({
      priority: 'medium',
      signal: `Support clicks are elevated (${chatClicks} chat / ${whatsappClicks} WhatsApp)`,
      why_it_matters: 'Users are asking for reassurance instead of self-converting from the page.',
      action: 'Review the exact questions coming through Chatway and move the top objections higher up on KRYO2.',
    });
  }

  if (comparisonViews > 0 && comparisonViews >= Math.max(offerViews, guaranteeViews)) {
    findings.push({
      priority: 'medium',
      signal: `Comparison is the most-viewed named PDP section event (${comparisonViews})`,
      why_it_matters: 'Users appear to need evaluation help before buying.',
      action: 'Keep comparison prominent and test a tighter “why this vs alternatives” block above the fold.',
    });
  }

  if (topSections.length === 0) {
    findings.push({
      priority: 'high',
      signal: 'No section heatmap rows exist yet for KRYO2',
      why_it_matters: 'We still do not know which actual PDP section is creating friction.',
      action: 'Deploy the section-event pipeline and verify clarity_section_events + clarity_section_heatmap begin filling.',
    });
  }

  return {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    product_path: productPath,
    volume: {
      product_page_views: productPageViews,
      product_views: productViews,
      cart_views: cartViews,
      clarity_sessions: clarityTotals.sessions,
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
    top_clicked_controls: topCounts(touches).slice(0, 12),
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
    support_and_objection_signals: {
      chatway_clicks: chatClicks,
      whatsapp_clicks: whatsappClicks,
      compatibility_clicks: compatibilityClicks,
      comparison_section_views: comparisonViews,
      offer_section_views: offerViews,
      guarantee_section_views: guaranteeViews,
    },
    clarity_friction: clarityTotals,
    top_friction_sections: topSections,
    findings,
    next_unlock: topSections.length === 0
      ? 'Deploy and verify section-level telemetry on production so PDP friction becomes section-specific instead of URL-level.'
      : cartCheckoutClicks === 0
        ? 'Add cart-specific click instrumentation so we can separate PDP success from cart leakage.'
        : 'Join Chatway conversations to the triggering page section so support demand can be turned into page fixes faster.',
  };
}
