-- KRYO customer journey tracking
-- First-party anonymous journey layer for high-ticket ecommerce intent analysis.

CREATE TABLE IF NOT EXISTS public.visitor_identity (
  anonymous_id text PRIMARY KEY,
  ga_user_pseudo_id text,
  shopify_customer_id text,
  email_hash text,
  phone_hash text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_landing_page text,
  first_referrer text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_content text,
  first_utm_term text,
  first_utm_angle text,
  first_meta_campaign_id text,
  first_meta_adset_id text,
  first_meta_ad_id text,
  first_fbp text,
  first_fbc text,
  device text,
  country text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sessions (
  session_id text PRIMARY KEY,
  anonymous_id text NOT NULL REFERENCES public.visitor_identity(anonymous_id) ON DELETE CASCADE,
  ga_user_pseudo_id text,
  session_start_at timestamptz NOT NULL DEFAULT now(),
  session_end_at timestamptz NOT NULL DEFAULT now(),
  landing_page text,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  ad_angle text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  device text,
  country text,
  city text,
  is_first_session boolean NOT NULL DEFAULT false,
  session_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journey_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  anonymous_id text NOT NULL REFERENCES public.visitor_identity(anonymous_id) ON DELETE CASCADE,
  ga_user_pseudo_id text,
  session_id text REFERENCES public.sessions(session_id) ON DELETE SET NULL,
  page_url text,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  ad_angle text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  event_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_events_known_event CHECK (event_name = ANY (ARRAY[
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
    'cart_add_failed'
  ]))
);

CREATE INDEX IF NOT EXISTS idx_visitor_identity_first_touch_angle ON public.visitor_identity(first_utm_angle, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_identity_last_seen ON public.visitor_identity(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_anonymous_number ON public.sessions(anonymous_id, session_number);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON public.sessions(session_start_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_return_source ON public.sessions(source, medium, campaign, session_number);
CREATE INDEX IF NOT EXISTS idx_journey_events_anonymous_time ON public.journey_events(anonymous_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_journey_events_name_time ON public.journey_events(event_name, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_journey_events_session ON public.journey_events(session_id, event_timestamp);
CREATE INDEX IF NOT EXISTS idx_journey_events_angle ON public.journey_events(ad_angle, event_timestamp DESC);

ALTER TABLE public.visitor_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage visitor identity" ON public.visitor_identity;
CREATE POLICY "Service role can manage visitor identity"
  ON public.visitor_identity FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage journey sessions" ON public.sessions;
CREATE POLICY "Service role can manage journey sessions"
  ON public.sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage journey events" ON public.journey_events;
CREATE POLICY "Service role can manage journey events"
  ON public.journey_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE VIEW public.v_kryo_first_time_visitors_by_angle AS
SELECT
  COALESCE(first_utm_angle, first_utm_content, first_utm_campaign, '(unknown)') AS first_ad_angle,
  first_utm_source,
  first_utm_medium,
  first_utm_campaign,
  first_meta_campaign_id,
  first_meta_adset_id,
  first_meta_ad_id,
  count(*)::int AS first_time_visitors,
  min(first_seen_at) AS first_seen_min,
  max(first_seen_at) AS first_seen_max
FROM public.visitor_identity
WHERE COALESCE(country, '') <> 'China'
GROUP BY 1,2,3,4,5,6,7
ORDER BY first_time_visitors DESC;

CREATE OR REPLACE VIEW public.v_kryo_return_windows_by_angle AS
WITH second_sessions AS (
  SELECT anonymous_id, min(session_start_at) AS second_session_at
  FROM public.sessions
  WHERE session_number >= 2
  GROUP BY anonymous_id
), base AS (
  SELECT
    v.anonymous_id,
    COALESCE(v.first_utm_angle, v.first_utm_content, v.first_utm_campaign, '(unknown)') AS first_ad_angle,
    v.first_seen_at,
    s.second_session_at
  FROM public.visitor_identity v
  LEFT JOIN second_sessions s USING (anonymous_id)
  WHERE COALESCE(v.country, '') <> 'China'
)
SELECT
  first_ad_angle,
  count(*)::int AS visitors,
  count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '1 day')::int AS returned_1d,
  count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '3 days')::int AS returned_3d,
  count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '7 days')::int AS returned_7d,
  count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '14 days')::int AS returned_14d,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '1 day')::numeric / count(*) ELSE 0 END AS returned_1d_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '3 days')::numeric / count(*) ELSE 0 END AS returned_3d_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '7 days')::numeric / count(*) ELSE 0 END AS returned_7d_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE second_session_at <= first_seen_at + interval '14 days')::numeric / count(*) ELSE 0 END AS returned_14d_rate,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (second_session_at - first_seen_at)) / 3600)
    FILTER (WHERE second_session_at IS NOT NULL) AS median_hours_to_second_session
FROM base
GROUP BY first_ad_angle
ORDER BY visitors DESC;

