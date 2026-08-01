-- KRYO UAE analytics operating system v2
-- DB-first canonical layer for scheduler-aware, low-cost-queryable marketing analytics.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Metric / exclusion / identity / benchmark contracts ---------------------

CREATE TABLE IF NOT EXISTS public.analytics_metric_dictionary (
  metric_key text PRIMARY KEY,
  display_name text NOT NULL,
  owner_system text NOT NULL CHECK (owner_system IN ('ga4','meta','shopify','first_party','gsc','derived')),
  numerator text,
  denominator text,
  scope text NOT NULL DEFAULT 'kryo_uae',
  definition_note text,
  default_market text NOT NULL DEFAULT 'AE',
  is_canonical boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_exclusion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  rule_type text NOT NULL CHECK (rule_type IN ('country','field_equals','field_in','user_agent_regex','referrer_regex','identity_registry')),
  field_name text,
  operator text NOT NULL DEFAULT 'eq',
  value_text text,
  value_json jsonb,
  reason_code text NOT NULL,
  applies_to_scope text NOT NULL DEFAULT 'canonical_reporting',
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_identity_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_type text NOT NULL CHECK (identity_type IN ('session_id','anonymous_id','cookie','user_agent_regex','ip_country_region','custom')),
  identity_value text NOT NULL,
  market text,
  label text NOT NULL,
  exclusion_reason text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_type, identity_value)
);

CREATE TABLE IF NOT EXISTS public.benchmark_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  segment text NOT NULL,
  market text NOT NULL DEFAULT 'AE',
  benchmark_low numeric,
  benchmark_mid numeric,
  benchmark_high numeric,
  source_name text NOT NULL,
  source_url text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_key, segment, market, source_name)
);

CREATE TABLE IF NOT EXISTS public.analytics_job_registry (
  job_key text PRIMARY KEY,
  job_label text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('sentinel','hot','cold','backfill')),
  scheduler_source text NOT NULL CHECK (scheduler_source IN ('launchd','vercel_daily','manual')),
  expected_interval_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL REFERENCES public.analytics_job_registry(job_key) ON DELETE CASCADE,
  lane text NOT NULL CHECK (lane IN ('sentinel','hot','cold','backfill')),
  scheduler_source text NOT NULL CHECK (scheduler_source IN ('launchd','vercel_daily','manual')),
  status text NOT NULL CHECK (status IN ('started','success','warning','failed','skipped')),
  requested_mode text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  stale_gap_minutes integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_job_runs_job_started
  ON public.analytics_job_runs (job_key, started_at DESC);

-- 2. Canonical marts ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kryo_uae_hourly_fact (
  row_key text PRIMARY KEY,
  report_hour timestamptz NOT NULL,
  report_date date NOT NULL,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  total_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  returning_users integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  ga4_add_to_cart_events integer NOT NULL DEFAULT 0,
  ga4_checkout_events integer NOT NULL DEFAULT 0,
  ga4_purchase_events integer NOT NULL DEFAULT 0,
  purchase_revenue numeric NOT NULL DEFAULT 0,
  excluded_sessions integer NOT NULL DEFAULT 0,
  source_mix jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_source_mix jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_landing_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust_state text NOT NULL DEFAULT 'partial' CHECK (trust_state IN ('fresh','degraded','stale','partial')),
  stale_reason text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kryo_uae_hourly_fact_hour
  ON public.kryo_uae_hourly_fact (report_hour DESC);

CREATE TABLE IF NOT EXISTS public.kryo_uae_daily_fact (
  report_date date PRIMARY KEY,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  total_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  returning_users integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  ga4_add_to_cart_events integer NOT NULL DEFAULT 0,
  ga4_checkout_events integer NOT NULL DEFAULT 0,
  ga4_purchase_events integer NOT NULL DEFAULT 0,
  purchase_revenue numeric NOT NULL DEFAULT 0,
  excluded_sessions integer NOT NULL DEFAULT 0,
  source_mix jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_source_mix jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_landing_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust_state text NOT NULL DEFAULT 'partial' CHECK (trust_state IN ('fresh','degraded','stale','partial')),
  stale_reason text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kryo_funnel_daily (
  report_date date NOT NULL,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  meta_website_add_to_carts integer NOT NULL DEFAULT 0,
  ga4_add_to_cart_events integer NOT NULL DEFAULT 0,
  primary_kryo_atc_users integer NOT NULL DEFAULT 0,
  primary_kryo_atc_events integer NOT NULL DEFAULT 0,
  bonus_atc_users integer NOT NULL DEFAULT 0,
  bonus_atc_events integer NOT NULL DEFAULT 0,
  ga4_checkout_events integer NOT NULL DEFAULT 0,
  ga4_purchase_events integer NOT NULL DEFAULT 0,
  shopify_orders integer NOT NULL DEFAULT 0,
  shopify_revenue numeric NOT NULL DEFAULT 0,
  trust_state text NOT NULL DEFAULT 'partial' CHECK (trust_state IN ('fresh','degraded','stale','partial')),
  stale_reason text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_date, market, product_handle)
);

CREATE TABLE IF NOT EXISTS public.kryo_return_paths_daily (
  report_date date NOT NULL,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  first_touch_campaign text,
  first_touch_ad text,
  return_source text,
  return_landing_page text,
  pages_after_return jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_user_count integer NOT NULL DEFAULT 0,
  returning_sessions integer NOT NULL DEFAULT 0,
  median_hours_to_first_return numeric,
  return_count_bucket text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_date, market, product_handle, first_touch_campaign, first_touch_ad, return_source, return_landing_page, return_count_bucket)
);

