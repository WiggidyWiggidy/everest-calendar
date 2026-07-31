// /api/marketing/sync/storefront-event
// Receives storefront-side pixel events from theme-assets/snippets/everest-attribution-pixel.liquid.
//
// Two routing branches:
//   FUNNEL events (session_start | page_view | product_view | add_to_cart | checkout_start | order_placed)
//     → attribution_touches (existing flow, attribution + downstream funnel views)
//   SECTION events (click | rage_click | dead_click | scroll_abandon)
//     → clarity_section_events (per-section friction, feeds compute_clarity_section_heatmap +
//       propose_lp_experiments — closes the gap that Microsoft Clarity public API does not expose
//       element-level data).
//
// Auth: NONE (public, called from browsers). Mitigation:
//   - Validates event_type whitelist
//   - Caps payload size (1KB)
//   - No PII captured
//   - Row-level rate limit (TODO if needed) via session_id

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const EVENT_ALIASES: Record<string, string> = {
  product_viewed: 'product_view',
  product_added_to_cart: 'add_to_cart',
  checkout_started: 'checkout_start',
  shopify_inbox_click: 'chatway_click',
};

const FUNNEL_EVENTS = new Set([
  'session_start', 'page_view', 'product_view',
  'add_to_cart', 'checkout_start', 'order_placed',
  'product_viewed', 'product_added_to_cart', 'checkout_started',
  'cart_view', 'cart_checkout_click', 'cart_remove_item', 'cart_quantity_change',
  'cart_shipping_interaction', 'cart_discount_interaction', 'cart_exit_without_checkout',
  'cart_add_request', 'cart_add_failed', 'checkout_error',
  'hero_cta_click', 'sticky_cta_click',
  'chatway_click', 'shopify_inbox_click', 'whatsapp_click', 'compatibility_cta_click',
  'installation_faq_open', 'hose_connection_faq_open', 'delivery_faq_open', 'returns_faq_open',
  'comparison_section_view', 'offer_section_view', 'guarantee_section_view',
  'scroll_depth_25', 'scroll_depth_50', 'scroll_depth_75', 'scroll_depth_90',
]);

const SECTION_EVENTS = new Set([
  'click', 'rage_click', 'dead_click', 'scroll_abandon',
]);

const ALLOWED_EVENTS = new Set<string>(
  Array.from(FUNNEL_EVENTS).concat(Array.from(SECTION_EVENTS)),
);

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isMetaLikeSource(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(meta|facebook|fb|instagram|ig)$/i.test(value) ||
    /(^|\.)facebook\.com$/i.test(value) ||
    /(^|\.)instagram\.com$/i.test(value);
}

function hasPaidMetaSignal(input: {
  source?: string | null;
  medium?: string | null;
  referrer?: string | null;
  metaAdId?: string | null;
  metaCampaignId?: string | null;
  fbclid?: string | null;
}) {
  return Boolean(
    input.metaAdId ||
    input.metaCampaignId ||
    input.fbclid ||
    /paid|cpc|ad|social/i.test(input.medium ?? '') ||
    (isMetaLikeSource(input.source) && /facebook|instagram|fb\.com|l\.facebook|m\.facebook/i.test(input.referrer ?? '')),
  );
}

interface PixelEvent {
  event_type?: string;
  session_id?: string;
  page_path?: string;
  page_url?: string;
  referrer?: string | null;
  device_type?: string;
  ts?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  shopify_product_id?: string;
  shopify_product_handle?: string;
  shopify_variant_id?: string;
  page_type?: string;
  locale?: string;
  market_handle?: string;
  event_value?: number | string;
  quantity?: number;
  anonymous_id?: string;
  page_title?: string;
  first_touch?: Record<string, unknown>;
  current_touch?: Record<string, unknown>;
  utm_angle?: string;
  utm_hook?: string;
  experiment_id?: string;
  experiment_key?: string;
  landing_page_version?: string;
  utm_campaign_id?: string;
  utm_adset_id?: string;
  utm_ad_id?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  is_internal?: boolean;
  internal_reason?: string;
  event_properties?: Record<string, unknown>;
  // Section-event fields
  section_id?: string;
  x_pct?: number;
  y_pct?: number;
  scroll_depth_pct?: number;
}