CREATE OR REPLACE VIEW public.v_kryo_warm_intent_by_angle AS
WITH warm AS (
  SELECT
    anonymous_id,
    min(event_timestamp) AS first_warm_at,
    count(*) FILTER (WHERE event_name = 'compatibility_cta_click') AS compatibility_cta_clicks,
    count(*) FILTER (WHERE event_name = 'whatsapp_click') AS whatsapp_clicks,
    count(*) FILTER (WHERE event_name = 'product_added_to_cart') AS add_to_carts,
    count(*) FILTER (WHERE event_name = 'checkout_started') AS checkout_starts
  FROM public.journey_events
  WHERE event_name IN (
    'product_added_to_cart','checkout_started','compatibility_cta_click','whatsapp_click',
    'shopify_inbox_click','installation_faq_open','hose_connection_faq_open','delivery_faq_open',
    'returns_faq_open','comparison_section_view','reviews_section_view'
  )
  GROUP BY anonymous_id
), first_warm_session AS (
  SELECT DISTINCT ON (w.anonymous_id)
    w.anonymous_id,
    s.session_number AS sessions_before_warm
  FROM warm w
  JOIN public.sessions s
    ON s.anonymous_id = w.anonymous_id
   AND s.session_start_at <= w.first_warm_at
  ORDER BY w.anonymous_id, s.session_start_at DESC
)
SELECT
  COALESCE(v.first_utm_angle, v.first_utm_content, v.first_utm_campaign, '(unknown)') AS first_ad_angle,
  count(*)::int AS visitors,
  count(w.anonymous_id)::int AS warm_visitors,
  CASE WHEN count(*) > 0 THEN count(w.anonymous_id)::numeric / count(*) ELSE 0 END AS warm_rate,
  avg(f.sessions_before_warm) AS avg_sessions_before_warm,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY f.sessions_before_warm) AS median_sessions_before_warm,
  count(*) FILTER (WHERE w.compatibility_cta_clicks > 0)::int AS compatibility_cta_visitors,
  count(*) FILTER (WHERE w.whatsapp_clicks > 0)::int AS whatsapp_visitors,
  count(*) FILTER (WHERE w.add_to_carts > 0)::int AS atc_visitors,
  count(*) FILTER (WHERE w.checkout_starts > 0)::int AS checkout_visitors,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE w.compatibility_cta_clicks > 0)::numeric / count(*) ELSE 0 END AS compatibility_cta_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE w.whatsapp_clicks > 0)::numeric / count(*) ELSE 0 END AS whatsapp_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE w.add_to_carts > 0)::numeric / count(*) ELSE 0 END AS atc_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE w.checkout_starts > 0)::numeric / count(*) ELSE 0 END AS checkout_rate
FROM public.visitor_identity v
LEFT JOIN warm w USING (anonymous_id)
LEFT JOIN first_warm_session f USING (anonymous_id)
WHERE COALESCE(v.country, '') <> 'China'
GROUP BY first_ad_angle
ORDER BY warm_visitors DESC, visitors DESC;

CREATE OR REPLACE VIEW public.v_kryo_second_session_sources AS
WITH first_second AS (
  SELECT
    v.anonymous_id,
    COALESCE(v.first_utm_angle, v.first_utm_content, v.first_utm_campaign, '(unknown)') AS first_ad_angle,
    v.first_utm_source AS first_source,
    v.first_utm_medium AS first_medium,
    s.source AS second_source,
    s.medium AS second_medium,
    s.campaign AS second_campaign
  FROM public.visitor_identity v
  JOIN public.sessions s ON s.anonymous_id = v.anonymous_id AND s.session_number = 2
  WHERE COALESCE(v.country, '') <> 'China'
)
SELECT
  first_ad_angle,
  first_source,
  first_medium,
  second_source,
  second_medium,
  second_campaign,
  count(*)::int AS visitors
FROM first_second
GROUP BY 1,2,3,4,5,6
ORDER BY visitors DESC;

CREATE OR REPLACE VIEW public.v_kryo_high_intent_action_predictors AS
WITH actions AS (
  SELECT DISTINCT anonymous_id, event_name
  FROM public.journey_events
  WHERE event_name IN (
    'compatibility_cta_click','whatsapp_click','shopify_inbox_click','installation_faq_open',
    'hose_connection_faq_open','delivery_faq_open','returns_faq_open','comparison_section_view','reviews_section_view'
  )
), later AS (
  SELECT
    a.event_name,
    a.anonymous_id,
    EXISTS (
      SELECT 1 FROM public.journey_events e
      WHERE e.anonymous_id = a.anonymous_id AND e.event_name = 'product_added_to_cart'
    ) AS ever_added_to_cart,
    EXISTS (
      SELECT 1 FROM public.journey_events e
      WHERE e.anonymous_id = a.anonymous_id AND e.event_name = 'whatsapp_click'
    ) AS ever_clicked_whatsapp,
    EXISTS (
      SELECT 1 FROM public.journey_events e
      WHERE e.anonymous_id = a.anonymous_id AND e.event_name = 'checkout_started'
    ) AS ever_started_checkout
  FROM actions a
  JOIN public.visitor_identity v ON v.anonymous_id = a.anonymous_id
  WHERE COALESCE(v.country, '') <> 'China'
)
SELECT
  event_name,
  count(*)::int AS users_who_did_event,
  count(*) FILTER (WHERE ever_added_to_cart)::int AS users_later_or_ever_atc,
  count(*) FILTER (WHERE ever_clicked_whatsapp)::int AS users_later_or_ever_whatsapp,
  count(*) FILTER (WHERE ever_started_checkout)::int AS users_later_or_ever_checkout,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE ever_added_to_cart)::numeric / count(*) ELSE 0 END AS atc_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE ever_clicked_whatsapp)::numeric / count(*) ELSE 0 END AS whatsapp_rate,
  CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE ever_started_checkout)::numeric / count(*) ELSE 0 END AS checkout_rate
FROM later
GROUP BY event_name
ORDER BY users_who_did_event DESC;
