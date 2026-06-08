-- KRYO2 clean Clarity unlock
-- 1) broaden attribution event types for KRYO2 control/cart/scroll events
-- 2) ensure section-level friction tables + aggregator exist for live theme telemetry

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.attribution_touches'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.attribution_touches DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.attribution_touches
  ADD CONSTRAINT attribution_touches_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'session_start','page_view','product_view','add_to_cart','checkout_start','order_placed',
    'cart_add_request','cart_add_failed','cart_view','cart_checkout_click','cart_remove_item',
    'cart_quantity_change','cart_exit_without_checkout','checkout_error',
    'hero_cta_click','sticky_cta_click','whatsapp_click','shopify_inbox_click','chatway_click',
    'compatibility_cta_click','installation_faq_open','hose_connection_faq_open',
    'delivery_faq_open','returns_faq_open','comparison_section_view','reviews_section_view','offer_section_view',
    'guarantee_section_view','scroll_depth_25','scroll_depth_50','scroll_depth_75','scroll_depth_90'
  ]));

CREATE TABLE IF NOT EXISTS public.clarity_section_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  section_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'rage_click', 'dead_click', 'scroll_abandon')),
  x_pct NUMERIC,
  y_pct NUMERIC,
  scroll_depth_pct NUMERIC,
  device_type TEXT,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clarity_section_events_ts_url
  ON public.clarity_section_events (ts DESC, page_url);

CREATE INDEX IF NOT EXISTS idx_clarity_section_events_lp
  ON public.clarity_section_events (landing_page_id, ts DESC)
  WHERE landing_page_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.clarity_section_heatmap (
  date DATE NOT NULL,
  page_url TEXT NOT NULL,
  section_id TEXT NOT NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  click_count INT NOT NULL DEFAULT 0,
  rage_click_count INT NOT NULL DEFAULT 0,
  dead_click_count INT NOT NULL DEFAULT 0,
  scroll_abandon_count INT NOT NULL DEFAULT 0,
  unique_sessions INT NOT NULL DEFAULT 0,
  PRIMARY KEY (date, page_url, section_id)
);

CREATE OR REPLACE FUNCTION public.compute_clarity_section_heatmap()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  rows_written INT;
BEGIN
  WITH agg AS (
    SELECT
      ts::date AS date,
      page_url,
      section_id,
      MIN(landing_page_id) FILTER (WHERE landing_page_id IS NOT NULL) AS landing_page_id,
      COUNT(*) FILTER (WHERE event_type = 'click') AS click_count,
      COUNT(*) FILTER (WHERE event_type = 'rage_click') AS rage_click_count,
      COUNT(*) FILTER (WHERE event_type = 'dead_click') AS dead_click_count,
      COUNT(*) FILTER (WHERE event_type = 'scroll_abandon') AS scroll_abandon_count,
      COUNT(DISTINCT session_id) AS unique_sessions
    FROM public.clarity_section_events
    WHERE ts::date >= CURRENT_DATE - INTERVAL '2 days'
    GROUP BY ts::date, page_url, section_id
  )
  INSERT INTO public.clarity_section_heatmap (
    date, page_url, section_id, landing_page_id,
    click_count, rage_click_count, dead_click_count, scroll_abandon_count, unique_sessions
  )
  SELECT * FROM agg
  ON CONFLICT (date, page_url, section_id) DO UPDATE SET
    landing_page_id = EXCLUDED.landing_page_id,
    click_count = EXCLUDED.click_count,
    rage_click_count = EXCLUDED.rage_click_count,
    dead_click_count = EXCLUDED.dead_click_count,
    scroll_abandon_count = EXCLUDED.scroll_abandon_count,
    unique_sessions = EXCLUDED.unique_sessions;

  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_clarity_section_heatmap() TO anon, authenticated, service_role;
