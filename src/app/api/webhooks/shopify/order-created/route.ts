// /api/webhooks/shopify/order-created
// Shopify webhook fires on every order create.
// Extracts UTM params from order.landing_site_ref / order.note_attributes / order.customer_locale,
// then writes a row to attribution_touches with event_type='order_placed' and event_value=order.total_price.
//
// Configure Shopify Admin → Settings → Notifications → Webhooks → Create webhook:
//   Topic: Order creation
//   Format: JSON
//   URL: https://everest-calendar.vercel.app/api/webhooks/shopify/order-created
//
// Webhook signature is verified via X-Shopify-Hmac-Sha256 header + SHOPIFY_WEBHOOK_SECRET env var.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification (dev only).');
    return true;
  }
  if (!hmacHeader) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

interface ShopifyOrder {
  id: number | string;
  customer?: { id?: number | string; email?: string };
  total_price?: string;
  currency?: string;
  landing_site?: string;
  landing_site_ref?: string;
  referring_site?: string;
  source_name?: string;
  client_details?: { user_agent?: string; browser_ip?: string };
  note_attributes?: Array<{ name: string; value: string }>;
  line_items?: Array<{ product_id?: number | string; variant_id?: number | string; title?: string }>;
  email?: string;
  created_at?: string;
}

function parseUTMsFromUrl(url: string | undefined): Record<string, string | undefined> {
  if (!url) return {};
  try {
    const u = new URL(url, 'https://everestlabs.co');
    return {
      utm_source: u.searchParams.get('utm_source') || undefined,
      utm_medium: u.searchParams.get('utm_medium') || undefined,
      utm_campaign: u.searchParams.get('utm_campaign') || undefined,
      utm_content: u.searchParams.get('utm_content') || undefined,
      utm_term: u.searchParams.get('utm_term') || undefined,
    };
  } catch {
    return {};
  }
}

function utmsFromNoteAttributes(attrs?: Array<{ name: string; value: string }>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (!attrs) return out;
  for (const a of attrs) {
    const k = a.name.toLowerCase();
    if (k === 'utm_source' || k === 'utm_medium' || k === 'utm_campaign' || k === 'utm_content' || k === 'utm_term') {
      out[k] = a.value;
    }
  }
  return out;
}

function inferChannelFromUtm(source?: string, referring?: string): string | null {
  if (source) {
    const s = source.toLowerCase();
    if (['meta', 'google', 'tiktok', 'pinterest', 'linkedin', 'email'].includes(s)) return s;
    if (s.includes('facebook') || s.includes('instagram') || s.includes('fb')) return 'meta';
    if (s.includes('google')) return 'google';
    if (s.includes('klaviyo') || s.includes('email')) return 'email';
  }
  if (referring) {
    const r = referring.toLowerCase();
    if (r.includes('facebook.com') || r.includes('instagram.com')) return 'meta';
    if (r.includes('google.')) return 'organic';
  }
  return source ? 'unknown' : 'direct';
}

function pickProductHandleFromLandingSite(landing: string | undefined): string | null {
  if (!landing) return null;
  const m = landing.match(/\/(?:[a-z]{2}-[a-z]{2}\/)?products\/([^/?#]+)/i);
  return m?.[1] ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    if (!verifyShopifyHmac(rawBody, hmac)) {
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
    }

    const order = JSON.parse(rawBody) as ShopifyOrder;

    // Extract UTMs — landing_site (URL with query) wins, then note_attributes (set by storefront pixel)
    const utmsFromUrl = parseUTMsFromUrl(order.landing_site);
    const utmsFromNotes = utmsFromNoteAttributes(order.note_attributes);
    const utm_source = utmsFromUrl.utm_source ?? utmsFromNotes.utm_source;
    const utm_medium = utmsFromUrl.utm_medium ?? utmsFromNotes.utm_medium;
    const utm_campaign = utmsFromUrl.utm_campaign ?? utmsFromNotes.utm_campaign;
    const utm_content = utmsFromUrl.utm_content ?? utmsFromNotes.utm_content;
    const utm_term = utmsFromUrl.utm_term ?? utmsFromNotes.utm_term;

    const channel = inferChannelFromUtm(utm_source, order.referring_site);
    const handle = pickProductHandleFromLandingSite(order.landing_site);

    // Resolve landing_page_id by handle
    const sb = svcClient();
    let landing_page_id: string | null = null;
    if (handle) {
      const { data: lp } = await sb
        .from('landing_pages')
        .select('id')
        .eq('user_id', TOM_USER_ID)
        .ilike('shopify_url', `%/products/${handle}`)
        .maybeSingle();
      if (lp) landing_page_id = lp.id;
    }

    const total = parseFloat(order.total_price ?? '0') || null;
    const customer_id = order.customer?.id ? String(order.customer.id) : (order.email ?? null);

    // session_id: Shopify orders don't carry our pixel session_id directly. Use a deterministic
    // synthetic id based on order_id so we don't double-count if the webhook fires twice.
    const session_id_synthetic = `shopify_order:${order.id}`;

    const { error } = await sb.from('attribution_touches').insert({
      ts: order.created_at ?? new Date().toISOString(),
      session_id: session_id_synthetic,
      customer_id,
      shopify_order_id: String(order.id),
      channel,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      page_path: order.landing_site ? new URL(order.landing_site, 'https://everestlabs.co').pathname : null,
      landing_page_id,
      shopify_product_id: order.line_items?.[0]?.product_id ? String(order.line_items[0].product_id) : null,
      referrer: order.referring_site ?? null,
      device_type: order.client_details?.user_agent
        ? (/mobi|iphone|android/i.test(order.client_details.user_agent) ? 'mobile' : 'desktop')
        : null,
      user_agent: order.client_details?.user_agent?.slice(0, 512) ?? null,
      ip_country: null, // Shopify doesn't send ip_country in webhook reliably
      ip_region: null,
      event_type: 'order_placed',
      event_value: total,
      event_metadata: {
        currency: order.currency,
        line_items_count: order.line_items?.length ?? 0,
        source_name: order.source_name,
      },
    });

    if (error) {
      console.error('attribution_touches insert (webhook) failed:', error);
      // Don't 500 to Shopify — they'll retry. Acknowledge so we don't block their queue.
      return NextResponse.json({ ok: true, warning: 'logged-and-skipped: ' + error.message });
    }

    return NextResponse.json({ ok: true, attributed_to: { channel, utm_campaign, utm_content, landing_page_id } });
  } catch (err) {
    console.error('shopify order-created webhook error:', err);
    // Acknowledge to prevent retry storm; we'll see the error in logs.
    return NextResponse.json({ ok: true, error: (err as Error).message });
  }
}
