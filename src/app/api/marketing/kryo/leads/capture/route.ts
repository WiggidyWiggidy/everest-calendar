// /api/marketing/kryo/leads/capture
// Public browser endpoint for low-friction KRYO WhatsApp/access leads.
// Does not send WhatsApp messages and does not create deposits. It only records consented lead intent.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SOURCE_VALUES = new Set(['whatsapp', 'shopify_inbox', 'chatway', 'manual', 'other']);
const MAX_TEXT = 1000;

interface LeadCaptureBody {
  source?: string;
  consent_to_follow_up?: boolean;
  phone_e164?: string;
  whatsapp_thread_id?: string;
  anonymous_id?: string;
  session_id?: string;
  channel?: string;
  market?: string;
  device_type?: string;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  creative_id?: string;
  angle_id?: string;
  hook_id?: string;
  landing_page_version?: string;
  experiment_id?: string;
  experiment_key?: string;
  objection_primary?: string;
  qualification_notes?: string;
  page_path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  event_id?: string;
  event_source_url?: string;
  raw_payload?: Record<string, unknown>;
}

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function clean(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanPhone(value: unknown): string | null {
  const raw = clean(value, 32);
  if (!raw) return null;
  const normalized = raw.replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{6,15}$/.test(normalized)) return null;
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
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

async function sendMetaLeadEvent(params: {
  eventId: string;
  eventTime: number;
  phone: string | null;
  fbp: string | null;
  fbc: string | null;
  eventSourceUrl: string | null;
  clientUserAgent: string | null;
  clientIpAddress: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  experimentKey: string | null;
  landingPageVersion: string | null;
}) {
  const { pixelId, accessToken, testEventCode } = metaPixelConfig();
  if (!pixelId || !accessToken) return { attempted: false, ok: false, status: null, error: 'meta_capi_not_configured' };

  const userData: Record<string, unknown> = {};
  if (params.phone) userData.ph = [sha256(params.phone.replace(/\D/g, ''))];
  if (params.fbp) userData.fbp = params.fbp;
  if (params.fbc) userData.fbc = params.fbc;
  if (params.clientUserAgent) userData.client_user_agent = params.clientUserAgent;
  if (params.clientIpAddress) userData.client_ip_address = params.clientIpAddress;

  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: params.eventTime,
        event_id: params.eventId,
        action_source: 'website',
        event_source_url: params.eventSourceUrl || undefined,
        user_data: userData,
        custom_data: {
          content_name: 'KRYO WhatsApp access',
          lead_type: 'whatsapp_signup',
          meta_campaign_id: params.campaignId || undefined,
          meta_adset_id: params.adsetId || undefined,
          meta_ad_id: params.adId || undefined,
          experiment_key: params.experimentKey || undefined,
          landing_page_version: params.landingPageVersion || undefined,
        },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: accessToken }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) console.error('Meta CAPI Lead event failed:', JSON.stringify(payload).slice(0, 500));
    return { attempted: true, ok: res.ok, status: res.status, payload };
  } catch (error) {
    console.error('Meta CAPI Lead event exception:', error);
    return { attempted: true, ok: false, status: 0, error: String((error as Error)?.message || error) };
  }
}

