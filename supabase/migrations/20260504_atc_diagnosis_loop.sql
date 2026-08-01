-- ATC Diagnosis Loop — Phase 1
-- Bridges per-section friction data to ICE-scored hypotheses so /launch-kryo-v2 can
-- pick a real bottleneck instead of a hardcoded angle. Adds 3 tables, 1 view, 4 RPCs.
-- Safe to re-run (all CREATE statements are IF NOT EXISTS / OR REPLACE).

-- ============================================================================
-- 1. clarity_section_events — raw per-click events from the storefront pixel
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.clarity_section_events (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id      TEXT NOT NULL,
  page_url        TEXT NOT NULL,
  section_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN ('click', 'rage_click', 'dead_click', 'scroll_abandon')),
  x_pct           NUMERIC,
  y_pct           NUMERIC,
  scroll_depth_pct NUMERIC,
  device_type     TEXT,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clarity_section_events_ts_url
  ON public.clarity_section_events (ts DESC, page_url);

CREATE INDEX IF NOT EXISTS idx_clarity_section_events_lp
  ON public.clarity_section_events (landing_page_id, ts DESC)
  WHERE landing_page_id IS NOT NULL;

COMMENT ON TABLE public.clarity_section_events IS
  'Raw section-level clicks from theme pixel. Aggregated nightly into clarity_section_heatmap. Closes the gap that Microsoft Clarity public Export API does not expose element-level data.';

-- ============================================================================
-- 2. clarity_section_heatmap — daily aggregates
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.clarity_section_heatmap (
  date              DATE NOT NULL,
  page_url          TEXT NOT NULL,
  section_id        TEXT NOT NULL,
  landing_page_id   UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  click_count       INT NOT NULL DEFAULT 0,
  rage_click_count  INT NOT NULL DEFAULT 0,
  dead_click_count  INT NOT NULL DEFAULT 0,
  scroll_abandon_count INT NOT NULL DEFAULT 0,
  unique_sessions   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (date, page_url, section_id)
);

COMMENT ON TABLE public.clarity_section_heatmap IS
  'Daily per-section friction aggregate. Source for funnel diagnosis and propose_lp_experiments(). Refreshed by compute_clarity_section_heatmap().';

