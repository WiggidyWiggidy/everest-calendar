-- Test Velocity Layer — Phase 2 of ATC Diagnosis Loop
-- Surfaces "how many tests are running this week" as the north-star metric.
-- Adds:
--   - View experiment_velocity_weekly (per-week count of started + completed)
--   - View creative_velocity_weekly (per-week count of new ad_creatives)
--   - RPC get_test_velocity() — single JSON payload for the dashboard top panel
-- All re-runnable.

-- ============================================================================
-- 1. experiment_velocity_weekly — per ISO week
-- ============================================================================
CREATE OR REPLACE VIEW public.experiment_velocity_weekly AS
WITH weeks AS (
  SELECT generate_series(
    DATE_TRUNC('week', CURRENT_DATE - INTERVAL '12 weeks')::date,
    DATE_TRUNC('week', CURRENT_DATE)::date,
    INTERVAL '1 week'
  )::date AS week_start
),
started AS (
  SELECT DATE_TRUNC('week', start_date)::date AS week_start, count(*) AS n_started
  FROM public.marketing_experiments
  WHERE start_date IS NOT NULL
    AND start_date >= CURRENT_DATE - INTERVAL '12 weeks'
  GROUP BY 1
),
completed AS (
  SELECT DATE_TRUNC('week', end_date)::date AS week_start, count(*) AS n_completed
  FROM public.marketing_experiments
  WHERE end_date IS NOT NULL
    AND end_date >= CURRENT_DATE - INTERVAL '12 weeks'
    AND status = 'completed'
  GROUP BY 1
),
decided AS (
  -- Tests that closed with a real verdict (winner or loser, not inconclusive/archived)
  SELECT DATE_TRUNC('week', end_date)::date AS week_start, count(*) AS n_decided
  FROM public.marketing_experiments
  WHERE end_date IS NOT NULL
    AND end_date >= CURRENT_DATE - INTERVAL '12 weeks'
    AND result IN ('winner', 'loser')
  GROUP BY 1
)
SELECT
  w.week_start,
  COALESCE(s.n_started, 0)   AS n_started,
  COALESCE(c.n_completed, 0) AS n_completed,
  COALESCE(d.n_decided, 0)   AS n_decided,
  CASE WHEN COALESCE(c.n_completed, 0) > 0
       THEN ROUND(COALESCE(d.n_decided, 0)::numeric / c.n_completed, 2)
       ELSE NULL END         AS decision_rate
FROM weeks w
LEFT JOIN started   s ON s.week_start = w.week_start
LEFT JOIN completed c ON c.week_start = w.week_start
LEFT JOIN decided   d ON d.week_start = w.week_start
ORDER BY w.week_start DESC;

COMMENT ON VIEW public.experiment_velocity_weekly IS
  'Last 12 ISO weeks of experiment velocity: started, completed, decided (winner|loser). decision_rate = decided/completed flags inconclusive leak (signal that significance threshold or sample size is wrong).';

-- ============================================================================
-- 2. creative_velocity_weekly — fresh ad_creatives per week
-- ============================================================================
CREATE OR REPLACE VIEW public.creative_velocity_weekly AS
WITH weeks AS (
  SELECT generate_series(
    DATE_TRUNC('week', CURRENT_DATE - INTERVAL '12 weeks')::date,
    DATE_TRUNC('week', CURRENT_DATE)::date,
    INTERVAL '1 week'
  )::date AS week_start
),
created AS (
  SELECT DATE_TRUNC('week', created_at)::date AS week_start,
         count(*)                              AS n_created,
         count(*) FILTER (WHERE meta_ad_id IS NOT NULL) AS n_promoted
  FROM public.ad_creatives
  WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
  GROUP BY 1
)
SELECT
  w.week_start,
  COALESCE(c.n_created, 0)  AS n_created,
  COALESCE(c.n_promoted, 0) AS n_promoted_to_meta
FROM weeks w
LEFT JOIN created c ON c.week_start = w.week_start
ORDER BY w.week_start DESC;

COMMENT ON VIEW public.creative_velocity_weekly IS
  'Per-week ad_creatives created vs promoted (linked to a live meta_ad_id). Promotion lag = creative drafted but never lit up a Meta ad.';

-- ============================================================================
-- 3. get_test_velocity() — one JSON payload for the dashboard
-- Default weekly target = 5 (tunable later). Compares this-week vs prior 4w avg.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_test_velocity(p_weekly_target INT DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_this_week_start  DATE := DATE_TRUNC('week', CURRENT_DATE)::date;
  v_started_this_week INT;
  v_completed_this_week INT;
  v_decided_this_week INT;
  v_avg_started_prior4w NUMERIC;
  v_creatives_this_week INT;
  v_creatives_prior4w_avg NUMERIC;
BEGIN
  SELECT COALESCE(SUM(n_started), 0),
         COALESCE(SUM(n_completed), 0),
         COALESCE(SUM(n_decided), 0)
  INTO v_started_this_week, v_completed_this_week, v_decided_this_week
  FROM public.experiment_velocity_weekly
  WHERE week_start = v_this_week_start;

  SELECT COALESCE(AVG(n_started), 0)::numeric
  INTO v_avg_started_prior4w
  FROM public.experiment_velocity_weekly
  WHERE week_start <  v_this_week_start
    AND week_start >= v_this_week_start - INTERVAL '4 weeks';

  SELECT COALESCE(SUM(n_created), 0)
  INTO v_creatives_this_week
  FROM public.creative_velocity_weekly
  WHERE week_start = v_this_week_start;

  SELECT COALESCE(AVG(n_created), 0)::numeric
  INTO v_creatives_prior4w_avg
  FROM public.creative_velocity_weekly
  WHERE week_start <  v_this_week_start
    AND week_start >= v_this_week_start - INTERVAL '4 weeks';

  RETURN jsonb_build_object(
    'week_start',                  v_this_week_start,
    'tests_started_this_week',     v_started_this_week,
    'tests_completed_this_week',   v_completed_this_week,
    'tests_decided_this_week',     v_decided_this_week,
    'tests_started_prior4w_avg',   ROUND(v_avg_started_prior4w, 1),
    'creatives_this_week',         v_creatives_this_week,
    'creatives_prior4w_avg',       ROUND(v_creatives_prior4w_avg, 1),
    'weekly_target',               p_weekly_target,
    'on_pace',                     v_started_this_week >= p_weekly_target,
    'gap_to_target',               GREATEST(0, p_weekly_target - v_started_this_week),
    'history',                     (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'week_start',   week_start,
        'n_started',    n_started,
        'n_completed',  n_completed,
        'n_decided',    n_decided
      ) ORDER BY week_start), '[]'::jsonb)
      FROM public.experiment_velocity_weekly
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_test_velocity(INT) IS
  'Single-JSON velocity report for the ICE Matrix dashboard top panel. Tests started/completed/decided this week vs prior 4w avg, plus 12w history sparkline payload, plus on_pace flag against weekly_target (default 5).';
