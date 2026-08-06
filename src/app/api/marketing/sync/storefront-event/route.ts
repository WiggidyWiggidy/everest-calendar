// /api/marketing/sync/storefront-event
// Receives storefront-side pixel events from theme-assets/snippets/everest-attribution-pixel.liquid.
// Writes one row per event to attribution_touches.
//
// Closes the performance feedback loop: storefront events → Supabase → asset score → page-builder selector.
//
// Auth: NONE (public, called from browsers). Mitigation:
//   - Validates event_type whitelist
//   - Canonicalises channel to DB-safe source taxonomy
//   - No PII captured
//   - Row-level rate limit (TODO if needed) via session_id

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const EVENT_ALIASES: Record<string, string> = {
  product_viewed: 'product_view',
  product_added_to_cart: 'add_to_cart',
  checkout_started: 'checkout_start',
};

const ALLOWED_EVENTS = new Set([
  'session_start', 'page_view', 'product_view',
  'add_to_cart', 'checkout_start', 'order_placed',
  'product_viewed', 'product_added_to_cart', 'checkout_started',
  'cart_add_request', 'cart_add_failed', 'cart_view', 'cart_checkout_click',
  'cart_remove_item', 'cart_quantity_change', 'cart_exit_without_checkout', 'checkout_error',
  'hero_cta_click', 'sticky_cta_click', 'whatsapp_click', 'whatsapp_cta_click',
  'shopify_inbox_click', 'chatway_click', 'compatibility_cta_click',
  'installation_faq_open', 'hose_connection_faq_open', 'delivery_faq_open',
  'returns_faq_open', 'comparison_section_view', 'reviews_section_view',
  'offer_section_view', 'guarantee_section_view', 'whats_in_box_section_view',
  'testimonial_section_view', 'mechanism_section_view', 'buy_area_view',
  'price_lock_popup_view', 'price_lock_popup_submit', 'exit_intent_popup_view',
  'exit_intent_popup_submit', 'whatsapp_lead_submit', 'lead_form_submit',
  'scroll_depth_25', 'scroll_depth_50', 'scroll_depth_75', 'scroll_depth_90',
]);

const CANONICAL_CHANNELS = new Set([
  'meta', 'google', 'tiktok', 'pinterest', 'linkedin', 'organic',
  'direct', 'email', 'referral', 'sms', 'whatsapp', 'unknown',
]);

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function clean(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function canonicalChannel(source?: string | null, medium?: string | null, referrer?: string | null) {
  const src = clean(source);
  const med = clean(medium);
  const ref = clean(referrer);
  const combined = `${src} ${med} ${ref}`;

  if (/facebook|fb\b|instagram|\big\b|meta|threads/.test(combined)) return 'meta';
  if (/google|gclid|youtube|yt\b/.test(combined)) return 'google';
  if (/tiktok|ttclid/.test(combined)) return 'tiktok';
  if (/pinterest/.test(combined)) return 'pinterest';
  if (/linkedin/.test(combined)) return 'linkedin';
  if (/whatsapp|wa\.me/.test(combined)) return 'whatsapp';
  if (/email|klaviyo|mailchimp|newsletter/.test(combined)) return 'email';
  if (/sms|text/.test(combined)) return 'sms';
  if (/organic|seo/.test(combined)) return 'organic';

  if (!src && !ref) return 'direct';
  if (CANONICAL_CHANNELS.has(src)) return src;
  if (ref) return 'referral';
  return 'unknown';
}

interface PixelEvent {
  event_type?: string;
  session_id?: string;
  page_path?: string;
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
  page_url?: string;
  first_touch?: Record<string, unknown>;
  current_touch?: Record<string, unknown>;
  utm_angle?: string;
  utm_campaign_id?: string;
  utm_adset_id?: string;
  utm_ad_id?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  is_internal?: boolean;
  event_properties?: Record<string, unknown>;
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

  const sb = svc();
  let landingPageId: string | null = null;
  if (body.page_path && body.page_path.includes('/products/')) {
    const handle = body.page_path.split('/products/')[1]?.split('/')[0]?.split('?')[0];
    if (handle) {
      const { data: lp } = await sb
        .from('landing_pages')
        .select('id')
        .ilike('shopify_url', `%/products/${handle.replace(/[_%\\]/g, char => `\\${char}`)}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      landingPageId = lp?.id ?? null;
    }
  }

  const channel = canonicalChannel(body.utm_source, body.utm_medium, body.referrer);

  const ipCountry = request.headers.get('x-vercel-ip-country') || null;
  const ipRegion = request.headers.get('x-vercel-ip-region') || null;
  const userAgent = request.headers.get('user-agent') || '';
  const firstTouch = body.first_touch ?? {};
  const currentTouch = body.current_touch ?? {};
  const metaCampaignId = body.utm_campaign_id || String(currentTouch.campaign_id ?? '') || null;
  const metaAdsetId = body.utm_adset_id || String(currentTouch.adset_id ?? '') || null;
  const metaAdId = body.utm_ad_id || String(currentTouch.ad_id ?? '') || body.utm_content || null;
  const firstTouchMetaAdId = String(firstTouch.ad_id ?? '') || null;
  const isBot = /bot|crawler|spider|headless|preview/i.test(userAgent);
  const isInternal = Boolean(body.is_internal) || /admin\.shopify\.com|adsmanager\.facebook\.com/i.test(body.referrer ?? '');
  const trafficClass = isBot ? 'bot' : isInternal ? 'internal_qa' :
    channel === 'meta' && (metaAdId || body.utm_source) ? 'paid_meta' :
    channel === 'whatsapp' ? 'whatsapp_return' :
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
    fbclid: body.fbclid || null,
    is_internal: isInternal,
    traffic_class: trafficClass,
    event_metadata: {
      shopify_product_handle: body.shopify_product_handle,
      shopify_variant_id: body.shopify_variant_id,
      page_type: body.page_type,
      locale: body.locale,
      market_handle: body.market_handle,
      quantity: body.quantity,
      raw_event_type: body.event_type,
      anonymous_id: body.anonymous_id,
      page_url: body.page_url,
      first_touch: body.first_touch,
      current_touch: body.current_touch,
      utm_angle: body.utm_angle,
      utm_campaign_id: body.utm_campaign_id,
      utm_adset_id: body.utm_adset_id,
      utm_ad_id: body.utm_ad_id,
      fbp: body.fbp,
      fbc: body.fbc,
      fbclid: body.fbclid,
      event_properties: body.event_properties,
    },
  });

  if (error) {
    console.error('storefront-event insert failed:', error.message, { eventType, channel, utm_source: body.utm_source });
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

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
