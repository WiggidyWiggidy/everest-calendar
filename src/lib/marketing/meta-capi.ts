// meta-capi.ts — server-side Meta Conversions API sender for KRYO funnel events.
//
// WHY THIS EXISTS (root cause, 2026-07-31):
//   The kryo2_ theme fires NO browser Meta pixel (no fbq) for AddToCart, and the
//   Shopify browser pixel is blocked on most mobile/in-app-browser traffic (~70% of
//   sessions). Result: first-party pixel recorded ~7 add-to-carts that Meta logged as ~1,
//   so Meta optimises against an event it barely receives and CPA looks ~$80 (phantom).
//   Server-side CAPI is immune to browser/ITP blocking, so Meta finally sees real adds.
//
// This mirrors the existing, working CAPI pattern in
//   src/app/api/marketing/kryo/leads/capture/route.ts (event_name 'Lead').
// It is DEPLOY-GATED: no effect until Tom approves a deploy. Prepared for review.

import crypto from 'crypto';

export type MetaFunnelEvent = 'AddToCart' | 'InitiateCheckout' | 'Purchase';

export interface MetaCapiInput {
  eventName: MetaFunnelEvent;
  eventId: string;               // dedup key; reuse the first-party event id if present
  eventSourceUrl?: string | null;
  fbclid?: string | null;        // used to build fbc
  fbp?: string | null;           // _fbp cookie if forwarded
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  value?: number | null;
  currency?: string;             // KRYO = AED
  contentIds?: string[];         // e.g. [shopify_variant_id]
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function metaPixelConfig() {
  return {
    pixelId: process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || null,
    accessToken: process.env.META_CAPI_ACCESS_TOKEN || process.env.FACEBOOK_CONVERSIONS_API_TOKEN || null,
    testEventCode: process.env.META_TEST_EVENT_CODE || null,
  };
}

// fbc format required by Meta: fb.1.<unix_ms>.<fbclid>
function buildFbc(fbclid?: string | null): string | undefined {
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

export interface MetaCapiResult {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  error?: string;
}

export async function sendMetaFunnelEvent(input: MetaCapiInput): Promise<MetaCapiResult> {
  const { pixelId, accessToken, testEventCode } = metaPixelConfig();
  if (!pixelId || !accessToken) {
    return { attempted: false, ok: false, status: null, error: 'meta_capi_not_configured' };
  }

  const userData: Record<string, unknown> = {};
  const fbc = buildFbc(input.fbclid);
  if (fbc) userData.fbc = fbc;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  // Meta requires at least one user_data key; fall back to a hashed external id.
  if (Object.keys(userData).length === 0) userData.external_id = sha256(input.eventId);

  const customData: Record<string, unknown> = {};
  if (typeof input.value === 'number') customData.value = input.value;
  customData.currency = input.currency || 'AED';
  if (input.contentIds?.length) {
    customData.content_ids = input.contentIds;
    customData.content_type = 'product';
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,           // dedup with browser pixel if one is ever added
        action_source: 'website',
        event_source_url: input.eventSourceUrl || undefined,
        user_data: userData,
        custom_data: customData,
      },
    ],
  };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, access_token: accessToken }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`Meta CAPI ${input.eventName} failed:`, (await res.text()).slice(0, 500));
    }
    return { attempted: true, ok: res.ok, status: res.status };
  } catch (error) {
    console.error(`Meta CAPI ${input.eventName} exception:`, error);
    return { attempted: true, ok: false, status: null, error: String((error as Error)?.message || error) };
  }
}

// Map first-party funnel event_type -> Meta standard event.
export function metaEventForFunnelType(eventType: string): MetaFunnelEvent | null {
  switch (eventType) {
    case 'add_to_cart': return 'AddToCart';
    case 'checkout_start': return 'InitiateCheckout';
    case 'order_placed': return 'Purchase';
    default: return null;
  }
}
