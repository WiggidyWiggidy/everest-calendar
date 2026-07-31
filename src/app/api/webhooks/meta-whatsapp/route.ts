import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

type JsonRecord = Record<string, unknown>;

function clean(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function phoneFromWaId(value: unknown): string | null {
  const raw = clean(value, 32);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

function isoFromUnixSeconds(value: unknown): string | null {
  const numeric = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(numeric)) return null;
  return new Date(numeric * 1000).toISOString();
}

function verifySignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return process.env.NODE_ENV !== 'production';
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function findOrCreateLead(params: {
  phone: string | null;
  waId: string | null;
  rawPayload: JsonRecord;
}) {
  const supabase = createServiceClient();
  if (!params.phone) return null;

  const { data: existingLead } = await supabase
    .from('kryo_leads')
    .select('id,experiment_id,experiment_key,landing_page_version,angle_id,hook_id,consent_to_follow_up,status')
    .eq('phone_e164', params.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLead?.id) return existingLead;

  const now = new Date().toISOString();
  const { data: newLead, error } = await supabase
    .from('kryo_leads')
    .insert({
      source: 'whatsapp',
      status: 'new',
      phone_e164: params.phone,
      whatsapp_thread_id: params.waId,
      first_touch_ts: now,
      last_touch_ts: now,
      qualification_notes: 'Inbound WhatsApp message. Do not use for marketing templates unless explicit opt-in exists.',
      raw_payload: {
        source: 'meta_whatsapp_webhook',
        ...params.rawPayload,
      },
    })
    .select('id,experiment_id,experiment_key,landing_page_version,angle_id,hook_id,consent_to_follow_up,status')
    .single();

  if (error) {
    console.error('meta-whatsapp lead insert failed:', error.message);
    return null;
  }

  return newLead;
}

async function findOrCreateConversation(params: {
  lead: JsonRecord | null;
  phone: string | null;
  waId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  messageAt: string | null;
  rawPayload: JsonRecord;
}) {
  const supabase = createServiceClient();
  const leadId = typeof params.lead?.id === 'string' ? params.lead.id : null;
  const serviceWindowExpiresAt = params.messageAt
    ? new Date(new Date(params.messageAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  let query = supabase
    .from('kryo_whatsapp_conversations')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (params.phoneNumberId && params.waId) {
    query = query.eq('meta_phone_number_id', params.phoneNumberId).eq('wa_id', params.waId);
  } else if (params.phone) {
    query = query.eq('phone_e164', params.phone);
  } else if (leadId) {
    query = query.eq('lead_id', leadId);
  } else {
    return null;
  }

  const { data: existing } = await query.maybeSingle();

  const payload = {
    lead_id: leadId,
    phone_e164: params.phone,
    wa_id: params.waId,
    meta_phone_number_id: params.phoneNumberId,
    meta_waba_id: params.wabaId,
    display_phone_number: params.displayPhoneNumber,
    status: serviceWindowExpiresAt ? 'service_window_open' : 'open',
    last_message_at: params.messageAt,
    service_window_expires_at: serviceWindowExpiresAt,
    experiment_id: typeof params.lead?.experiment_id === 'string' ? params.lead.experiment_id : null,
    experiment_key: clean(params.lead?.experiment_key, 160),
    landing_page_version: clean(params.lead?.landing_page_version, 120),
    angle_id: clean(params.lead?.angle_id, 120),
    hook_id: clean(params.lead?.hook_id, 120),
    raw_payload: params.rawPayload,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('kryo_whatsapp_conversations')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) {
      console.error('meta-whatsapp conversation update failed:', error.message);
      return null;
    }
    return data;
  }

  const { data, error } = await supabase
    .from('kryo_whatsapp_conversations')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('meta-whatsapp conversation insert failed:', error.message);
    return null;
  }
  return data;
}

function messageText(message: JsonRecord): string | null {
  if (message.text && typeof message.text === 'object') return clean((message.text as JsonRecord).body, 4000);
  if (message.button && typeof message.button === 'object') return clean((message.button as JsonRecord).text, 1000);
  if (message.interactive && typeof message.interactive === 'object') {
    const interactive = message.interactive as JsonRecord;
    const buttonReply = interactive.button_reply as JsonRecord | undefined;
    const listReply = interactive.list_reply as JsonRecord | undefined;
    return clean(buttonReply?.title || listReply?.title, 1000);
  }
  return null;
}

function buttonPayload(message: JsonRecord): string | null {
  if (message.button && typeof message.button === 'object') return clean((message.button as JsonRecord).payload, 1000);
  if (message.interactive && typeof message.interactive === 'object') {
    const interactive = message.interactive as JsonRecord;
    const buttonReply = interactive.button_reply as JsonRecord | undefined;
    const listReply = interactive.list_reply as JsonRecord | undefined;
    return clean(buttonReply?.id || listReply?.id, 1000);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let body: JsonRecord;
  try {
    body = JSON.parse(rawBody) as JsonRecord;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const supabase = createServiceClient();
  let processedMessages = 0;
  let processedStatuses = 0;
  const entries = Array.isArray(body.entry) ? body.entry as JsonRecord[] : [];

  for (const entry of entries) {
    const wabaId = clean(entry.id, 80);
    const changes = Array.isArray(entry.changes) ? entry.changes as JsonRecord[] : [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = (change.value && typeof change.value === 'object' ? change.value : {}) as JsonRecord;
      const metadata = (value.metadata && typeof value.metadata === 'object' ? value.metadata : {}) as JsonRecord;
      const phoneNumberId = clean(metadata.phone_number_id, 80);
      const displayPhoneNumber = clean(metadata.display_phone_number, 80);
      const messages = Array.isArray(value.messages) ? value.messages as JsonRecord[] : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses as JsonRecord[] : [];

      for (const message of messages) {
        const waId = clean(message.from, 32);
        const phone = phoneFromWaId(waId);
        const receivedAt = isoFromUnixSeconds(message.timestamp) || new Date().toISOString();
        const lead = await findOrCreateLead({ phone, waId, rawPayload: { entry_id: wabaId } });
        const conversation = await findOrCreateConversation({
          lead,
          phone,
          waId,
          phoneNumberId,
          displayPhoneNumber,
          wabaId,
          messageAt: receivedAt,
          rawPayload: { entry_id: wabaId, metadata },
        });

        const { error } = await supabase
          .from('kryo_whatsapp_messages')
          .insert({
            conversation_id: conversation?.id || null,
            lead_id: typeof lead?.id === 'string' ? lead.id : null,
            direction: 'inbound',
            meta_message_id: clean(message.id, 255),
            wa_id: waId,
            phone_e164: phone,
            message_type: clean(message.type, 80),
            body: messageText(message),
            button_payload: buttonPayload(message),
            received_at: receivedAt,
            raw_payload: message,
          });

        if (error && !/duplicate key/i.test(error.message)) {
          console.error('meta-whatsapp message insert failed:', error.message);
        } else {
          processedMessages++;
        }
      }

      for (const statusEvent of statuses) {
        const metaMessageId = clean(statusEvent.id, 255);
        const status = clean(statusEvent.status, 80);
        const recipientId = clean(statusEvent.recipient_id, 32);
        const phone = phoneFromWaId(recipientId);
        const statusAt = isoFromUnixSeconds(statusEvent.timestamp) || new Date().toISOString();

        const { data: existingMessage } = metaMessageId
          ? await supabase
              .from('kryo_whatsapp_messages')
              .select('id,conversation_id,lead_id')
              .eq('meta_message_id', metaMessageId)
              .maybeSingle()
          : { data: null };

        if (existingMessage?.id) {
          await supabase
            .from('kryo_whatsapp_messages')
            .update({ status, raw_payload: statusEvent })
            .eq('id', existingMessage.id);
        } else {
          await supabase
            .from('kryo_whatsapp_messages')
            .insert({
              conversation_id: existingMessage?.conversation_id || null,
              lead_id: existingMessage?.lead_id || null,
              direction: 'status',
              meta_message_id: metaMessageId,
              wa_id: recipientId,
              phone_e164: phone,
              status,
              received_at: statusAt,
              raw_payload: statusEvent,
            });
        }
        processedStatuses++;
      }
    }
  }

  return NextResponse.json({ success: true, processed_messages: processedMessages, processed_statuses: processedStatuses });
}
