-- KRYO WhatsApp Cloud API conversation logging.
-- Purpose: connect Meta WhatsApp Business Platform webhooks and outbound template sends
-- to the canonical KRYO lead/deposit measurement spine.

CREATE TABLE IF NOT EXISTS public.kryo_whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lead_id uuid REFERENCES public.kryo_leads(id) ON DELETE SET NULL,
  phone_e164 text,
  wa_id text,
  meta_phone_number_id text,
  meta_waba_id text,
  display_phone_number text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','service_window_open','needs_template','closed','blocked','opted_out')),
  last_message_at timestamptz,
  service_window_expires_at timestamptz,
  experiment_id uuid REFERENCES public.kryo_growth_experiments(id) ON DELETE SET NULL,
  experiment_key text,
  landing_page_version text,
  angle_id text,
  hook_id text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.kryo_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  conversation_id uuid REFERENCES public.kryo_whatsapp_conversations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.kryo_leads(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','status')),
  meta_message_id text,
  wa_id text,
  phone_e164 text,
  message_type text,
  body text,
  template_name text,
  button_payload text,
  status text,
  sent_at timestamptz,
  received_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kryo_whatsapp_conversations_phone_unique
  ON public.kryo_whatsapp_conversations(meta_phone_number_id, wa_id)
  WHERE meta_phone_number_id IS NOT NULL AND wa_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kryo_whatsapp_messages_meta_message_unique
  ON public.kryo_whatsapp_messages(meta_message_id)
  WHERE meta_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kryo_whatsapp_conversations_lead
  ON public.kryo_whatsapp_conversations(lead_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_kryo_whatsapp_messages_conversation
  ON public.kryo_whatsapp_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kryo_whatsapp_messages_status
  ON public.kryo_whatsapp_messages(status, created_at DESC);

CREATE OR REPLACE VIEW public.vw_kryo_whatsapp_daily AS
SELECT
  date_trunc('day', COALESCE(m.received_at, m.sent_at, m.created_at))::date AS date,
  COALESCE(c.experiment_key, 'unknown') AS experiment_key,
  COALESCE(c.angle_id, 'unknown') AS angle_id,
  COALESCE(c.hook_id, 'unknown') AS hook_id,
  COALESCE(c.landing_page_version, 'unknown') AS landing_page_version,
  COUNT(*) FILTER (WHERE m.direction = 'inbound') AS inbound_messages,
  COUNT(*) FILTER (WHERE m.direction = 'outbound') AS outbound_messages,
  COUNT(DISTINCT c.id) FILTER (WHERE m.direction = 'inbound') AS inbound_conversations,
  COUNT(DISTINCT c.lead_id) FILTER (WHERE c.lead_id IS NOT NULL) AS linked_leads
FROM public.kryo_whatsapp_messages m
LEFT JOIN public.kryo_whatsapp_conversations c ON c.id = m.conversation_id
GROUP BY 1,2,3,4,5;

COMMENT ON TABLE public.kryo_whatsapp_conversations IS 'Meta WhatsApp Business Platform conversation state linked to KRYO leads.';
COMMENT ON TABLE public.kryo_whatsapp_messages IS 'Inbound, outbound and delivery-status WhatsApp Cloud API messages for KRYO.';
COMMENT ON VIEW public.vw_kryo_whatsapp_daily IS 'Daily WhatsApp conversation telemetry by experiment, angle, hook and LP version.';