CREATE TABLE IF NOT EXISTS public.kryo_search_daily (
  report_date date NOT NULL,
  query text NOT NULL,
  page text NOT NULL,
  country text,
  device text,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric,
  avg_position numeric,
  query_group text NOT NULL,
  product_handle text NOT NULL DEFAULT 'kryo2',
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_date, query, page, country, device, product_handle)
);

CREATE TABLE IF NOT EXISTS public.analytics_reconciliation_daily (
  report_date date NOT NULL,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  metric_key text NOT NULL,
  lhs_source text NOT NULL,
  rhs_source text NOT NULL,
  lhs_value numeric,
  rhs_value numeric,
  delta_abs numeric,
  delta_pct numeric,
  threshold_pct numeric,
  status text NOT NULL CHECK (status IN ('ok','warning','breach','insufficient_data')),
  notes text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_date, market, product_handle, metric_key, lhs_source, rhs_source)
);

CREATE TABLE IF NOT EXISTS public.analytics_change_impact_daily (
  report_date date NOT NULL,
  change_log_id uuid NOT NULL,
  metric_key text NOT NULL,
  baseline_value numeric,
  current_value numeric,
  delta_abs numeric,
  delta_pct numeric,
  lookback_days integer NOT NULL DEFAULT 5,
  notes text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_date, change_log_id, metric_key)
);

CREATE TABLE IF NOT EXISTS public.experiment_readouts_daily (
  report_date date NOT NULL,
  experiment_id uuid NOT NULL,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  primary_metric_key text,
  baseline_value numeric,
  current_value numeric,
  lift_pct numeric,
  sample_sessions integer,
  sample_users integer,
  readout_status text NOT NULL CHECK (readout_status IN ('continue','ready_to_decide','winner','loser','inconclusive','insufficient_data')),
  verdict_due_at timestamptz,
  notes text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_date, experiment_id)
);

