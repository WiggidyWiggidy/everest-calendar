import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

type JsonRecord = Record<string, unknown>;

interface SendTemplateBody {
  lead_id?: string;
  phone_e164?: string;
  template_name: string;
  language_code?: string;
  components?: JsonRecord[];
  dry_run?: boolean;
}

function clean(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizePhone(value: unknown) {
  const raw = clean(value, 32);
  if (!raw) return null;
  const normalized = raw.replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{6,15}$/.test(normalized)) return null;
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

function bearerToken() {
  return process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_CLOUD_API_TOKEN || null;
}

export async function POST(request: NextRequest) {
  if (request.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: SendTemplateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const templateName = clean(body.template_name, 512);
  if (!templateName) return NextResponse.json({ error: 'template_name_required' }, { status: 400 });

  const supabase = createServiceClient();
  let lead: JsonRecord | null = null;
  if (body.lead_id) {
    const { data, error } = await supabase
      .from('kryo_leads')
      .select('id,phone_e164,consent_to_follow_up,status,experiment_id,experiment_key,landing_page_version,angle_id,hook_id')
      .eq('id', body.lead_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'lead_lookup_failed', message: error.message }, { status: 500 });
    lead = data;
  }

  const phone = normalizePhone(lead?.phone_e164 || body.phone_e164);
  if (!phone) return NextResponse.json({ error: 'valid_phone_required' }, { status: 400 });
  if (lead && lead.status === 'do_not_follow_up') return NextResponse.json({ error: 'lead_opted_out' }, { status: 409 });
  if (lead && lead.consent_to_follow_up !== true) {
    return NextResponse.json({ error: 'follow_up_consent_required' }, { status: 409 });
  }

  const token = bearerToken();
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return NextResponse.json({ error: 'whatsapp_cloud_api_not_configured' }, { status: 503 });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: clean(body.language_code, 20) || 'en' },
      ...(Array.isArray(body.components) ? { components: body.components } : {}),
    },
  };

  if (body.dry_run) {
    return NextResponse.json({ success: true, dry_run: true, payload });
  }

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: 'whatsapp_send_failed', meta_response: responseBody }, { status: 502 });
  }

  const metaMessageId = responseBody?.messages?.[0]?.id || null;
  const { data: conversation } = await supabase
    .from('kryo_whatsapp_conversations')
    .select('id')
    .eq('phone_e164', phone)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from('kryo_whatsapp_messages')
    .insert({
      conversation_id: conversation?.id || null,
      lead_id: typeof lead?.id === 'string' ? lead.id : null,
      direction: 'outbound',
      meta_message_id: metaMessageId,
      phone_e164: phone,
      message_type: 'template',
      template_name: templateName,
      status: 'sent_to_meta',
      sent_at: new Date().toISOString(),
      raw_payload: { request: payload, response: responseBody },
    });

  return NextResponse.json({ success: true, meta_message_id: metaMessageId, meta_response: responseBody });
}
