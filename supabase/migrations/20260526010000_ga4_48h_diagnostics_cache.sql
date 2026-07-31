-- GA4 48h diagnostics cache
-- Recent hourly cache for fast GA4 diagnosis without live API querying.

CREATE TABLE IF NOT EXISTS public.ga4_site_hourly (
  row_key text PRIMARY KEY,
  report_hour timestamptz NOT NULL,
  date_hour text NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  screen_page_views integer NOT NULL DEFAULT 0,
  total_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  average_session_duration_sec numeric,
  user_engagement_duration_sec numeric,
  engagement_rate numeric,
  bounce_rate numeric,
  event_count integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  begin_checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  purchase_revenue numeric NOT NULL DEFAULT 0,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ga4_site_hourly_report_hour
  ON public.ga4_site_hourly (report_hour DESC);

CREATE TABLE IF NOT EXISTS public.ga4_page_hourly (
  row_key text PRIMARY KEY,
  report_hour timestamptz NOT NULL,
  date_hour text NOT NULL,
  page_path text NOT NULL,
  page_title text,
  country text,
  device_category text,
  session_source_medium text,
  session_campaign_name text,
  sessions integer NOT NULL DEFAULT 0,
  screen_page_views integer NOT NULL DEFAULT 0,
  total_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  average_session_duration_sec numeric,
  user_engagement_duration_sec numeric,
  engagement_rate numeric,
  bounce_rate numeric,
  event_count integer NOT NULL DEFAULT 0,
  events_per_session numeric,
  add_to_carts integer NOT NULL DEFAULT 0,
  begin_checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  purchase_revenue numeric NOT NULL DEFAULT 0,
  view_items integer NOT NULL DEFAULT 0,
  view_to_atc_rate numeric,
  atc_to_checkout_rate numeric,
  checkout_to_purchase_rate numeric,
  page_conversion_rate numeric,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ga4_page_hourly_report_hour
  ON public.ga4_page_hourly (report_hour DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_page_hourly_path_hour
  ON public.ga4_page_hourly (page_path, report_hour DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_page_hourly_title_hour
  ON public.ga4_page_hourly (page_title, report_hour DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_page_hourly_source_hour
  ON public.ga4_page_hourly (session_source_medium, session_campaign_name, report_hour DESC);

ALTER TABLE public.ga4_site_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ga4_page_hourly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage GA4 site hourly" ON public.ga4_site_hourly;
CREATE POLICY "Service role can manage GA4 site hourly"
  ON public.ga4_site_hourly FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage GA4 page hourly" ON public.ga4_page_hourly;
CREATE POLICY "Service role can manage GA4 page hourly"
  ON public.ga4_page_hourly FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.get_ga4_48h_snapshot(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH bounds AS (
  SELECT p_now AS now_at, p_now - interval '48 hours' AS since_at
),
site AS (
  SELECT s.*
  FROM public.ga4_site_hourly s, bounds b
  WHERE s.report_hour >= b.since_at AND s.report_hour <= b.now_at
),
pages AS (
  SELECT p.*
  FROM public.ga4_page_hourly p, bounds b
  WHERE p.report_hour >= b.since_at AND p.report_hour <= b.now_at
),
site_totals AS (
  SELECT
    COALESCE(sum(sessions), 0)::int AS sessions,
    COALESCE(sum(total_users), 0)::int AS hourly_summed_users,
    COALESCE(sum(new_users), 0)::int AS hourly_summed_new_users,
    COALESCE(sum(screen_page_views), 0)::int AS screen_page_views,
    COALESCE(sum(add_to_carts), 0)::int AS add_to_carts,
    COALESCE(sum(begin_checkouts), 0)::int AS begin_checkouts,
    COALESCE(sum(purchases), 0)::int AS purchases,
    COALESCE(sum(purchase_revenue), 0)::numeric AS purchase_revenue,
    CASE WHEN sum(sessions) > 0 THEN COALESCE(sum(add_to_carts),0)::numeric / sum(sessions) ELSE 0 END AS session_to_atc_rate,
    CASE WHEN sum(add_to_carts) > 0 THEN COALESCE(sum(begin_checkouts),0)::numeric / sum(add_to_carts) ELSE 0 END AS atc_to_checkout_rate,
    CASE WHEN sum(begin_checkouts) > 0 THEN COALESCE(sum(purchases),0)::numeric / sum(begin_checkouts) ELSE 0 END AS checkout_to_purchase_rate,
    CASE WHEN sum(sessions) > 0 THEN COALESCE(sum(purchases),0)::numeric / sum(sessions) ELSE 0 END AS session_conversion_rate,
    max(report_hour) AS latest_report_hour,
    max(synced_at) AS latest_synced_at,
    count(*)::int AS hourly_rows
  FROM site
),
page_totals AS (
  SELECT
    page_path,
    max(page_title) AS page_title,
    COALESCE(sum(sessions), 0)::int AS sessions,
    COALESCE(sum(screen_page_views), 0)::int AS screen_page_views,
    COALESCE(sum(add_to_carts), 0)::int AS add_to_carts,
    COALESCE(sum(begin_checkouts), 0)::int AS begin_checkouts,
    COALESCE(sum(purchases), 0)::int AS purchases,
    COALESCE(sum(purchase_revenue), 0)::numeric AS purchase_revenue
  FROM pages
  GROUP BY page_path
),
source_breakdown AS (
  SELECT session_source_medium, session_campaign_name, COALESCE(sum(sessions),0)::int AS sessions
  FROM pages
  GROUP BY session_source_medium, session_campaign_name
  ORDER BY sessions DESC
  LIMIT 20
),
country_breakdown AS (
  SELECT country, COALESCE(sum(sessions),0)::int AS sessions
  FROM pages
  GROUP BY country
  ORDER BY sessions DESC
  LIMIT 20
),
device_breakdown AS (
  SELECT device_category, COALESCE(sum(sessions),0)::int AS sessions
  FROM pages
  GROUP BY device_category
  ORDER BY sessions DESC
  LIMIT 10
),
route_flags AS (
  SELECT
    page_path,
    max(page_title) AS page_title,
    COALESCE(sum(sessions),0)::int AS sessions,
    array_remove(array_agg(DISTINCT flag), NULL) AS flags
  FROM (
    SELECT p.*,
      CASE
        WHEN page_path LIKE '%//%' THEN 'double_slash_product_path'
        WHEN page_title ILIKE '%404%' AND page_path ILIKE '%/products/kryo%' THEN 'kryo_product_404_missing_country_ae_likely'
        WHEN page_title ILIKE '%404%' THEN '404_page_title'
        WHEN page_path = '/' AND (
          COALESCE(session_source_medium,'') ILIKE '%meta%'
          OR COALESCE(session_source_medium,'') ILIKE '%facebook%'
          OR COALESCE(session_source_medium,'') ILIKE '%instagram%'
          OR COALESCE(session_campaign_name,'') ILIKE '%kryo%'
        ) THEN 'homepage_leakage_paid_or_kryo_context'
      END AS flag
    FROM pages p
  ) f
  WHERE flag IS NOT NULL
  GROUP BY page_path
  ORDER BY sessions DESC
  LIMIT 30
),
warnings AS (
  SELECT array_remove(ARRAY[
    CASE WHEN (SELECT hourly_rows FROM site_totals) = 0 THEN 'no_ga4_site_hourly_rows_in_last_48h' END,
    CASE WHEN (SELECT latest_synced_at FROM site_totals) IS NULL THEN 'ga4_hourly_never_synced' END,
    CASE WHEN (SELECT latest_synced_at FROM site_totals) < p_now - interval '36 hours' THEN 'ga4_hourly_sync_stale_over_36h' END,
    CASE WHEN EXISTS (SELECT 1 FROM page_totals WHERE page_title ILIKE '%404%' AND sessions > 0) THEN '404_traffic_detected' END,
    CASE WHEN EXISTS (SELECT 1 FROM page_totals WHERE page_path LIKE '%//%' AND sessions > 0) THEN 'double_slash_url_traffic_detected' END
  ], NULL) AS items
)
SELECT jsonb_build_object(
  'generated_at', p_now,
  'window', jsonb_build_object('since', (SELECT since_at FROM bounds), 'until', p_now),
  'freshness', jsonb_build_object(
    'latest_report_hour', (SELECT latest_report_hour FROM site_totals),
    'latest_synced_at', (SELECT latest_synced_at FROM site_totals),
    'site_hourly_rows', (SELECT hourly_rows FROM site_totals),
    'warnings', (SELECT to_jsonb(items) FROM warnings)
  ),
  'totals', (SELECT to_jsonb(site_totals) - 'latest_report_hour' - 'latest_synced_at' - 'hourly_rows' FROM site_totals),
  'top_pages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM page_totals ORDER BY sessions DESC LIMIT 20) t), '[]'::jsonb),
  'not_found_pages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM page_totals WHERE page_title ILIKE '%404%' ORDER BY sessions DESC LIMIT 20) t), '[]'::jsonb),
  'kryo_pages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM page_totals WHERE page_path ILIKE '%kryo%' ORDER BY sessions DESC LIMIT 30) t), '[]'::jsonb),
  'homepage_leakage', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
    SELECT session_source_medium, session_campaign_name, COALESCE(sum(sessions),0)::int AS sessions
    FROM pages
    WHERE page_path = '/' AND (
      COALESCE(session_source_medium,'') ILIKE '%meta%'
      OR COALESCE(session_source_medium,'') ILIKE '%facebook%'
      OR COALESCE(session_source_medium,'') ILIKE '%instagram%'
      OR COALESCE(session_campaign_name,'') ILIKE '%kryo%'
    )
    GROUP BY session_source_medium, session_campaign_name
    ORDER BY sessions DESC
    LIMIT 20
  ) t), '[]'::jsonb),
  'route_flags', COALESCE((SELECT jsonb_agg(to_jsonb(route_flags)) FROM route_flags), '[]'::jsonb),
  'breakdowns', jsonb_build_object(
    'source_campaign', COALESCE((SELECT jsonb_agg(to_jsonb(source_breakdown)) FROM source_breakdown), '[]'::jsonb),
    'country', COALESCE((SELECT jsonb_agg(to_jsonb(country_breakdown)) FROM country_breakdown), '[]'::jsonb),
    'device', COALESCE((SELECT jsonb_agg(to_jsonb(device_breakdown)) FROM device_breakdown), '[]'::jsonb)
  )
)
FROM bounds;
$$;
