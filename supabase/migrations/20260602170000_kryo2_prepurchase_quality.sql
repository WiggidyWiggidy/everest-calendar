CREATE TABLE IF NOT EXISTS public.kryo_pdp_session_quality (
  session_id TEXT NOT NULL,
  page_path TEXT NOT NULL,
  anonymous_id TEXT,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  first_touch_meta_ad_id TEXT,
  current_touch_meta_ad_id TEXT,
  device_type TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  elapsed_time_sec INTEGER NOT NULL DEFAULT 0,
  active_time_sec INTEGER NOT NULL DEFAULT 0,
  max_scroll_depth_pct NUMERIC NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  interactive_clicks INTEGER NOT NULL DEFAULT 0,
  dead_clicks INTEGER NOT NULL DEFAULT 0,
  rage_clicks INTEGER NOT NULL DEFAULT 0,
  scroll_25 BOOLEAN NOT NULL DEFAULT FALSE,
  scroll_50 BOOLEAN NOT NULL DEFAULT FALSE,
  scroll_75 BOOLEAN NOT NULL DEFAULT FALSE,
  scroll_90 BOOLEAN NOT NULL DEFAULT FALSE,
  offer_viewed BOOLEAN NOT NULL DEFAULT FALSE,
  guarantee_viewed BOOLEAN NOT NULL DEFAULT FALSE,
  cta_clicks INTEGER NOT NULL DEFAULT 0,
  sections_viewed JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections_clicked JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, page_path)
);

CREATE INDEX IF NOT EXISTS idx_kryo_pdp_quality_page_seen
  ON public.kryo_pdp_session_quality(page_path, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_kryo_pdp_quality_ad_seen
  ON public.kryo_pdp_session_quality(meta_ad_id, last_seen_at DESC);
ALTER TABLE public.kryo_pdp_session_quality ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.kryo_pdp_section_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT NOT NULL,
  page_path TEXT NOT NULL,
  meta_ad_id TEXT,
  section_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('section_view','click','dead_click','rage_click','scroll_abandon')),
  x_pct NUMERIC,
  y_pct NUMERIC,
  scroll_depth_pct NUMERIC,
  target_role TEXT,
  is_interactive BOOLEAN,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_kryo_pdp_section_events_page_ts
  ON public.kryo_pdp_section_events(page_path, ts DESC);
