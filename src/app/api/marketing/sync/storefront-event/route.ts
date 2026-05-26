// /api/marketing/sync/storefront-event
// Receives storefront-side journey events from theme-assets/snippets/everest-attribution-pixel.liquid.
// Writes legacy attribution_touches plus normalized visitor_identity / sessions / journey_events rows.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const LEGACY_ALLOWED_EVENTS = new Set([
  'session_start', 'page_view', 'product_view', 'product_viewed',
  'add_to_cart', 'product_added_to_cart', 'checkout_start', 'checkout_started', 'order_placed',
]);

const JOURNEY_EVENTS = new Set([
  'page_view',
  'product_viewed',
  'product_added_to_cart',
  'checkout_started',
  'compatibility_cta_click',
  'whatsapp_click',
  'shopify_inbox_click',
  'installation_faq_open',
  'hose_connection_faq_open',
  'delivery_faq_open',
  'returns_faq_open',
  'comparison_section_view',
  'reviews_section_view',
  'cart_add_request',
  'cart_add_failed',
]);

const EVENT_ALIASES: Record<string, string> = {
  product_view: 'product_viewed',
  add_to_cart: 'product_added_to_cart',
  checkout_start: 'checkout_started',
};

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface AttributionPayload {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  angle?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  fbp?: string;
  fbc?: string;
  referrer?: string;
  landing_page?: string;
}

interface PixelEvent {
  event_type?: string;
  event_name?: string;
  anonymous_id?: string;
  ga_user_pseudo_id?: string;
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
  utm_angle?: string;
  utm_campaign_id?: string;
  utm_adset_id?: string;
  utm_ad_id?: string;
  fbp?: string;
  fbc?: string;
  first_touch?: AttributionPayload;
  current_touch?: AttributionPayload;
  shopify_customer_id?: string;
  email_hash?: string;
  phone_hash?: string;
  shopify_product_id?: string;
  shopify_product_handle?: string;
  shopify_variant_id?: string;
  page_type?: string;
  locale?: string;
  market_handle?: string;
  event_value?: number | string;
  quantity?: number;
  event_properties?: Record<string, unknown>;
}

function clean(value: unknown, max = 512): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeEvent(raw: string | undefined): string | null {
  if (!raw) return null;
  const mapped = EVENT_ALIASES[raw] ?? raw;
  return JOURNEY_EVENTS.has(mapped) ? mapped : LEGACY_ALLOWED_EVENTS.has(raw) ? null : null;
}

function inferChannel(source?: string | null, referrer?: string | null): string {
  const s = (source || '').toLowerCase();
  if (s.includes('facebook') || s.includes('instagram') || s === 'fb' || s === 'ig') return 'meta';
  if (s.includes('google')) return 'google';
  if (s.includes('tiktok')) return 'tiktok';
  if (s.includes('email') || s.includes('klaviyo')) return 'email';
  if (source) return source;
  const r = (referrer || '').toLowerCase();
  if (!r) return 'direct';
  if (r.includes('facebook.com') || r.includes('instagram.com') || r.includes('fb.com')) return 'meta';
  if (r.includes('google.')) return 'organic';
  if (r.includes('tiktok.com')) return 'tiktok';
  return 'referral';
}