function cors(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

export async function POST(request: NextRequest) {
  let body: LeadCaptureBody;
  try {
    body = await request.json();
  } catch {
    return cors(NextResponse.json({ error: 'invalid_json' }, { status: 400 }));
  }

  if (body.consent_to_follow_up !== true) {
    return cors(NextResponse.json({ error: 'consent_to_follow_up_required' }, { status: 400 }));
  }

  const phone = cleanPhone(body.phone_e164);
  const sessionId = clean(body.session_id, 200);
  const anonymousId = clean(body.anonymous_id, 200);
  if (!phone && !sessionId && !anonymousId) {
    return cors(NextResponse.json({ error: 'phone_or_session_required' }, { status: 400 }));
  }

  const source = clean(body.source, 40) || 'whatsapp';
  const normalizedSource = SOURCE_VALUES.has(source) ? source : 'other';
  const now = new Date().toISOString();
  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = clean(body.event_id, 200) || `kryo_whatsapp_lead_${crypto.randomUUID()}`;
  const eventSourceUrl = clean(body.event_source_url, 500) || clean(body.page_path, 500);
  const sb = svc();

  const insertPayload = {
    source: normalizedSource,
    status: 'new',
    consent_to_follow_up: true,
    consent_captured_at: now,
    phone_e164: phone,
    whatsapp_thread_id: clean(body.whatsapp_thread_id, 255),
    anonymous_id: anonymousId,
    session_id: sessionId,
    first_touch_ts: now,
    last_touch_ts: now,
    channel: clean(body.channel, 80),
    market: clean(body.market, 40),
    device_type: clean(body.device_type, 40),
    meta_campaign_id: clean(body.meta_campaign_id, 120),
    meta_adset_id: clean(body.meta_adset_id, 120),
    meta_ad_id: clean(body.meta_ad_id, 120),
    creative_id: clean(body.creative_id, 120),
    angle_id: clean(body.angle_id, 120),
    hook_id: clean(body.hook_id, 120),
    landing_page_version: clean(body.landing_page_version, 120),
    experiment_id: clean(body.experiment_id, 80),
    experiment_key: clean(body.experiment_key, 160),
    objection_primary: clean(body.objection_primary, 160),
    qualification_notes: clean(body.qualification_notes, MAX_TEXT),
    raw_payload: {
      page_path: clean(body.page_path, 500),
      utm_source: clean(body.utm_source, 120),
      utm_medium: clean(body.utm_medium, 120),
      utm_campaign: clean(body.utm_campaign, 200),
      utm_content: clean(body.utm_content, 200),
      utm_term: clean(body.utm_term, 200),
      fbp: clean(body.fbp, 200),
      fbc: clean(body.fbc, 200),
      fbclid: clean(body.fbclid, 500),
      meta_capi_event_name: 'Lead',
      meta_capi_event_id: eventId,
      event_source_url: eventSourceUrl,
      user_agent: clean(request.headers.get('user-agent'), 500),
      ip_country: clean(request.headers.get('x-vercel-ip-country'), 20),
      raw_payload: body.raw_payload ?? null,
    },
  };

  const { data, error } = await sb
    .from('kryo_leads')
    .insert(insertPayload)
    .select('id,status,created_at')
    .single();

  if (error) {
    const missingTable = /kryo_leads|schema cache|does not exist/i.test(error.message);
    console.error('kryo lead capture failed:', error.message);
    return cors(NextResponse.json({
      error: missingTable ? 'measurement_spine_not_ready' : 'insert_failed',
      message: missingTable ? 'Lead table is not available yet.' : 'Could not record lead.',
    }, { status: missingTable ? 503 : 500 }));
  }

  const metaCapi = await sendMetaLeadEvent({
    eventId,
    eventTime,
    phone,
    fbp: clean(body.fbp, 200),
    fbc: clean(body.fbc, 200),
    eventSourceUrl,
    clientUserAgent: clean(request.headers.get('user-agent'), 500),
    clientIpAddress: clean(request.headers.get('x-forwarded-for'), 80),
    campaignId: clean(body.meta_campaign_id, 120),
    adsetId: clean(body.meta_adset_id, 120),
    adId: clean(body.meta_ad_id, 120),
    experimentKey: clean(body.experiment_key, 160),
    landingPageVersion: clean(body.landing_page_version, 120),
  });

  return cors(NextResponse.json({
    success: true,
    lead_id: data.id,
    status: data.status,
    created_at: data.created_at,
    meta_capi: { attempted: metaCapi.attempted, ok: metaCapi.ok, status: metaCapi.status },
  }));
}


export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