ALTER TABLE public.kryo_pdp_section_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.upsert_kryo_pdp_session_quality(p_row JSONB)
RETURNS VOID LANGUAGE sql AS $$
INSERT INTO public.kryo_pdp_session_quality (
  session_id,page_path,anonymous_id,meta_campaign_id,meta_adset_id,meta_ad_id,
  first_touch_meta_ad_id,current_touch_meta_ad_id,device_type,is_internal,
  elapsed_time_sec,active_time_sec,max_scroll_depth_pct,total_clicks,interactive_clicks,
  dead_clicks,rage_clicks,scroll_25,scroll_50,scroll_75,scroll_90,offer_viewed,
  guarantee_viewed,cta_clicks,sections_viewed,sections_clicked,first_seen_at,last_seen_at
) VALUES (
  p_row->>'session_id',p_row->>'page_path',p_row->>'anonymous_id',p_row->>'meta_campaign_id',
  p_row->>'meta_adset_id',p_row->>'meta_ad_id',p_row->>'first_touch_meta_ad_id',
  p_row->>'current_touch_meta_ad_id',p_row->>'device_type',COALESCE((p_row->>'is_internal')::boolean,FALSE),
  COALESCE((p_row->>'elapsed_time_sec')::int,0),COALESCE((p_row->>'active_time_sec')::int,0),
  COALESCE((p_row->>'max_scroll_depth_pct')::numeric,0),COALESCE((p_row->>'total_clicks')::int,0),
  COALESCE((p_row->>'interactive_clicks')::int,0),COALESCE((p_row->>'dead_clicks')::int,0),
  COALESCE((p_row->>'rage_clicks')::int,0),COALESCE((p_row->>'scroll_25')::boolean,FALSE),
  COALESCE((p_row->>'scroll_50')::boolean,FALSE),COALESCE((p_row->>'scroll_75')::boolean,FALSE),
  COALESCE((p_row->>'scroll_90')::boolean,FALSE),COALESCE((p_row->>'offer_viewed')::boolean,FALSE),
  COALESCE((p_row->>'guarantee_viewed')::boolean,FALSE),COALESCE((p_row->>'cta_clicks')::int,0),
  COALESCE(p_row->'sections_viewed','[]'::jsonb),COALESCE(p_row->'sections_clicked','[]'::jsonb),
  COALESCE((p_row->>'last_seen_at')::timestamptz,NOW()),
  COALESCE((p_row->>'last_seen_at')::timestamptz,NOW())
)
ON CONFLICT (session_id,page_path) DO UPDATE SET
  anonymous_id=COALESCE(EXCLUDED.anonymous_id,kryo_pdp_session_quality.anonymous_id),
  meta_campaign_id=COALESCE(EXCLUDED.meta_campaign_id,kryo_pdp_session_quality.meta_campaign_id),
  meta_adset_id=COALESCE(EXCLUDED.meta_adset_id,kryo_pdp_session_quality.meta_adset_id),
  meta_ad_id=COALESCE(EXCLUDED.meta_ad_id,kryo_pdp_session_quality.meta_ad_id),
  first_touch_meta_ad_id=COALESCE(EXCLUDED.first_touch_meta_ad_id,kryo_pdp_session_quality.first_touch_meta_ad_id),
  current_touch_meta_ad_id=COALESCE(EXCLUDED.current_touch_meta_ad_id,kryo_pdp_session_quality.current_touch_meta_ad_id),
  device_type=COALESCE(EXCLUDED.device_type,kryo_pdp_session_quality.device_type),
  is_internal=EXCLUDED.is_internal,
  elapsed_time_sec=GREATEST(kryo_pdp_session_quality.elapsed_time_sec,EXCLUDED.elapsed_time_sec),
  active_time_sec=GREATEST(kryo_pdp_session_quality.active_time_sec,EXCLUDED.active_time_sec),
  max_scroll_depth_pct=GREATEST(kryo_pdp_session_quality.max_scroll_depth_pct,EXCLUDED.max_scroll_depth_pct),
  total_clicks=GREATEST(kryo_pdp_session_quality.total_clicks,EXCLUDED.total_clicks),
  interactive_clicks=GREATEST(kryo_pdp_session_quality.interactive_clicks,EXCLUDED.interactive_clicks),
  dead_clicks=GREATEST(kryo_pdp_session_quality.dead_clicks,EXCLUDED.dead_clicks),
  rage_clicks=GREATEST(kryo_pdp_session_quality.rage_clicks,EXCLUDED.rage_clicks),
  scroll_25=kryo_pdp_session_quality.scroll_25 OR EXCLUDED.scroll_25,
  scroll_50=kryo_pdp_session_quality.scroll_50 OR EXCLUDED.scroll_50,
  scroll_75=kryo_pdp_session_quality.scroll_75 OR EXCLUDED.scroll_75,
  scroll_90=kryo_pdp_session_quality.scroll_90 OR EXCLUDED.scroll_90,
  offer_viewed=kryo_pdp_session_quality.offer_viewed OR EXCLUDED.offer_viewed,
  guarantee_viewed=kryo_pdp_session_quality.guarantee_viewed OR EXCLUDED.guarantee_viewed,
  cta_clicks=GREATEST(kryo_pdp_session_quality.cta_clicks,EXCLUDED.cta_clicks),
  sections_viewed=COALESCE((SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(kryo_pdp_session_quality.sections_viewed || EXCLUDED.sections_viewed) x),'[]'::jsonb),
  sections_clicked=COALESCE((SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(kryo_pdp_session_quality.sections_clicked || EXCLUDED.sections_clicked) x),'[]'::jsonb),
  last_seen_at=GREATEST(kryo_pdp_session_quality.last_seen_at,EXCLUDED.last_seen_at);
$$;

