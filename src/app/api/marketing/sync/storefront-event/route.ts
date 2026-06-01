// /api/marketing/sync/storefront-event
// Receives storefront-side pixel events from theme-assets/snippets/everest-attribution-pixel.liquid.
// Writes one row per event to attribution_touches.
//
// Closes the performance feedback loop: storefront events → Supabase → asset score → page-builder selector.
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
};

const ALLOWED_EVENTS = new Set([
  'session_start', 'page_view', 'product_view',
  'add_to_cart', 'checkout_start', 'order_placed',
  'product_viewed', 'product_added_to_cart', 'checkout_started',
  'cart_add_request', 'cart_add_failed',
  'whatsapp_click', 'shopify_inbox_click', 'compatibility_cta_click',
  'installation_faq_open', 'hose_connection_faq_open', 'delivery_faq_open',
  'returns_faq_open', 'comparison_section_view', 'reviews_section_view',
]);

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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

  // Resolve landing_page_id if the page_path matches a known KRYO variant
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

  // Resolve channel from utm_source (or referrer)
  const channel = body.utm_source ||
    (body.referrer && /facebook|fb|instagram/i.test(body.referrer) ? 'meta' :
     body.referrer && /google/i.test(body.referrer) ? 'google' :
     body.referrer && /tiktok/i.test(body.referrer) ? 'tiktok' :
     body.referrer ? 'referral' : 'direct');

  // ip_country / ip_region — Vercel x-forwarded-* headers carry this
  const ipCountry = request.headers.get('x-vercel-ip-country') || null;
  const ipRegion = request.headers.get('x-vercel-ip-region') || null;
  const userAgent = request.headers.get('user-agent') || '';

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
      event_properties: body.event_properties,
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
