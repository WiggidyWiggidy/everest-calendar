-- KRYO measurement spine: lead/deposit lifecycle and experiment linkage.
-- Repository migration only until applied through normal reviewed DB process.
-- Purpose: connect ad -> creative -> landing-page -> WhatsApp lead -> deposit -> checkout/purchase.

CREATE TABLE IF NOT EXISTS public.kryo_growth_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','running','paused','completed','reverted','invalid','tracking_failure','inconclusive')),
  owner text,
  date_proposed date NOT NULL DEFAULT CURRENT_DATE,
  date_started date,
  date_ended date,
  funnel_problem text NOT NULL,
  supporting_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_belief_or_objection text,
  hypothesis text NOT NULL,
  variable_changed text NOT NULL,
  control_version text,
  treatment_version text,
  target_audience text,
  traffic_source text,
  primary_metric text NOT NULL,
  secondary_metrics text[] NOT NULL DEFAULT '{}',
  guardrail_metrics text[] NOT NULL DEFAULT '{}',
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_result text,
  actual_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_quality_status text NOT NULL DEFAULT 'unknown' CHECK (data_quality_status IN ('unknown','healthy','partial','stale','blocked','tracking_failure')),
  decision text CHECK (decision IN ('keep','revert','iterate','continue_collecting_data','inconclusive','tracking_failure','invalid_experiment')),
  learning text,
  follow_up_action text,
  related_pr text,
  landing_page_version text,
  ad_ids text[] NOT NULL DEFAULT '{}',
  creative_ids text[] NOT NULL DEFAULT '{}',
  angle_id text,
  hook_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kryo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp','shopify_inbox','chatway','manual','other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','unqualified','deposit_offered','deposit_paid','closed_won','closed_lost','do_not_follow_up')),
  consent_to_follow_up boolean,
  consent_captured_at timestamptz,
  phone_e164 text,
  whatsapp_thread_id text,
  shopify_customer_id text,
  anonymous_id text,
  session_id text,
  first_touch_ts timestamptz,
  last_touch_ts timestamptz,
  channel text,
  market text,
  device_type text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  creative_id text,
  angle_id text,
  hook_id text,
  landing_page_version text,
  experiment_id uuid REFERENCES public.kryo_growth_experiments(id) ON DELETE SET NULL,
  experiment_key text,
  objection_primary text,
  qualification_notes text,
  lost_reason text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.kryo_deposit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lead_id uuid REFERENCES public.kryo_leads(id) ON DELETE SET NULL,
  experiment_id uuid REFERENCES public.kryo_growth_experiments(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('deposit_link_sent','deposit_initiated','deposit_completed','deposit_refunded','deposit_applied_to_order','deposit_expired')),
  amount numeric(12,2),
  currency text NOT NULL DEFAULT 'AED',
  payment_provider text,
  payment_reference text,
  shopify_draft_order_id text,
  shopify_order_id text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  landing_page_version text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_kryo_leads_status_created ON public.kryo_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kryo_leads_experiment ON public.kryo_leads(experiment_id, status);
CREATE INDEX IF NOT EXISTS idx_kryo_leads_meta_ad ON public.kryo_leads(meta_ad_id) WHERE meta_ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kryo_deposit_events_lead ON public.kryo_deposit_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kryo_deposit_events_type ON public.kryo_deposit_events(event_type, created_at DESC);

CREATE OR REPLACE VIEW public.vw_kryo_growth_spine_daily AS
SELECT
  date_trunc('day', l.created_at)::date AS date,
  COALESCE(l.experiment_key, e.experiment_key, 'unknown') AS experiment_key,
  COALESCE(l.angle_id, 'unknown') AS angle_id,
  COALESCE(l.hook_id, 'unknown') AS hook_id,
  COALESCE(l.landing_page_version, 'unknown') AS landing_page_version,
  COUNT(*) AS leads,
  COUNT(*) FILTER (WHERE l.status IN ('qualified','deposit_offered','deposit_paid','closed_won')) AS qualified_leads,
  COUNT(*) FILTER (WHERE l.status = 'closed_won') AS closed_won_leads,
  COUNT(d.*) FILTER (WHERE d.event_type = 'deposit_link_sent') AS deposit_links_sent,
  COUNT(d.*) FILTER (WHERE d.event_type = 'deposit_initiated') AS deposits_initiated,
  COUNT(d.*) FILTER (WHERE d.event_type = 'deposit_completed') AS deposits_completed,
  COALESCE(SUM(d.amount) FILTER (WHERE d.event_type = 'deposit_completed'), 0) AS deposit_revenue
FROM public.kryo_leads l
LEFT JOIN public.kryo_growth_experiments e ON e.id = l.experiment_id
LEFT JOIN public.kryo_deposit_events d ON d.lead_id = l.id
GROUP BY 1,2,3,4,5;

COMMENT ON TABLE public.kryo_growth_experiments IS 'Canonical KRYO experiment ledger for approved growth tests.';
COMMENT ON TABLE public.kryo_leads IS 'WhatsApp/chat lead lifecycle joined to marketing identifiers where available.';
COMMENT ON TABLE public.kryo_deposit_events IS 'Refundable deposit lifecycle events joined to leads, experiments and ads.';
COMMENT ON VIEW public.vw_kryo_growth_spine_daily IS 'Daily measurement spine for lead/deposit outcomes by experiment, angle, hook and LP version.';