function vercelHeader(request: NextRequest, key: string): string | null {
  const value = request.headers.get(key);
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

export async function POST(request: NextRequest) {
  let body: PixelEvent;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawEvent = body.event_name || body.event_type;
  if (!rawEvent || (!JOURNEY_EVENTS.has(EVENT_ALIASES[rawEvent] ?? rawEvent) && !LEGACY_ALLOWED_EVENTS.has(rawEvent))) {
    return NextResponse.json({ error: `event_name must be one of ${Array.from(JOURNEY_EVENTS).join(',')}` }, { status: 400 });
  }
  if (!body.session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const anonymousId = clean(body.anonymous_id, 128) || clean(body.session_id, 128);
  if (!anonymousId) return NextResponse.json({ error: 'anonymous_id required' }, { status: 400 });

  const eventName = normalizeEvent(rawEvent);
  const eventTs = clean(body.ts) || new Date().toISOString();
  const pagePath = clean(body.page_path) || (() => {
    try { return body.page_url ? new URL(body.page_url).pathname : null; } catch { return null; }
  })();
  const pageUrl = clean(body.page_url, 2048) || pagePath;
  const first = body.first_touch || {};
  const current = body.current_touch || {};
  const source = clean(current.source, 128) || clean(body.utm_source, 128) || inferChannel(clean(body.utm_source), clean(body.referrer));
  const medium = clean(current.medium, 128) || clean(body.utm_medium, 128);
  const campaign = clean(current.campaign, 256) || clean(body.utm_campaign, 256);
  const content = clean(current.content, 256) || clean(body.utm_content, 256);
  const term = clean(current.term, 256) || clean(body.utm_term, 256);
  const adAngle = clean(current.angle, 128) || clean(body.utm_angle, 128) || content;
  const metaCampaignId = clean(current.campaign_id, 128) || clean(body.utm_campaign_id, 128) || campaign;
  const metaAdsetId = clean(current.adset_id, 128) || clean(body.utm_adset_id, 128) || term;
  const metaAdId = clean(current.ad_id, 128) || clean(body.utm_ad_id, 128) || content;
  const country = vercelHeader(request, 'x-vercel-ip-country');
  const city = vercelHeader(request, 'x-vercel-ip-city');
  const device = clean(body.device_type, 64) || 'unknown';
  const ua = request.headers.get('user-agent') || '';
  const sb = svc();

  let landingPageId: string | null = null;
  if (pagePath && pagePath.includes('/products/')) {
    const handle = pagePath.split('/products/')[1]?.split('/')[0]?.split('?')[0];
    if (handle) {
      const { data: lp } = await sb
        .from('landing_pages')
        .select('id')
        .ilike('shopify_url', `%${handle}%`)
        .limit(1)
        .maybeSingle();
      landingPageId = lp?.id ?? null;
    }
  }

  const { data: existingVisitor, error: visitorReadErr } = await sb
    .from('visitor_identity')
    .select('anonymous_id, first_seen_at')
    .eq('anonymous_id', anonymousId)
    .maybeSingle();
  if (visitorReadErr) return NextResponse.json({ error: 'visitor_read_failed', detail: visitorReadErr.message }, { status: 500 });

  if (!existingVisitor) {
    const { error } = await sb.from('visitor_identity').upsert({
      anonymous_id: anonymousId,
      ga_user_pseudo_id: clean(body.ga_user_pseudo_id, 128),
      shopify_customer_id: clean(body.shopify_customer_id, 128),
      email_hash: clean(body.email_hash, 128),
      phone_hash: clean(body.phone_hash, 128),
      first_seen_at: eventTs,
      last_seen_at: eventTs,
      first_landing_page: clean(first.landing_page, 2048) || pageUrl,
      first_referrer: clean(first.referrer, 2048) || clean(body.referrer, 2048),
      first_utm_source: clean(first.source, 128) || clean(body.utm_source, 128),
      first_utm_medium: clean(first.medium, 128) || clean(body.utm_medium, 128),
      first_utm_campaign: clean(first.campaign, 256) || clean(body.utm_campaign, 256),
      first_utm_content: clean(first.content, 256) || clean(body.utm_content, 256),
      first_utm_term: clean(first.term, 256) || clean(body.utm_term, 256),
      first_utm_angle: clean(first.angle, 128) || clean(body.utm_angle, 128) || clean(first.content, 256),
      first_meta_campaign_id: clean(first.campaign_id, 128) || clean(body.utm_campaign_id, 128),
      first_meta_adset_id: clean(first.adset_id, 128) || clean(body.utm_adset_id, 128),
      first_meta_ad_id: clean(first.ad_id, 128) || clean(body.utm_ad_id, 128),
      first_fbp: clean(first.fbp, 256) || clean(body.fbp, 256),
      first_fbc: clean(first.fbc, 256) || clean(body.fbc, 256),
      device,
      country,
      city,
    }, { onConflict: 'anonymous_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: 'visitor_insert_failed', detail: error.message }, { status: 500 });
  } else {
    const { error } = await sb.from('visitor_identity').update({
      last_seen_at: eventTs,
      ga_user_pseudo_id: clean(body.ga_user_pseudo_id, 128) || undefined,
      shopify_customer_id: clean(body.shopify_customer_id, 128) || undefined,
      email_hash: clean(body.email_hash, 128) || undefined,
      phone_hash: clean(body.phone_hash, 128) || undefined,
      updated_at: new Date().toISOString(),
    }).eq('anonymous_id', anonymousId);
    if (error) return NextResponse.json({ error: 'visitor_update_failed', detail: error.message }, { status: 500 });
  }

  const { data: existingSession, error: sessionReadErr } = await sb
    .from('sessions')
    .select('session_id, session_number')
    .eq('session_id', body.session_id)
    .maybeSingle();
  if (sessionReadErr) return NextResponse.json({ error: 'session_read_failed', detail: sessionReadErr.message }, { status: 500 });

  let sessionNumber = existingSession?.session_number as number | undefined;
  if (!existingSession) {
    const { data: maxRows, error: maxErr } = await sb
      .from('sessions')
      .select('session_number')
      .eq('anonymous_id', anonymousId)
      .order('session_number', { ascending: false })
      .limit(1);
    if (maxErr) return NextResponse.json({ error: 'session_number_failed', detail: maxErr.message }, { status: 500 });
    sessionNumber = ((maxRows?.[0]?.session_number as number | undefined) || 0) + 1;
    const { error } = await sb.from('sessions').upsert({
      session_id: body.session_id.slice(0, 128),
      anonymous_id: anonymousId,
      ga_user_pseudo_id: clean(body.ga_user_pseudo_id, 128),
      session_start_at: eventTs,
      session_end_at: eventTs,
      landing_page: pageUrl,
      source,
      medium,
      campaign,
      content,
      term,
      ad_angle: adAngle,
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
      device,
      country,
      city,
      is_first_session: sessionNumber === 1,
      session_number: sessionNumber,
    }, { onConflict: 'session_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: 'session_insert_failed', detail: error.message }, { status: 500 });
  } else {
    const { error } = await sb.from('sessions').update({ session_end_at: eventTs, updated_at: new Date().toISOString() }).eq('session_id', body.session_id);
    if (error) return NextResponse.json({ error: 'session_update_failed', detail: error.message }, { status: 500 });
  }

  const channel = source || inferChannel(clean(body.utm_source), clean(body.referrer));
  const legacyEventType = EVENT_ALIASES[rawEvent] ? rawEvent : rawEvent === 'product_viewed' ? 'product_view' : rawEvent === 'product_added_to_cart' ? 'add_to_cart' : rawEvent === 'checkout_started' ? 'checkout_start' : rawEvent;
  const { error: touchErr } = await sb.from('attribution_touches').insert({
    ts: eventTs,
    session_id: body.session_id,
    event_type: legacyEventType,
    event_value: typeof body.event_value === 'string' ? parseFloat(body.event_value) || null : (body.event_value || null),
    channel,
    utm_source: clean(body.utm_source, 128),
    utm_medium: clean(body.utm_medium, 128),
    utm_campaign: clean(body.utm_campaign, 256),
    utm_content: clean(body.utm_content, 256),
    utm_term: clean(body.utm_term, 256),
    page_path: pagePath,
    landing_page_id: landingPageId,
    shopify_product_id: clean(body.shopify_product_id, 128),
    referrer: clean(body.referrer, 2048),
    device_type: device,
    user_agent: ua.slice(0, 500),
    ip_country: country,
    ip_region: vercelHeader(request, 'x-vercel-ip-region'),
    event_metadata: {
      anonymous_id: anonymousId,
      journey_event_name: eventName,
      shopify_product_handle: body.shopify_product_handle,
      shopify_variant_id: body.shopify_variant_id,
      page_type: body.page_type,
      locale: body.locale,
      market_handle: body.market_handle,
      quantity: body.quantity,
      session_number: sessionNumber,
      ...(body.event_properties || {}),
    },
  });
  if (touchErr) console.warn('attribution_touches insert failed (non-fatal):', touchErr.message);

  if (eventName) {
    const { error: journeyErr } = await sb.from('journey_events').insert({
      event_name: eventName,
      event_timestamp: eventTs,
      anonymous_id: anonymousId,
      ga_user_pseudo_id: clean(body.ga_user_pseudo_id, 128),
      session_id: body.session_id.slice(0, 128),
      page_url: pageUrl,
      source,
      medium,
      campaign,
      content,
      term,
      ad_angle: adAngle,
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
      event_properties: {
        page_path: pagePath,
        referrer: body.referrer,
        shopify_product_id: body.shopify_product_id,
        shopify_product_handle: body.shopify_product_handle,
        shopify_variant_id: body.shopify_variant_id,
        page_type: body.page_type,
        locale: body.locale,
        market_handle: body.market_handle,
        quantity: body.quantity,
        event_value: body.event_value,
        session_number: sessionNumber,
        ...(body.event_properties || {}),
      },
    });
    if (journeyErr) return NextResponse.json({ error: 'journey_insert_failed', detail: journeyErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, anonymous_id: anonymousId, session_id: body.session_id, session_number: sessionNumber, journey_event: eventName });
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