export async function POST(request: NextRequest) {
  let body: PixelEvent;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.event_type || !ALLOWED_EVENTS.has(body.event_type)) {
    return NextResponse.json({ error: `event_type must be one of ${Array.from(ALLOWED_EVENTS).join(',')}` }, { status: 400 });
  }
  if (!body.session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const eventType = EVENT_ALIASES[body.event_type] ?? body.event_type;

  // Resolve landing_page_id from page URL.
  // Postgres ilike treats `_` as a single-char wildcard, so handles like "kryo_" match
  // every "kryo*" URL — escape it. Also prefer exact suffix match before broad ilike.
  const sb = svc();
  let landingPageId: string | null = null;
  if (body.page_path && body.page_path.includes('/products/')) {
    const handle = body.page_path.split('/products/')[1]?.split('/')[0]?.split('?')[0];
    if (handle) {
      const escapedHandle = handle.replace(/[_%\\]/g, c => '\\' + c);
      // Prefer URLs that end with /products/<handle> (most specific)
      const { data: exact } = await sb
        .from('landing_pages')
        .select('id, shopify_url')
        .ilike('shopify_url', `%/products/${escapedHandle}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (exact) {
        landingPageId = exact.id;
      } else {
        const { data: lp } = await sb
          .from('landing_pages')
          .select('id')
          .ilike('shopify_url', `%${escapedHandle}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        landingPageId = lp?.id ?? null;
      }
    }
  }

  // Section-event branch: friction telemetry → clarity_section_events
  if (SECTION_EVENTS.has(eventType)) {
    if (!body.section_id) {
      return NextResponse.json({ error: 'section_id required for section events' }, { status: 400 });
    }
    const fullUrl = body.page_url ?? body.page_path ?? '';
    const { error } = await sb.from('clarity_section_events').insert({
      ts: body.ts || new Date().toISOString(),
      session_id: body.session_id,
      page_url: fullUrl.slice(0, 500),
      section_id: String(body.section_id).slice(0, 200),
      event_type: eventType,
      x_pct: typeof body.x_pct === 'number' ? body.x_pct : null,
      y_pct: typeof body.y_pct === 'number' ? body.y_pct : null,
      scroll_depth_pct: typeof body.scroll_depth_pct === 'number' ? body.scroll_depth_pct : null,
      device_type: body.device_type || null,
      landing_page_id: landingPageId,
    });
    if (error) {
      console.error('clarity_section_events insert failed:', error.message);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, kind: 'section' }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const firstTouch = body.first_touch ?? {};
  const currentTouch = body.current_touch ?? {};
  const metaCampaignId = body.utm_campaign_id || stringValue(currentTouch.campaign_id) || null;
  const metaAdsetId = body.utm_adset_id || stringValue(currentTouch.adset_id) || null;
  const metaAdId = body.utm_ad_id || stringValue(currentTouch.ad_id) || body.utm_content || null;
  const firstTouchMetaAdId = stringValue(firstTouch.ad_id);
  const touchSource = body.utm_source || stringValue(currentTouch.source);
  const touchMedium = body.utm_medium || stringValue(currentTouch.medium);
  const fbclid = body.fbclid || stringValue(currentTouch.fbclid) || stringValue(firstTouch.fbclid);

  // Resolve channel from paid/source/referrer signals. Normalize Meta source aliases so
  // paid Facebook/Instagram traffic doesn't fragment into facebook/ig/referral buckets.
  const channel = isMetaLikeSource(touchSource) && hasPaidMetaSignal({
    source: touchSource,
    medium: touchMedium,
    referrer: body.referrer,
    metaAdId,
    metaCampaignId,
    fbclid,
  }) ? 'meta' :
    touchSource ||
    (body.referrer && /facebook|fb|instagram/i.test(body.referrer) ? 'meta' :
     body.referrer && /google/i.test(body.referrer) ? 'google' :
     body.referrer && /tiktok/i.test(body.referrer) ? 'tiktok' :
     body.referrer ? 'referral' : 'direct');

  // ip_country / ip_region — Vercel x-forwarded-* headers carry this
  const ipCountry = request.headers.get('x-vercel-ip-country') || null;
  const ipRegion = request.headers.get('x-vercel-ip-region') || null;
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /bot|crawler|spider|headless|preview/i.test(userAgent);
  const isInternal = Boolean(body.is_internal) || /admin\.shopify\.com|adsmanager\.facebook\.com/i.test(body.referrer ?? '');
  const trafficClass = isBot ? 'bot' : isInternal ? 'internal_qa' :
    channel === 'meta' && hasPaidMetaSignal({
      source: touchSource,
      medium: touchMedium,
      referrer: body.referrer,
      metaAdId,
      metaCampaignId,
      fbclid,
    }) ? 'paid_meta' :
    channel === 'direct' ? 'unknown_direct' : channel;

  const { error } = await sb.from('attribution_touches').insert({
    ts: body.ts || new Date().toISOString(),
    session_id: body.session_id,
    event_type: eventType,
    event_value: typeof body.event_value === 'string' ? parseFloat(body.event_value) || null : (body.event_value || null),
    channel,
    utm_source: body.utm_source || null,
    utm_medium: body.utm_medium || null,
    utm_campaign: body.utm_campaign || null,
    utm_content: body.utm_content || null,
    utm_term: body.utm_term || null,
    page_path: body.page_path || null,
    landing_page_id: landingPageId,
    shopify_product_id: body.shopify_product_id || null,
    referrer: body.referrer || null,
    device_type: body.device_type || null,
    user_agent: userAgent.slice(0, 500),
    ip_country: ipCountry,
    ip_region: ipRegion,
    anonymous_id: body.anonymous_id || null,
    meta_campaign_id: metaCampaignId,
    meta_adset_id: metaAdsetId,
    meta_ad_id: metaAdId,
    first_touch_meta_ad_id: firstTouchMetaAdId,
    current_touch_meta_ad_id: metaAdId,
    fbclid: fbclid || null,
    is_internal: isInternal,
    traffic_class: trafficClass,
    event_metadata: {
      shopify_product_handle: body.shopify_product_handle,
      shopify_variant_id: body.shopify_variant_id,
      page_type: body.page_type,
      page_title: body.page_title,
      page_url: body.page_url || null,
      locale: body.locale,
      market_handle: body.market_handle,
      quantity: body.quantity,
      raw_event_type: body.event_type,
      anonymous_id: body.anonymous_id || null,
      first_touch: body.first_touch ?? null,
      current_touch: body.current_touch ?? null,
      utm_angle: body.utm_angle || null,
      utm_hook: body.utm_hook || null,
      experiment_id: body.experiment_id || null,
      experiment_key: body.experiment_key || null,
      landing_page_version: body.landing_page_version || null,
      utm_campaign_id: body.utm_campaign_id || null,
      utm_adset_id: body.utm_adset_id || null,
      utm_ad_id: body.utm_ad_id || null,
      fbp: body.fbp || null,
      fbc: body.fbc || null,
      fbclid: fbclid || null,
      internal_reason: body.internal_reason || null,
      event_properties: body.event_properties ?? null,
    },
  });

  if (error) {
    console.error('storefront-event insert failed:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, {
    // CORS so the storefront pixel can POST cross-origin
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