CREATE TABLE IF NOT EXISTS public.kryo_operator_snapshot_current (
  snapshot_key text PRIMARY KEY,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  payload jsonb NOT NULL,
  trust_state text NOT NULL DEFAULT 'partial' CHECK (trust_state IN ('fresh','degraded','stale','partial')),
  stale_reason text,
  scheduler_source text NOT NULL DEFAULT 'launchd' CHECK (scheduler_source IN ('launchd','vercel_daily','manual')),
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kryo_operator_snapshot_daily (
  snapshot_date date PRIMARY KEY,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  payload jsonb NOT NULL,
  trust_state text NOT NULL DEFAULT 'partial' CHECK (trust_state IN ('fresh','degraded','stale','partial')),
  stale_reason text,
  scheduler_source text NOT NULL DEFAULT 'vercel_daily' CHECK (scheduler_source IN ('launchd','vercel_daily','manual')),
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Change logging / experiments -------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketing_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'scheduled_agent',
  source text NOT NULL,
  surface text NOT NULL,
  object_type text NOT NULL,
  object_id text,
  object_name text,
  market text NOT NULL DEFAULT 'AE',
  product_handle text NOT NULL DEFAULT 'kryo2',
  change_type text NOT NULL,
  before_payload jsonb,
  after_payload jsonb,
  note text,
  experiment_id uuid,
  auto_logged boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_experiments
  ADD COLUMN IF NOT EXISTS market text DEFAULT 'AE',
  ADD COLUMN IF NOT EXISTS product_handle text DEFAULT 'kryo2',
  ADD COLUMN IF NOT EXISTS experiment_scope text DEFAULT 'kryo_uae',
  ADD COLUMN IF NOT EXISTS primary_metric_key text,
  ADD COLUMN IF NOT EXISTS guardrail_metric_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS planned_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS minimum_sample_sessions integer,
  ADD COLUMN IF NOT EXISTS minimum_sample_users integer,
  ADD COLUMN IF NOT EXISTS priority_rank integer,
  ADD COLUMN IF NOT EXISTS linked_change_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ice_score_frozen numeric,
  ADD COLUMN IF NOT EXISTS status_reason text;

-- 4. Seed contracts ----------------------------------------------------------

INSERT INTO public.analytics_job_registry (job_key, job_label, lane, scheduler_source, expected_interval_minutes, metadata)
VALUES
  ('kryo_analytics_sentinel', 'KRYO analytics sentinel', 'sentinel', 'launchd', 15, '{"market":"AE","product_handle":"kryo2"}'),
  ('kryo_analytics_hot', 'KRYO analytics hot sync', 'hot', 'launchd', 60, '{"market":"AE","product_handle":"kryo2"}'),
  ('kryo_analytics_cold', 'KRYO analytics cold sync', 'cold', 'vercel_daily', 1440, '{"market":"AE","product_handle":"kryo2"}')
ON CONFLICT (job_key) DO UPDATE SET
  job_label = EXCLUDED.job_label,
  lane = EXCLUDED.lane,
  scheduler_source = EXCLUDED.scheduler_source,
  expected_interval_minutes = EXCLUDED.expected_interval_minutes,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.analytics_metric_dictionary (metric_key, display_name, owner_system, numerator, denominator, definition_note)
VALUES
  ('meta_ctr_all', 'Meta CTR (all)', 'meta', 'clicks_all', 'impressions', 'Meta Ads Manager CTR(all) definition.'),
  ('meta_outbound_ctr', 'Meta outbound CTR', 'meta', 'outbound_clicks', 'impressions', 'Outbound clicks divided by impressions.'),
  ('meta_website_add_to_carts', 'Meta website ATC', 'meta', 'website_add_to_carts', NULL, 'Meta website add-to-cart action count.'),
  ('ga4_add_to_cart_events', 'GA4 add to cart events', 'ga4', 'addToCarts', NULL, 'GA4 addToCarts event count.'),
  ('primary_kryo_atc_users', 'Primary KRYO ATC users', 'first_party', 'unique users adding main KRYO product', 'clean users', 'Canonical unique-user KRYO intent metric.'),
  ('site_session_conversion_rate', 'Site session conversion rate', 'derived', 'orders', 'clean sessions', 'Shopify orders divided by clean sessions.'),
  ('returning_user_rate', 'Returning user rate', 'ga4', 'returning users', 'clean users', 'Returning users divided by total clean users.'),
  ('checkout_completion_rate', 'Checkout completion rate', 'derived', 'purchases', 'checkouts', 'Purchases divided by checkouts.'),
  ('blended_roas', 'Blended ROAS', 'derived', 'shopify revenue', 'meta spend', 'Shopify revenue divided by Meta spend over same window.')
ON CONFLICT (metric_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  owner_system = EXCLUDED.owner_system,
  numerator = EXCLUDED.numerator,
  denominator = EXCLUDED.denominator,
  definition_note = EXCLUDED.definition_note,
  updated_at = now();

INSERT INTO public.analytics_exclusion_rules (rule_key, rule_type, field_name, operator, value_text, reason_code, priority)
VALUES
  ('exclude_hk', 'country', 'country', 'eq', 'Hong Kong', 'country_hong_kong', 10),
  ('exclude_cn', 'country', 'country', 'eq', 'China', 'country_china', 11),
  ('exclude_au', 'country', 'country', 'eq', 'Australia', 'country_australia', 12),
  ('exclude_internal_flag', 'field_equals', 'is_internal', 'eq', 'true', 'internal_flag', 20),
  ('exclude_internal_qa', 'field_in', 'traffic_class', 'in', 'internal_qa', 'traffic_class_internal_qa', 21),
  ('exclude_bot', 'field_in', 'traffic_class', 'in', 'bot', 'traffic_class_bot', 22),
  ('exclude_admin_referral', 'referrer_regex', 'referrer', 'regex', 'admin\\.shopify\\.com', 'admin_shopify_referral', 30),
  ('exclude_crawlers', 'user_agent_regex', 'user_agent', 'regex', '(applebot|bingbot|headlesschrome|curl/)', 'crawler_user_agent', 31),
  ('exclude_identity_registry', 'identity_registry', NULL, 'lookup', NULL, 'analytics_identity_registry_match', 40)
ON CONFLICT (rule_key) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  field_name = EXCLUDED.field_name,
  operator = EXCLUDED.operator,
  value_text = EXCLUDED.value_text,
  reason_code = EXCLUDED.reason_code,
  priority = EXCLUDED.priority,
  updated_at = now();

INSERT INTO public.benchmark_registry (metric_key, segment, market, benchmark_low, benchmark_mid, benchmark_high, source_name, source_url, is_primary, notes)
VALUES
  ('meta_ctr_all', 'health_wellness_meta', 'AE', 0.022, 0.027, 0.035, 'Triple Whale Meta benchmarks', 'https://www.triplewhale.com/blog/facebook-ads-benchmarks', false, 'Directional paid-media benchmark.'),
  ('site_session_conversion_rate', 'high_ticket_home_luxury', 'AE', 0.005, 0.010, 0.015, 'Luxury/high-ticket ecommerce blend', 'https://www.shopify.com/blog/retail-conversion-rate', false, 'Directional site benchmark for premium, considered purchases.'),
  ('returning_user_rate', 'ecommerce_returning_visitors', 'AE', 0.15, 0.30, 0.40, 'Shopify returning visitor benchmark', 'https://www.shopify.com/sg/enterprise/blog/returning-ecommerce-visitors', false, 'Directional benchmark only.'),
  ('checkout_completion_rate', 'shopify_checkout', 'AE', 0.33, 0.45, 0.59, 'Littledata checkout benchmark', 'https://www.littledata.io/average-website-performance', false, 'Directional benchmark only.')
ON CONFLICT (metric_key, segment, market, source_name) DO UPDATE SET
  benchmark_low = EXCLUDED.benchmark_low,
  benchmark_mid = EXCLUDED.benchmark_mid,
  benchmark_high = EXCLUDED.benchmark_high,
  source_url = EXCLUDED.source_url,
  is_primary = EXCLUDED.is_primary,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 5. Helper functions / views -----------------------------------------------

CREATE OR REPLACE FUNCTION public.get_latest_analytics_job_status()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH latest AS (
  SELECT DISTINCT ON (job_key)
    job_key, lane, scheduler_source, status, started_at, finished_at, duration_ms, stale_gap_minutes, summary, error_text
  FROM public.analytics_job_runs
  ORDER BY job_key, started_at DESC
)
SELECT jsonb_object_agg(job_key, to_jsonb(latest) - 'job_key') FROM latest;
$$;

CREATE OR REPLACE VIEW public.metric_gap_daily AS
WITH latest_daily AS (
  SELECT report_date, market, product_handle,
         sessions,
         ga4_purchase_events,
         ga4_checkout_events,
         total_users,
         returning_users
  FROM public.kryo_uae_daily_fact
),
metrics AS (
  SELECT report_date, market, product_handle, 'site_session_conversion_rate'::text AS metric_key,
         CASE WHEN sessions > 0 THEN ga4_purchase_events::numeric / sessions ELSE NULL END AS actual_value
  FROM latest_daily
  UNION ALL
  SELECT report_date, market, product_handle, 'returning_user_rate'::text,
         CASE WHEN total_users > 0 THEN returning_users::numeric / total_users ELSE NULL END
  FROM latest_daily
  UNION ALL
  SELECT report_date, market, product_handle, 'checkout_completion_rate'::text,
         CASE WHEN ga4_checkout_events > 0 THEN ga4_purchase_events::numeric / ga4_checkout_events ELSE NULL END
  FROM latest_daily
)
SELECT
  m.report_date,
  m.market,
  m.product_handle,
  m.metric_key,
  m.actual_value,
  b.segment,
  b.benchmark_low,
  b.benchmark_mid,
  b.benchmark_high,
  b.is_primary,
  CASE
    WHEN m.actual_value IS NULL THEN 'insufficient_data'
    WHEN b.benchmark_mid IS NULL THEN 'insufficient_data'
    WHEN m.actual_value < b.benchmark_low THEN 'underperforming'
    WHEN m.actual_value > b.benchmark_high THEN 'outperforming'
    ELSE 'in_range'
  END AS performance_state,
  CASE WHEN b.benchmark_mid IS NOT NULL THEN m.actual_value - b.benchmark_mid ELSE NULL END AS gap_abs,
  CASE WHEN b.benchmark_mid IS NOT NULL AND b.benchmark_mid <> 0 THEN (m.actual_value - b.benchmark_mid) / b.benchmark_mid ELSE NULL END AS gap_pct,
  CASE WHEN b.is_primary THEN 'internal_primary' ELSE 'external_directional' END AS benchmark_type
FROM metrics m
LEFT JOIN public.benchmark_registry b
  ON b.metric_key = m.metric_key
 AND b.market = m.market;

CREATE OR REPLACE VIEW public.testing_schedule_view AS
SELECT
  e.id AS experiment_id,
  e.name,
  e.status,
  COALESCE(e.primary_metric_key, e.primary_metric, e.target_metric) AS primary_metric_key,
  e.market,
  e.product_handle,
  e.priority_rank,
  e.ice_score_frozen,
  e.expected_lift_pct,
  e.planned_start_at,
  e.actual_start_at,
  e.decision_due_at,
  e.minimum_sample_sessions,
  e.minimum_sample_users,
  e.status_reason,
  r.report_date AS latest_readout_date,
  r.current_value,
  r.lift_pct,
  r.sample_sessions,
  r.sample_users,
  r.readout_status,
  r.verdict_due_at
FROM public.marketing_experiments e
LEFT JOIN LATERAL (
  SELECT *
  FROM public.experiment_readouts_daily r
  WHERE r.experiment_id = e.id
  ORDER BY r.report_date DESC
  LIMIT 1
) r ON true
WHERE COALESCE(e.market, 'AE') = 'AE'
  AND COALESCE(e.product_handle, 'kryo2') = 'kryo2'
ORDER BY COALESCE(e.priority_rank, 999999), COALESCE(e.decision_due_at, e.created_at);

CREATE OR REPLACE FUNCTION public.record_change_impact(
  p_change_log_id uuid,
  p_metric_key text,
  p_baseline_value numeric,
  p_current_value numeric,
  p_lookback_days integer DEFAULT 5,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.analytics_change_impact_daily (
    report_date, change_log_id, metric_key, baseline_value, current_value,
    delta_abs, delta_pct, lookback_days, notes, synced_at
  ) VALUES (
    CURRENT_DATE,
    p_change_log_id,
    p_metric_key,
    p_baseline_value,
    p_current_value,
    p_current_value - p_baseline_value,
    CASE WHEN p_baseline_value IS NULL OR p_baseline_value = 0 THEN NULL ELSE (p_current_value - p_baseline_value) / p_baseline_value END,
    p_lookback_days,
    p_notes,
    now()
  )
  ON CONFLICT (report_date, change_log_id, metric_key)
  DO UPDATE SET
    baseline_value = EXCLUDED.baseline_value,
    current_value = EXCLUDED.current_value,
    delta_abs = EXCLUDED.delta_abs,
    delta_pct = EXCLUDED.delta_pct,
    lookback_days = EXCLUDED.lookback_days,
    notes = EXCLUDED.notes,
    synced_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.judge_experiment_outcomes(p_report_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.experiment_readouts_daily (
    report_date, experiment_id, market, product_handle, primary_metric_key,
    baseline_value, current_value, lift_pct, sample_sessions, sample_users,
    readout_status, verdict_due_at, notes, synced_at
  )
  SELECT
    p_report_date,
    e.id,
    COALESCE(e.market, 'AE'),
    COALESCE(e.product_handle, 'kryo2'),
    COALESCE(e.primary_metric_key, e.primary_metric, e.target_metric),
    e.baseline_value,
    e.result_value,
    CASE WHEN e.baseline_value IS NULL OR e.baseline_value = 0 OR e.result_value IS NULL THEN NULL ELSE (e.result_value - e.baseline_value) / e.baseline_value END,
    e.minimum_sample_sessions,
    e.minimum_sample_users,
    CASE
      WHEN e.status = 'completed' AND e.result = 'winner' THEN 'winner'
      WHEN e.status = 'completed' AND e.result = 'loser' THEN 'loser'
      WHEN e.status = 'completed' THEN 'inconclusive'
      WHEN e.status = 'running' AND e.decision_due_at IS NOT NULL AND e.decision_due_at <= now() THEN 'ready_to_decide'
      WHEN e.status = 'running' THEN 'continue'
      ELSE 'insufficient_data'
    END,
    e.decision_due_at,
    e.notes,
    now()
  FROM public.marketing_experiments e
  WHERE COALESCE(e.market, 'AE') = 'AE'
    AND COALESCE(e.product_handle, 'kryo2') = 'kryo2'
  ON CONFLICT (report_date, experiment_id)
  DO UPDATE SET
    market = EXCLUDED.market,
    product_handle = EXCLUDED.product_handle,
    primary_metric_key = EXCLUDED.primary_metric_key,
    baseline_value = EXCLUDED.baseline_value,
    current_value = EXCLUDED.current_value,
    lift_pct = EXCLUDED.lift_pct,
    sample_sessions = EXCLUDED.sample_sessions,
    sample_users = EXCLUDED.sample_users,
    readout_status = EXCLUDED.readout_status,
    verdict_due_at = EXCLUDED.verdict_due_at,
    notes = EXCLUDED.notes,
    synced_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('report_date', p_report_date, 'rows_upserted', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_kryo_test_board(
  p_market text DEFAULT 'AE',
  p_product_handle text DEFAULT 'kryo2'
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
SELECT jsonb_build_object(
  'generated_at', now(),
  'market', p_market,
  'product_handle', p_product_handle,
  'running_experiments', COALESCE((
    SELECT jsonb_agg(to_jsonb(t))
    FROM (
      SELECT * FROM public.testing_schedule_view
      WHERE market = p_market AND product_handle = p_product_handle AND status = 'running'
      ORDER BY COALESCE(priority_rank, 999999), COALESCE(decision_due_at, now())
      LIMIT 20
    ) t
  ), '[]'::jsonb),
  'next_recommended_tests', COALESCE((
    SELECT jsonb_agg(to_jsonb(g))
    FROM (
      SELECT *
      FROM public.metric_gap_daily
      WHERE market = p_market AND product_handle = p_product_handle
      ORDER BY performance_state = 'underperforming' DESC, ABS(COALESCE(gap_pct, 0)) DESC
      LIMIT 5
    ) g
  ), '[]'::jsonb),
  'recent_readouts', COALESCE((
    SELECT jsonb_agg(to_jsonb(r))
    FROM (
      SELECT *
      FROM public.experiment_readouts_daily
      WHERE market = p_market AND product_handle = p_product_handle
      ORDER BY report_date DESC
      LIMIT 20
    ) r
  ), '[]'::jsonb)
);
$$;



CREATE OR REPLACE FUNCTION public.get_kryo_operator_packet(
  p_window_days integer DEFAULT 5,
  p_compare_days integer DEFAULT 5,
  p_market text DEFAULT 'AE',
  p_product_handle text DEFAULT 'kryo2'
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH current_snap AS (
  SELECT payload, trust_state, stale_reason, scheduler_source, generated_at
  FROM public.kryo_operator_snapshot_current
  WHERE market = p_market AND product_handle = p_product_handle
  ORDER BY generated_at DESC
  LIMIT 1
),
daily_snap AS (
  SELECT payload, trust_state, stale_reason, scheduler_source, generated_at
  FROM public.kryo_operator_snapshot_daily
  WHERE market = p_market AND product_handle = p_product_handle
  ORDER BY generated_at DESC
  LIMIT 1
),
chosen AS (
  SELECT * FROM current_snap
  UNION ALL
  SELECT * FROM daily_snap WHERE NOT EXISTS (SELECT 1 FROM current_snap)
  LIMIT 1
)
SELECT COALESCE((
  SELECT jsonb_build_object(
    'window_days', p_window_days,
    'compare_days', p_compare_days,
    'market', p_market,
    'product_handle', p_product_handle,
    'payload', payload,
    'trust_state', trust_state,
    'stale_reason', stale_reason,
    'scheduler_source', scheduler_source,
    'generated_at', generated_at
  )
  FROM chosen
), jsonb_build_object(
  'window_days', p_window_days,
  'compare_days', p_compare_days,
  'market', p_market,
  'product_handle', p_product_handle,
  'payload', NULL,
  'trust_state', 'stale',
  'stale_reason', 'no_operator_snapshot_available',
  'scheduler_source', 'manual',
  'generated_at', now()
));
$$;