ALTER TABLE public.meta_dce_metrics
  ADD COLUMN IF NOT EXISTS stable_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS asset_name TEXT,
  ADD COLUMN IF NOT EXISTS asset_image_hash TEXT,
  ADD COLUMN IF NOT EXISTS asset_preview_url TEXT,
  ADD COLUMN IF NOT EXISTS link_clicks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_contents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_to_carts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkouts_started INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.kryo_lp_scorecards
  ADD COLUMN IF NOT EXISTS prepurchase_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS section_heatmap JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dct_asset_report JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.get_kryo_prepurchase_quality_report(
  p_page_path TEXT DEFAULT '/products/kryo2',
  p_window_hours INTEGER DEFAULT 24
) RETURNS JSONB
LANGUAGE sql STABLE AS $$
WITH rows AS (
  SELECT * FROM public.kryo_pdp_session_quality
  WHERE page_path = p_page_path
    AND is_internal = FALSE
    AND last_seen_at >= NOW() - make_interval(hours => p_window_hours)
), base AS (
  SELECT
    COUNT(*)::int sessions,
    COALESCE(AVG(active_time_sec),0)::numeric avg_active_time_sec,
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY active_time_sec),0)::numeric median_active_time_sec,
    COALESCE(AVG(elapsed_time_sec),0)::numeric avg_elapsed_time_sec,
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_time_sec),0)::numeric median_elapsed_time_sec,
    COALESCE(AVG(max_scroll_depth_pct),0)::numeric avg_scroll_depth_pct,
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY max_scroll_depth_pct),0)::numeric median_scroll_depth_pct,
    COUNT(*) FILTER (WHERE scroll_25)::int scroll_25_sessions,
    COUNT(*) FILTER (WHERE scroll_50)::int scroll_50_sessions,
    COUNT(*) FILTER (WHERE scroll_75)::int scroll_75_sessions,
    COUNT(*) FILTER (WHERE scroll_90)::int scroll_90_sessions,
    COALESCE(AVG(total_clicks),0)::numeric avg_clicks,
    COALESCE(AVG(interactive_clicks),0)::numeric avg_interactive_clicks,
    COALESCE(SUM(cta_clicks),0)::int cta_clicks,
    COUNT(*) FILTER (WHERE offer_viewed)::int offer_sessions,
    COUNT(*) FILTER (WHERE guarantee_viewed)::int guarantee_sessions,
    COUNT(*) FILTER (WHERE active_time_sec >= 20 OR max_scroll_depth_pct >= 50 OR interactive_clicks >= 1)::int engaged_sessions,
    COUNT(*) FILTER (WHERE active_time_sec >= 45 AND max_scroll_depth_pct >= 50)::int deep_engaged_sessions
  FROM rows
), by_ad AS (
  SELECT COALESCE(meta_ad_id,'unattributed') meta_ad_id,
    COUNT(*)::int sessions,
    COALESCE(AVG(active_time_sec),0)::numeric avg_active_time_sec,
    COALESCE(AVG(max_scroll_depth_pct),0)::numeric avg_scroll_depth_pct,
    COALESCE(AVG(total_clicks),0)::numeric avg_clicks,
    COUNT(*) FILTER (WHERE active_time_sec >= 20 OR max_scroll_depth_pct >= 50 OR interactive_clicks >= 1)::int engaged_sessions,
    COUNT(*) FILTER (WHERE active_time_sec >= 45 AND max_scroll_depth_pct >= 50)::int deep_engaged_sessions,
    COUNT(*) FILTER (WHERE offer_viewed)::int offer_sessions,
    COUNT(*) FILTER (WHERE guarantee_viewed)::int guarantee_sessions,
    COALESCE(SUM(cta_clicks),0)::int cta_clicks
  FROM rows GROUP BY COALESCE(meta_ad_id,'unattributed')
)
SELECT jsonb_build_object(
  'window_hours', p_window_hours,
  'page_path', p_page_path,
  'summary', to_jsonb(base),
  'by_ad', COALESCE((SELECT jsonb_agg(to_jsonb(by_ad) ORDER BY sessions DESC) FROM by_ad), '[]'::jsonb)
) FROM base;
$$;

CREATE OR REPLACE FUNCTION public.get_kryo_pdp_section_heatmap(
  p_page_path TEXT DEFAULT '/products/kryo2',
  p_window_hours INTEGER DEFAULT 24
) RETURNS JSONB
LANGUAGE sql STABLE AS $$
WITH rows AS (
  SELECT * FROM public.kryo_pdp_section_events
  WHERE page_path = p_page_path AND is_internal = FALSE
    AND ts >= NOW() - make_interval(hours => p_window_hours)
)
SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY reached_sessions DESC, section_id), '[]'::jsonb)
FROM (
  SELECT section_id,
    COUNT(DISTINCT session_id) FILTER (WHERE event_type='section_view')::int reached_sessions,
    COUNT(*) FILTER (WHERE event_type='click')::int clicks,
    COUNT(*) FILTER (WHERE event_type='dead_click')::int dead_clicks,
    COUNT(*) FILTER (WHERE event_type='rage_click')::int rage_clicks,
    COUNT(*) FILTER (WHERE event_type='scroll_abandon')::int scroll_abandons,
    COALESCE(AVG(scroll_depth_pct) FILTER (WHERE event_type='scroll_abandon'),0)::numeric avg_exit_depth_pct
  FROM rows GROUP BY section_id
) x;
$$;

CREATE OR REPLACE FUNCTION public.get_kryo_dct_asset_report(
  p_days INTEGER DEFAULT 7
) RETURNS JSONB
LANGUAGE sql STABLE AS $$
SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY spend DESC, impressions DESC), '[]'::jsonb)
FROM (
  SELECT meta_ad_id, element_type, stable_asset_id, asset_name, asset_image_hash, asset_preview_url,
    SUM(impressions)::int impressions, SUM(clicks)::int clicks, SUM(link_clicks)::int link_clicks,
    SUM(landing_page_views)::int landing_page_views, SUM(view_contents)::int view_contents,
    SUM(add_to_carts)::int add_to_carts, SUM(checkouts_started)::int checkouts_started,
    SUM(purchases)::int purchases, SUM(revenue)::numeric revenue, SUM(spend)::numeric spend,
    CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::numeric/SUM(impressions) END ctr,
    CASE WHEN SUM(link_clicks)>0 THEN SUM(landing_page_views)::numeric/SUM(link_clicks) END click_to_lpv_rate
  FROM public.meta_dce_metrics
  WHERE date >= CURRENT_DATE - make_interval(days => p_days)
    AND stable_asset_id IS NOT NULL
  GROUP BY meta_ad_id, element_type, stable_asset_id, asset_name, asset_image_hash, asset_preview_url
) x;
$$;

GRANT EXECUTE ON FUNCTION public.get_kryo_prepurchase_quality_report(TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kryo_pdp_section_heatmap(TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kryo_dct_asset_report(INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_kryo_pdp_session_quality(JSONB) TO anon, authenticated, service_role;