-- ============================================================================
-- 3. compute_clarity_section_heatmap() — nightly aggregator
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_clarity_section_heatmap()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  rows_written INT;
BEGIN
  -- Aggregate yesterday + today (catches late events from previous day's sessions).
  WITH agg AS (
    SELECT
      ts::date                                                            AS date,
      page_url,
      section_id,
      MIN(landing_page_id) FILTER (WHERE landing_page_id IS NOT NULL)     AS landing_page_id,
      COUNT(*) FILTER (WHERE event_type = 'click')                        AS click_count,
      COUNT(*) FILTER (WHERE event_type = 'rage_click')                   AS rage_click_count,
      COUNT(*) FILTER (WHERE event_type = 'dead_click')                   AS dead_click_count,
      COUNT(*) FILTER (WHERE event_type = 'scroll_abandon')               AS scroll_abandon_count,
      COUNT(DISTINCT session_id)                                          AS unique_sessions
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
    landing_page_id      = EXCLUDED.landing_page_id,
    click_count          = EXCLUDED.click_count,
    rage_click_count     = EXCLUDED.rage_click_count,
    dead_click_count     = EXCLUDED.dead_click_count,
    scroll_abandon_count = EXCLUDED.scroll_abandon_count,
    unique_sessions      = EXCLUDED.unique_sessions;

  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$;

-- ============================================================================
-- 4. funnel_bottlenecks — per-LP funnel-step gap vs benchmark
--    Benchmarks (Shopify product pages, source: industry medians):
--      ATC rate              ≥ 8% of sessions
--      Checkout-init rate    ≥ 60% of ATC
--      Purchase rate         ≥ 50% of checkout-init
--    Below sessions=50 over the window we report 'insufficient_data' rather
--    than ranking everything as an emergency.
-- ============================================================================
CREATE OR REPLACE VIEW public.funnel_bottlenecks AS
WITH lp_30d AS (
  SELECT
    f.landing_page_id,
    SUM(f.sessions)            AS sessions,
    SUM(f.add_to_carts)        AS atc,
    SUM(f.checkouts_started)   AS checkouts,
    SUM(f.orders)              AS orders
  FROM public.lp_funnel_daily f
  WHERE f.date >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY f.landing_page_id
),
steps AS (
  SELECT lp.landing_page_id, lp.sessions, lp.atc, lp.checkouts, lp.orders,
         'add_to_cart'::text                                   AS funnel_step,
         CASE WHEN lp.sessions >= 50
              THEN lp.atc::numeric / NULLIF(lp.sessions, 0)
              ELSE NULL END                                    AS actual_rate,
         0.08::numeric                                         AS benchmark_rate
  FROM lp_30d lp
  UNION ALL
  SELECT lp.landing_page_id, lp.sessions, lp.atc, lp.checkouts, lp.orders,
         'checkout_init',
         CASE WHEN lp.atc >= 10
              THEN lp.checkouts::numeric / NULLIF(lp.atc, 0)
              ELSE NULL END,
         0.60
  FROM lp_30d lp
  UNION ALL
  SELECT lp.landing_page_id, lp.sessions, lp.atc, lp.checkouts, lp.orders,
         'purchase',
         CASE WHEN lp.checkouts >= 5
              THEN lp.orders::numeric / NULLIF(lp.checkouts, 0)
              ELSE NULL END,
         0.50
  FROM lp_30d lp
)
SELECT
  s.landing_page_id,
  lp.name                                                                    AS lp_name,
  lp.shopify_url,
  s.sessions                                                                 AS sessions_30d,
  s.funnel_step,
  s.actual_rate,
  s.benchmark_rate,
  CASE WHEN s.actual_rate IS NULL THEN NULL
       ELSE (s.benchmark_rate - s.actual_rate)
  END                                                                        AS gap_absolute,
  CASE WHEN s.actual_rate IS NULL OR s.benchmark_rate = 0 THEN NULL
       ELSE ((s.benchmark_rate - s.actual_rate) / s.benchmark_rate) * 100.0
  END                                                                        AS gap_pct_below_benchmark,
  CASE WHEN s.actual_rate IS NULL THEN 'insufficient_data'
       WHEN s.actual_rate >= s.benchmark_rate THEN 'on_target'
       WHEN s.actual_rate >= s.benchmark_rate * 0.75 THEN 'mild_gap'
       WHEN s.actual_rate >= s.benchmark_rate * 0.50 THEN 'significant_gap'
       ELSE 'critical_gap'
  END                                                                        AS gap_state
FROM steps s
JOIN public.landing_pages lp ON lp.id = s.landing_page_id
WHERE lp.product_line IS NOT NULL
ORDER BY
  s.landing_page_id,
  CASE s.funnel_step WHEN 'add_to_cart' THEN 1 WHEN 'checkout_init' THEN 2 WHEN 'purchase' THEN 3 END;

COMMENT ON VIEW public.funnel_bottlenecks IS
  'Per-landing-page funnel-step gap vs industry benchmark (ATC 8%, checkout 60% of ATC, purchase 50% of checkout). Read by ICE Matrix dashboard tab and propose_lp_experiments(). Steps with <50 sessions return insufficient_data.';

-- ============================================================================
-- 5. compute_ice_score — turns hypothesis parameters into ICE score
--    Returns JSONB: { impact, confidence, ease, score }
--    impact      = (estimated_lift_pct / 100) * traffic_pct * downstream_multiplier
--                  Downstream multipliers reflect funnel position: ATC fix lifts
--                  every step downstream, so 1.0; checkout fix only lifts purchase, 0.6;
--                  purchase fix only lifts purchase, 0.4.
--    confidence  = priors lookup from hypothesis_learnings (defaulted 0.6 until 3+
--                  outcomes for this funnel_step exist).
--    ease        = client-supplied 1-10 (10 = 'add 2 images', 1 = 'rebuild checkout').
--    score       = impact * confidence * ease * 10  (rescaled so a typical 'good' test
--                  scores 100-300, easy to eyeball).
-- ============================================================================
-- Returns 1-10 scale ints to match marketing_experiments.ice_* columns
-- (ice_score on that table is GENERATED as (impact*confidence*ease)::numeric/10).
-- Raw lift % and 0..1 confidence preserved in the JSON for debugging.
CREATE OR REPLACE FUNCTION public.compute_ice_score(
  p_funnel_step          TEXT,
  p_baseline_value       NUMERIC,
  p_estimated_lift_pct   NUMERIC,
  p_traffic_pct          NUMERIC DEFAULT 100,
  p_implementation_ease  INT     DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_downstream_multiplier NUMERIC;
  v_raw_impact            NUMERIC;
  v_raw_confidence        NUMERIC;
  v_impact_int            INT;
  v_confidence_int        INT;
  v_ease_int              INT;
  v_score                 NUMERIC;
  v_outcomes              INT;
BEGIN
  v_downstream_multiplier := CASE p_funnel_step
    WHEN 'add_to_cart'   THEN 1.0
    WHEN 'checkout_init' THEN 0.6
    WHEN 'purchase'      THEN 0.4
    ELSE 0.5
  END;

  v_raw_impact := COALESCE(p_estimated_lift_pct, 0)
                  * COALESCE(p_traffic_pct, 100) / 100.0
                  * v_downstream_multiplier;

  v_impact_int := CASE
    WHEN v_raw_impact <  2  THEN 1
    WHEN v_raw_impact <  5  THEN 2
    WHEN v_raw_impact < 10  THEN 3
    WHEN v_raw_impact < 15  THEN 4
    WHEN v_raw_impact < 20  THEN 5
    WHEN v_raw_impact < 30  THEN 6
    WHEN v_raw_impact < 40  THEN 7
    WHEN v_raw_impact < 55  THEN 8
    WHEN v_raw_impact < 75  THEN 9
    ELSE 10
  END;

  SELECT COUNT(*) INTO v_outcomes
  FROM public.hypothesis_learnings hl
  JOIN public.marketing_experiments e ON e.id = hl.experiment_id
  WHERE e.target_metric = p_funnel_step
    AND hl.actual_lift_pct IS NOT NULL;

  IF v_outcomes >= 3 THEN
    SELECT GREATEST(0.3, LEAST(0.95,
      0.5 + AVG(CASE WHEN hl.actual_lift_pct >= hl.predicted_lift_pct * 0.5 THEN 0.1 ELSE -0.1 END)
    ))
    INTO v_raw_confidence
    FROM public.hypothesis_learnings hl
    JOIN public.marketing_experiments e ON e.id = hl.experiment_id
    WHERE e.target_metric = p_funnel_step
      AND hl.actual_lift_pct IS NOT NULL;
  ELSE
    v_raw_confidence := 0.6;
  END IF;

  v_confidence_int := GREATEST(1, LEAST(10, ROUND(v_raw_confidence * 10)::int));
  v_ease_int := GREATEST(1, LEAST(10, COALESCE(p_implementation_ease, 5)));
  v_score := (v_impact_int * v_confidence_int * v_ease_int)::numeric / 10.0;

  RETURN jsonb_build_object(
    'impact',         v_impact_int,
    'confidence',     v_confidence_int,
    'ease',           v_ease_int,
    'score',          ROUND(v_score, 2),
    'raw_lift_pct',   ROUND(v_raw_impact, 2),
    'raw_confidence', ROUND(v_raw_confidence, 2),
    'priors_n',       v_outcomes
  );
END;
$$;

COMMENT ON FUNCTION public.compute_ice_score(TEXT, NUMERIC, NUMERIC, NUMERIC, INT) IS
  'ICE scoring (Impact x Confidence x Ease) for a hypothesis. Confidence priors auto-tune from hypothesis_learnings once 3+ outcomes exist for the funnel step. Used by /launch-kryo-v2 step 1.8 and propose_lp_experiments.';

-- ============================================================================
-- 6. hypothesis_learnings + record_hypothesis_outcome
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hypothesis_learnings (
  id                          BIGSERIAL PRIMARY KEY,
  experiment_id               UUID NOT NULL REFERENCES public.marketing_experiments(id) ON DELETE CASCADE,
  predicted_lift_pct          NUMERIC,
  actual_lift_pct             NUMERIC,
  confidence_calibration_delta NUMERIC,
  source_insights             JSONB,
  notes                       TEXT,
  recorded_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypothesis_learnings_exp
  ON public.hypothesis_learnings (experiment_id);

COMMENT ON TABLE public.hypothesis_learnings IS
  'Predicted vs actual lift after experiments close. Feeds ICE confidence priors. Initially empty; populated as marketing_experiments transition to status=completed.';

CREATE OR REPLACE FUNCTION public.record_hypothesis_outcome(p_experiment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_predicted NUMERIC;
  v_actual    NUMERIC;
  v_id        BIGINT;
BEGIN
  SELECT expected_lift_pct, lift_percent
  INTO v_predicted, v_actual
  FROM public.marketing_experiments
  WHERE id = p_experiment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'experiment % not found', p_experiment_id;
  END IF;

  INSERT INTO public.hypothesis_learnings (
    experiment_id, predicted_lift_pct, actual_lift_pct,
    confidence_calibration_delta, recorded_at
  )
  VALUES (
    p_experiment_id,
    v_predicted,
    v_actual,
    CASE WHEN v_predicted IS NULL OR v_predicted = 0 THEN NULL
         ELSE (v_actual - v_predicted) / v_predicted END,
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN p_experiment_id;
END;
$$;

COMMENT ON FUNCTION public.record_hypothesis_outcome(UUID) IS
  'Snapshot an experiment outcome into hypothesis_learnings. Call when an experiment status transitions to completed.';

-- ============================================================================
-- 7. propose_lp_experiments — top-5 ICE-scored LP hypotheses
--    Combines:
--      a) friction sections from clarity_section_heatmap (recent 7 days, sessions >= 100 site-wide)
--      b) funnel-step bottlenecks from funnel_bottlenecks (gap_state in critical/significant)
--      c) heuristic copy templates per (funnel_step, friction_pattern)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.propose_lp_experiments()
RETURNS TABLE (
  rank                INT,
  funnel_step         TEXT,
  hypothesis          TEXT,
  source_section_id   TEXT,
  source_page_url     TEXT,
  rage_click_count    INT,
  estimated_lift_pct  NUMERIC,
  implementation_ease INT,
  ice                 JSONB,
  ice_score           NUMERIC,
  suggested_angle     TEXT,
  evidence            JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_sessions INT;
BEGIN
  SELECT COALESCE(SUM(unique_sessions), 0) INTO v_total_sessions
  FROM public.clarity_section_heatmap
  WHERE date >= CURRENT_DATE - INTERVAL '7 days';

  RETURN QUERY
  WITH friction AS (
    SELECT
      h.section_id,
      h.page_url,
      SUM(h.rage_click_count)                                                AS rage,
      SUM(h.click_count)                                                     AS clicks,
      SUM(h.unique_sessions)                                                 AS sessions,
      CASE WHEN SUM(h.unique_sessions) > 0
           THEN SUM(h.rage_click_count)::numeric / SUM(h.unique_sessions)
           ELSE 0 END                                                        AS rage_per_session
    FROM public.clarity_section_heatmap h
    WHERE h.date >= CURRENT_DATE - INTERVAL '7 days'
      AND h.unique_sessions > 0
    GROUP BY h.section_id, h.page_url
    HAVING SUM(h.unique_sessions) >= 20
  ),
  bottleneck_atc AS (
    SELECT
      fb.shopify_url,
      fb.actual_rate,
      fb.gap_pct_below_benchmark,
      fb.sessions_30d
    FROM public.funnel_bottlenecks fb
    WHERE fb.funnel_step = 'add_to_cart'
      AND fb.gap_state IN ('critical_gap', 'significant_gap', 'mild_gap')
    ORDER BY fb.gap_pct_below_benchmark DESC NULLS LAST
    LIMIT 1
  ),
  hypotheses AS (
    -- Friction-driven hypotheses (rage clicks → likely confusion → variant adds clarity)
    SELECT
      'add_to_cart'::text                                                    AS funnel_step,
      CASE
        WHEN f.section_id ILIKE '%faq%'      THEN 'FAQ section is collecting rage clicks. Add inline setup-process imagery + electrical-safety badge above the FAQ to answer the questions before they need to scroll.'
        WHEN f.section_id ILIKE '%spec%'     THEN 'Specs section is collecting rage clicks. Add a plain-English summary card with the 3 most-asked specs (size, power, water source) above the technical table.'
        WHEN f.section_id ILIKE '%hero%'     THEN 'Hero section is collecting rage clicks. Tighten the value prop in the headline + sub, add a primary CTA above the fold, remove competing links.'
        WHEN f.section_id ILIKE '%price%'
          OR f.section_id ILIKE '%cost%'     THEN 'Price section is collecting rage clicks. Add price-anchor (vs commercial cold plunge / vs ice baths / vs gym membership) and what is included in the AED 3,990 starting price.'
        WHEN f.section_id ILIKE '%shipping%' THEN 'Shipping section is collecting rage clicks. Add a region-aware shipping ETA + cost calculator (or at least a clear UAE / international shipping table).'
        ELSE 'Section "' || f.section_id || '" is collecting rage clicks. Audit the copy + add a clarifying visual or proof element directly inside that section.'
      END                                                                    AS hypothesis,
      f.section_id                                                           AS source_section_id,
      f.page_url                                                             AS source_page_url,
      f.rage::int                                                            AS rage_click_count,
      CASE
        WHEN f.section_id ILIKE '%faq%'      THEN 18.0
        WHEN f.section_id ILIKE '%spec%'     THEN 12.0
        WHEN f.section_id ILIKE '%hero%'     THEN 25.0
        WHEN f.section_id ILIKE '%price%'    THEN 15.0
        ELSE 10.0
      END                                                                    AS estimated_lift_pct,
      CASE
        WHEN f.section_id ILIKE '%faq%'      THEN 8
        WHEN f.section_id ILIKE '%spec%'     THEN 7
        WHEN f.section_id ILIKE '%hero%'     THEN 6
        WHEN f.section_id ILIKE '%price%'    THEN 7
        ELSE 6
      END                                                                    AS implementation_ease,
      CASE
        WHEN f.section_id ILIKE '%faq%'      THEN 'setup_clarity'
        WHEN f.section_id ILIKE '%spec%'     THEN 'science_authority'
        WHEN f.section_id ILIKE '%hero%'     THEN 'morning_energy'
        WHEN f.section_id ILIKE '%price%'    THEN 'value_anchor'
        ELSE 'morning_energy'
      END                                                                    AS suggested_angle,
      jsonb_build_object(
        'source',         'clarity_section_heatmap',
        'rage_clicks_7d', f.rage,
        'sessions_7d',    f.sessions,
        'rage_per_session', ROUND(f.rage_per_session, 4),
        'page_url',       f.page_url
      )                                                                      AS evidence
    FROM friction f
    WHERE f.rage > 0

    UNION ALL

    -- Funnel-step-driven hypothesis (only emitted when ATC has a real gap)
    SELECT
      'add_to_cart',
      'ATC is ' || ROUND(b.gap_pct_below_benchmark, 0)::text || '% below 8% benchmark. Test a sticky CTA + trust signals (UL/CE badge, 30-day return, support contact) above the fold to reduce purchase hesitation.',
      NULL,
      b.shopify_url,
      0,
      20.0,
      7,
      'value_anchor',
      jsonb_build_object(
        'source',                'funnel_bottlenecks',
        'actual_atc_rate',       b.actual_rate,
        'benchmark_atc_rate',    0.08,
        'gap_pct',               b.gap_pct_below_benchmark,
        'sessions_30d',          b.sessions_30d
      )
    FROM bottleneck_atc b
  ),
  scored AS (
    SELECT
      h.*,
      public.compute_ice_score(h.funnel_step, NULL, h.estimated_lift_pct, 100, h.implementation_ease) AS ice
    FROM hypotheses h
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY (s.ice->>'score')::numeric DESC NULLS LAST)::int AS rank,
    s.funnel_step,
    s.hypothesis,
    s.source_section_id,
    s.source_page_url,
    s.rage_click_count,
    s.estimated_lift_pct,
    s.implementation_ease,
    s.ice,
    (s.ice->>'score')::numeric                                               AS ice_score,
    s.suggested_angle,
    s.evidence
  FROM scored s
  ORDER BY ice_score DESC NULLS LAST
  LIMIT 5;
END;
$$;

COMMENT ON FUNCTION public.propose_lp_experiments() IS
  'Top-5 ICE-scored LP hypotheses derived from clarity_section_heatmap (last 7d) + funnel_bottlenecks. Source for the ICE Matrix dashboard tab and /launch-kryo-v2 setup_clarity angle.';
