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
      (MAX(landing_page_id::text) FILTER (WHERE landing_page_id IS NOT NULL))::uuid AS landing_page_id,
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
