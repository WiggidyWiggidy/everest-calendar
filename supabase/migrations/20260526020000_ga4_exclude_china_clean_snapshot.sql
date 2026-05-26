-- GA4 clean decision stats
-- Keep raw GA4 rows untouched; add a country-level site cache so the default snapshot
-- can exclude Tom/internal China traffic without using page-row overcounts for totals.

CREATE TABLE IF NOT EXISTS public.ga4_site_country_hourly (
  row_key text PRIMARY KEY,
  report_hour timestamptz NOT NULL,
  date_hour text NOT NULL,
  country text NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_ga4_site_country_hourly_report_hour
  ON public.ga4_site_country_hourly (report_hour DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_site_country_hourly_country_hour
  ON public.ga4_site_country_hourly (country, report_hour DESC);

ALTER TABLE public.ga4_site_country_hourly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage GA4 site country hourly" ON public.ga4_site_country_hourly;
CREATE POLICY "Service role can manage GA4 site country hourly"
  ON public.ga4_site_country_hourly FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP FUNCTION IF EXISTS public.get_ga4_48h_snapshot(timestamptz);
DROP FUNCTION IF EXISTS public.get_ga4_48h_snapshot(timestamptz, boolean);

CREATE OR REPLACE FUNCTION public.get_ga4_48h_snapshot(
  p_now timestamptz DEFAULT now(),
  include_internal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH bounds AS (
  SELECT p_now AS now_at, p_now - interval '48 hours' AS since_at
),
raw_site AS (
  SELECT s.*
  FROM public.ga4_site_hourly s, bounds b
  WHERE s.report_hour >= b.since_at AND s.report_hour <= b.now_at
),
site_country_all AS (
  SELECT s.*
  FROM public.ga4_site_country_hourly s, bounds b
  WHERE s.report_hour >= b.since_at AND s.report_hour <= b.now_at
),
site_country_clean AS (
  SELECT *
  FROM site_country_all
  WHERE include_internal OR COALESCE(country, '') <> 'China'
),
pages AS (
  SELECT p.*
  FROM public.ga4_page_hourly p, bounds b
  WHERE p.report_hour >= b.since_at AND p.report_hour <= b.now_at
    AND (include_internal OR COALESCE(p.country, '') <> 'China')
),
raw_site_totals AS (
  SELECT
    COALESCE(sum(sessions), 0)::int AS sessions,
    COALESCE(sum(total_users), 0)::int AS hourly_summed_users,
    COALESCE(sum(new_users), 0)::int AS hourly_summed_new_users,
    COALESCE(sum(screen_page_views), 0)::int AS screen_page_views,
    COALESCE(sum(add_to_carts), 0)::int AS add_to_carts,
    COALESCE(sum(begin_checkouts), 0)::int AS begin_checkouts,
    COALESCE(sum(purchases), 0)::int AS purchases,
    COALESCE(sum(purchase_revenue), 0)::numeric AS purchase_revenue,
    max(report_hour) AS latest_report_hour,
    max(synced_at) AS latest_synced_at,
    count(*)::int AS hourly_rows
  FROM raw_site
),
site_country_totals AS (
  SELECT
    COALESCE(sum(sessions), 0)::int AS sessions,
    COALESCE(sum(total_users), 0)::int AS hourly_summed_users,
    COALESCE(sum(new_users), 0)::int AS hourly_summed_new_users,
    COALESCE(sum(screen_page_views), 0)::int AS screen_page_views,
    COALESCE(sum(add_to_carts), 0)::int AS add_to_carts,
    COALESCE(sum(begin_checkouts), 0)::int AS begin_checkouts,
    COALESCE(sum(purchases), 0)::int AS purchases,
    COALESCE(sum(purchase_revenue), 0)::numeric AS purchase_revenue,
    max(report_hour) AS latest_report_hour,
    max(synced_at) AS latest_synced_at,
    count(*)::int AS hourly_rows
  FROM site_country_clean
),
china_totals AS (
  SELECT
    COALESCE(sum(sessions), 0)::int AS sessions,
    COALESCE(sum(total_users), 0)::int AS hourly_summed_users,
    COALESCE(sum(new_users), 0)::int AS hourly_summed_new_users,
    COALESCE(sum(screen_page_views), 0)::int AS screen_page_views,
    COALESCE(sum(add_to_carts), 0)::int AS add_to_carts,
    COALESCE(sum(begin_checkouts), 0)::int AS begin_checkouts,
    COALESCE(sum(purchases), 0)::int AS purchases,
    COALESCE(sum(purchase_revenue), 0)::numeric AS purchase_revenue
  FROM site_country_all
  WHERE country = 'China'
),
site_totals_base AS (
  SELECT * FROM site_country_totals
  WHERE NOT include_internal AND (SELECT count(*) FROM site_country_all) > 0
  UNION ALL
  SELECT * FROM raw_site_totals
  WHERE include_internal OR (SELECT count(*) FROM site_country_all) = 0
),
site_totals AS (
  SELECT
    sessions,
    hourly_summed_users,
    hourly_summed_new_users,
    screen_page_views,
    add_to_carts,
    begin_checkouts,
    purchases,
    purchase_revenue,
    CASE WHEN sessions > 0 THEN COALESCE(add_to_carts,0)::numeric / sessions ELSE 0 END AS session_to_atc_rate,
    CASE WHEN add_to_carts > 0 THEN COALESCE(begin_checkouts,0)::numeric / add_to_carts ELSE 0 END AS atc_to_checkout_rate,
    CASE WHEN begin_checkouts > 0 THEN COALESCE(purchases,0)::numeric / begin_checkouts ELSE 0 END AS checkout_to_purchase_rate,
    CASE WHEN sessions > 0 THEN COALESCE(purchases,0)::numeric / sessions ELSE 0 END AS session_conversion_rate,
    latest_report_hour,
    latest_synced_at,
    hourly_rows
  FROM site_totals_base
  LIMIT 1
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
    CASE WHEN (SELECT hourly_rows FROM raw_site_totals) = 0 THEN 'no_ga4_site_hourly_rows_in_last_48h' END,
    CASE WHEN (SELECT latest_synced_at FROM raw_site_totals) IS NULL THEN 'ga4_hourly_never_synced' END,
    CASE WHEN (SELECT latest_synced_at FROM raw_site_totals) < p_now - interval '36 hours' THEN 'ga4_hourly_sync_stale_over_36h' END,
    CASE WHEN NOT include_internal AND (SELECT count(*) FROM site_country_all) = 0 THEN 'ga4_site_country_hourly_missing_clean_totals_fallback_to_raw' END,
    CASE WHEN EXISTS (SELECT 1 FROM page_totals WHERE page_title ILIKE '%404%' AND sessions > 0) THEN '404_traffic_detected' END,
    CASE WHEN EXISTS (SELECT 1 FROM page_totals WHERE page_path LIKE '%//%' AND sessions > 0) THEN 'double_slash_url_traffic_detected' END
  ], NULL) AS items
)
SELECT jsonb_build_object(
  'generated_at', p_now,
  'window', jsonb_build_object('since', (SELECT since_at FROM bounds), 'until', p_now),
  'filters_applied', CASE WHEN include_internal THEN '[]'::jsonb ELSE '["exclude_country_china"]'::jsonb END,
  'internal_exclusion', jsonb_build_object(
    'country', 'China',
    'include_internal', include_internal,
    'sessions_removed', CASE WHEN include_internal THEN 0 ELSE (SELECT sessions FROM china_totals) END,
    'pageviews_removed', CASE WHEN include_internal THEN 0 ELSE (SELECT screen_page_views FROM china_totals) END,
    'add_to_carts_removed', CASE WHEN include_internal THEN 0 ELSE (SELECT add_to_carts FROM china_totals) END
  ),
  'freshness', jsonb_build_object(
    'latest_report_hour', (SELECT latest_report_hour FROM raw_site_totals),
    'latest_synced_at', (SELECT latest_synced_at FROM raw_site_totals),
    'site_hourly_rows', (SELECT hourly_rows FROM raw_site_totals),
    'site_country_hourly_rows', (SELECT count(*)::int FROM site_country_all),
    'warnings', (SELECT to_jsonb(items) FROM warnings)
  ),
  'totals', (SELECT to_jsonb(site_totals) - 'latest_report_hour' - 'latest_synced_at' - 'hourly_rows' FROM site_totals),
  'raw_totals', (SELECT to_jsonb(raw_site_totals) - 'latest_report_hour' - 'latest_synced_at' - 'hourly_rows' FROM raw_site_totals),
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
