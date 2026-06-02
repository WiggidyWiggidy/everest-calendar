ALTER TABLE public.attribution_touches
  ADD COLUMN IF NOT EXISTS anonymous_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS current_touch_meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS traffic_class TEXT;

ALTER TABLE public.attribution_touches
  DROP CONSTRAINT IF EXISTS attribution_touches_event_type_check;
ALTER TABLE public.attribution_touches
  ADD CONSTRAINT attribution_touches_event_type_check CHECK (event_type = ANY (ARRAY[
    'session_start','page_view','product_view','add_to_cart','checkout_start','order_placed',
    'cart_add_request','cart_add_failed','whatsapp_click','shopify_inbox_click','compatibility_cta_click',
    'installation_faq_open','hose_connection_faq_open','delivery_faq_open','returns_faq_open',
    'comparison_section_view','reviews_section_view','offer_section_view','guarantee_section_view'
  ]));

CREATE INDEX IF NOT EXISTS idx_attribution_touches_meta_ad_ts
  ON public.attribution_touches(meta_ad_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_touches_anonymous_ts
  ON public.attribution_touches(anonymous_id, ts DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_touches_shopify_order_event
  ON public.attribution_touches(shopify_order_id, event_type);

ALTER TABLE public.ga4_page_hourly
  ADD COLUMN IF NOT EXISTS session_manual_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS session_manual_ad_content TEXT;

ALTER TABLE public.kryo_lp_scorecards
  ADD COLUMN IF NOT EXISTS ad_level_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS journey_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS guardrail_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_quality JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.marketing_guardrail_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'medium', 'high')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketing_guardrail_alerts_open
  ON public.marketing_guardrail_alerts(status, severity, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.shopify_order_attribution (
  shopify_order_id TEXT PRIMARY KEY,
  shopify_customer_id TEXT,
  anonymous_id TEXT,
  session_id TEXT,
  first_touch_meta_ad_id TEXT,
  last_touch_meta_ad_id TEXT,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  ordered_at TIMESTAMPTZ NOT NULL,
  currency TEXT,
  gross_revenue NUMERIC NOT NULL DEFAULT 0,
  refunds NUMERIC NOT NULL DEFAULT 0,
  net_revenue NUMERIC GENERATED ALWAYS AS (gross_revenue - refunds) STORED,
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.get_kryo_ad_downstream_report(
  p_page_path TEXT DEFAULT '/products/kryo2',
  p_window_hours INTEGER DEFAULT 24
) RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH bounds AS (
  SELECT NOW() AS window_end, NOW() - make_interval(hours => p_window_hours) AS window_start
), meta AS (
  SELECT h.meta_ad_id,
    SUM(h.spend)::numeric AS spend,
    SUM(h.impressions)::bigint AS impressions,
    SUM(h.reach)::bigint AS reach,
    SUM(h.link_clicks)::bigint AS link_clicks,
    SUM(h.landing_page_views)::bigint AS landing_page_views,
    SUM(h.add_to_carts)::bigint AS meta_add_to_carts,
    SUM(h.checkouts_started)::bigint AS meta_checkouts_started,
    SUM(h.purchases)::bigint AS meta_purchases,
    SUM(h.revenue)::numeric AS meta_revenue
  FROM public.meta_ad_metrics_hourly h, bounds b
  WHERE h.report_hour >= b.window_start AND h.report_hour < b.window_end
  GROUP BY h.meta_ad_id
), touches AS (
  SELECT t.meta_ad_id,
    COUNT(DISTINCT t.session_id) FILTER (WHERE t.event_type IN ('page_view','session_start','product_view')) AS matched_sessions,
    COUNT(*) FILTER (WHERE t.event_type = 'product_view') AS product_views,
    COUNT(*) FILTER (WHERE t.event_type = 'offer_section_view') AS offer_views,
    COUNT(*) FILTER (WHERE t.event_type = 'guarantee_section_view') AS guarantee_views,
    COUNT(*) FILTER (WHERE t.event_type = 'add_to_cart') AS add_to_carts,
    COUNT(*) FILTER (WHERE t.event_type = 'checkout_start') AS checkout_starts,
    COUNT(*) FILTER (WHERE t.event_type = 'whatsapp_click') AS whatsapp_clicks,
    COUNT(*) FILTER (WHERE t.event_type = 'compatibility_cta_click') AS fit_check_clicks
  FROM public.attribution_touches t, bounds b
  WHERE t.ts >= b.window_start AND t.ts < b.window_end
    AND t.page_path = p_page_path AND COALESCE(t.is_internal, FALSE) = FALSE
    AND t.traffic_class = 'paid_meta' AND t.meta_ad_id IS NOT NULL
  GROUP BY t.meta_ad_id
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'meta_ad_id', m.meta_ad_id,
  'spend', m.spend, 'impressions', m.impressions, 'reach', m.reach,
  'link_clicks', m.link_clicks, 'landing_page_views', m.landing_page_views,
  'ctr', CASE WHEN m.impressions > 0 THEN m.link_clicks::numeric / m.impressions END,
  'cpc', CASE WHEN m.link_clicks > 0 THEN m.spend / m.link_clicks END,
  'matched_sessions', COALESCE(t.matched_sessions, 0),
  'product_views', COALESCE(t.product_views, 0),
  'offer_views', COALESCE(t.offer_views, 0),
  'guarantee_views', COALESCE(t.guarantee_views, 0),
  'add_to_carts', COALESCE(t.add_to_carts, 0),
  'checkout_starts', COALESCE(t.checkout_starts, 0),
  'whatsapp_clicks', COALESCE(t.whatsapp_clicks, 0),
  'fit_check_clicks', COALESCE(t.fit_check_clicks, 0),
  'meta_purchases', m.meta_purchases, 'meta_revenue', m.meta_revenue,
  'meta_roas', CASE WHEN m.spend > 0 THEN m.meta_revenue / m.spend END,
  'lpv_to_click_rate', CASE WHEN m.link_clicks > 0 THEN m.landing_page_views::numeric / m.link_clicks END,
  'lpv_to_matched_session_rate', CASE WHEN m.landing_page_views > 0 THEN COALESCE(t.matched_sessions, 0)::numeric / m.landing_page_views END
) ORDER BY m.spend DESC), '[]'::jsonb)
FROM meta m LEFT JOIN touches t USING (meta_ad_id);
$$;

CREATE OR REPLACE FUNCTION public.get_kryo_purchase_journeys(
  p_days INTEGER DEFAULT 30
) RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
SELECT jsonb_build_object(
  'window_days', p_days,
  'orders', COUNT(*),
  'matched_orders', COUNT(*) FILTER (WHERE match_status = 'matched'),
  'unmatched_orders', COUNT(*) FILTER (WHERE match_status <> 'matched'),
  'gross_revenue', COALESCE(SUM(gross_revenue), 0),
  'refunds', COALESCE(SUM(refunds), 0),
  'net_revenue', COALESCE(SUM(net_revenue), 0),
  'purchase_join_validation_pending', COUNT(*) FILTER (WHERE match_status = 'matched') = 0
)
FROM public.shopify_order_attribution
WHERE ordered_at >= NOW() - make_interval(days => p_days);
$$;

GRANT EXECUTE ON FUNCTION public.get_kryo_ad_downstream_report(TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kryo_purchase_journeys(INTEGER) TO anon, authenticated, service_role;
