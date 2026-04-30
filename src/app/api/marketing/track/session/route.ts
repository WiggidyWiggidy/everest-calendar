// /api/marketing/track/session
// Storefront session pixel — accepts event POSTs from Shopify theme JS.
// Writes a row to attribution_touches per event.
// Public endpoint (no auth) — anyone can POST a session event. Server-side validation prevents abuse.
//
// Theme JS posts:
//   { session_id, event_type, page_path, utms: {source,medium,campaign,content,term},
//     referrer, landing_page_handle?, shopify_product_id?, event_value? }
//
// CORS-friendly so it can be called from the storefront origin (everestlabs.co).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531'; // own user; not exposed in payload
const ALLOWED_EVENT_TYPES = new Set([
  'session_start', 'page_view', 'add_to_cart', 'checkout_start', 'order_placed', 'remove_from_cart',
]);
const ALLOWED_CHANNELS = new Set([
  'meta', 'google', 'tiktok', 'pinterest', 'linkedin',
  'organic', 'direct', 'email', 'referral', 'sms', 'unknown',
]);

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface SessionEventBody {
  session_id?: string;
  customer_id?: string;
  event_type?: string;
  page_path?: string;
  utms?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  referrer?: string;
  landing_page_handle?: string;
  shopify_product_id?: string;
  event_value?: number;
  event_metadata?: Record<string, unknown>;
}

function corsHeaders(origin: string | null) {
  // Permissive CORS for storefront pixel — only POST/OPTIONS, no credentials.
  // Locked to everestlabs.co origin in production; reflect for any dev.
  const allowedOrigin =
    origin && (origin.endsWith('everestlabs.co') || origin.endsWith('vercel.app') || origin.includes('localhost'))
      ? origin
      : 'https://everestlabs.co';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

function inferChannel(utm_source?: string, referrer?: string): string {
  if (utm_source) {
    const s = utm_source.toLowerCase();
    if (ALLOWED_CHANNELS.has(s)) return s;
    if (s.includes('facebook') || s.includes('instagram') || s.includes('fb')) return 'meta';
    if (s.includes('google')) return 'google';
    if (s.includes('tiktok')) return 'tiktok';
    if (s.includes('email') || s.includes('klaviyo')) return 'email';
  }
  if (!referrer) return 'direct';
  const r = referrer.toLowerCase();
  if (r.includes('facebook.com') || r.includes('instagram.com') || r.includes('fb.com')) return 'meta';
  if (r.includes('google.')) return 'organic'; // organic search
  if (r.includes('tiktok.com')) return 'tiktok';
  return 'referral';
}

function inferDeviceType(ua: string | null): string {
  if (!ua) return 'unknown';
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return 'tablet';
  if (/mobi|iphone|android/.test(u)) return 'mobile';
  return 'desktop';
}

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request.headers.get('origin'));
  try {
    const body = (await request.json()) as SessionEventBody;
    if (!body.session_id || !body.event_type) {
      return NextResponse.json({ error: 'session_id and event_type required' }, { status: 400, headers: cors });
    }
    if (!ALLOWED_EVENT_TYPES.has(body.event_type)) {
      return NextResponse.json({ error: `event_type must be one of: ${Array.from(ALLOWED_EVENT_TYPES).join(', ')}` }, { status: 400, headers: cors });
    }

    const ua = request.headers.get('user-agent');
    const ip_country = request.headers.get('x-vercel-ip-country') ?? null;
    const ip_region = request.headers.get('x-vercel-ip-country-region') ?? null;
    const channel = inferChannel(body.utms?.source, body.referrer);
    const device_type = inferDeviceType(ua);

    // Resolve landing_page_id from the handle if provided
    const sb = svcClient();
    let landing_page_id: string | null = null;
    if (body.landing_page_handle) {
      const lpUrl = `https://everestlabs.co/products/${body.landing_page_handle}`;
      const { data: lp } = await sb
        .from('landing_pages')
        .select('id')
        .eq('user_id', TOM_USER_ID)
        .ilike('shopify_url', `%/${body.landing_page_handle}`)
        .or(`shopify_url.eq.${lpUrl}`)
        .maybeSingle();
      if (lp) landing_page_id = lp.id;
    }

    const { error } = await sb.from('attribution_touches').insert({
      session_id: body.session_id.slice(0, 128),
      customer_id: body.customer_id?.slice(0, 64) ?? null,
      channel,
      utm_source: body.utms?.source?.slice(0, 64) ?? null,
      utm_medium: body.utms?.medium?.slice(0, 64) ?? null,
      utm_campaign: body.utms?.campaign?.slice(0, 128) ?? null,
      utm_content: body.utms?.content?.slice(0, 128) ?? null,
      utm_term: body.utms?.term?.slice(0, 128) ?? null,
      page_path: body.page_path?.slice(0, 512) ?? null,
      landing_page_id,
      shopify_product_id: body.shopify_product_id?.slice(0, 64) ?? null,
      referrer: body.referrer?.slice(0, 512) ?? null,
      device_type,
      user_agent: ua?.slice(0, 512) ?? null,
      ip_country,
      ip_region,
      event_type: body.event_type,
      event_value: typeof body.event_value === 'number' ? body.event_value : null,
      event_metadata: body.event_metadata ?? {},
    });

    if (error) {
      console.error('attribution_touches insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500, headers: cors });
    }

    return NextResponse.json({ ok: true }, { headers: cors });
  } catch (err) {
    console.error('track/session error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors });
  }
}
