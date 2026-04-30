-- get_kryo_test_proposals(): hypothesis-ranking RPC for autonomous KRYO marketing.
--
-- The /launch-kryo skill calls this to identify the next 3 A/B test angles.
-- Reads 90-day data from marketing_metrics_daily + ad_metrics_daily + landing_pages.
-- Returns top winning audience × headline-angle × image-style combos plus underexplored gaps.
--
-- The skill (running on Tom's free Claude Max OAuth) reads the result and picks 3 to test.
-- No stats library needed — LLM reasoning over the rows.

CREATE OR REPLACE FUNCTION public.get_kryo_test_proposals(p_days INT DEFAULT 90)
RETURNS TABLE (
  rank_position    INT,
  source           TEXT,           -- 'winner' | 'gap'
  audience_geo     TEXT,
  audience_age_min INT,
  audience_age_max INT,
  audience_interests TEXT,
  headline_angle   TEXT,           -- best-guess clustering of historical headlines
  image_style      TEXT,           -- best-guess clustering of image refs (lifestyle / studio / detail)
  ads_count        INT,
  total_spend      NUMERIC,
  total_impressions BIGINT,
  total_clicks     INT,
  ctr_pct          NUMERIC,
  cpc_usd          NUMERIC,
  total_purchases  INT,
  total_revenue    NUMERIC,
  roas             NUMERIC,
  hypothesis       TEXT,
  expected_lift_pct INT,
  confidence       NUMERIC          -- 0–1 (impressions-weighted)
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_min_date DATE := (NOW() - (p_days || ' days')::INTERVAL)::DATE;
BEGIN
  RETURN QUERY
  WITH raw_ads AS (
    SELECT
      ac.id            AS ad_id,
      ac.headline,
      ac.body_copy,
      ac.target_audience,
      ac.composite_image_url,
      COALESCE(amd.impressions, 0)::BIGINT AS impressions,
      COALESCE(amd.clicks, 0)::INT          AS clicks,
      COALESCE(amd.spend, 0)::NUMERIC       AS spend,
      COALESCE(amd.purchases, 0)::INT       AS purchases,
      COALESCE(amd.revenue, 0)::NUMERIC     AS revenue,
      amd.date
    FROM ad_creatives ac
    LEFT JOIN ad_metrics_daily amd ON amd.ad_creative_id = ac.id
    WHERE amd.date IS NULL OR amd.date >= v_min_date
  ),
  classified AS (
    SELECT
      ad_id,
      COALESCE(target_audience->'geo_locations'->'countries'->>0, 'unknown') AS geo,
      COALESCE((target_audience->>'age_min')::INT, 25)                       AS age_min,
      COALESCE((target_audience->>'age_max')::INT, 55)                       AS age_max,
      COALESCE((SELECT string_agg(value->>'name', '|') FROM jsonb_array_elements(target_audience->'interests')), '') AS interests,
      CASE
        WHEN headline ~* 'morning|wake|sleep|brain fog|dopamine' THEN 'morning_energy'
        WHEN headline ~* 'gym|recover|athlete|workout|train'      THEN 'athlete_recovery'
        WHEN headline ~* 'luxury|villa|premium|exclusive|investment' THEN 'luxury_upgrade'
        WHEN headline ~* 'price|cost|invest|cheaper|once'         THEN 'value_anchor'
        WHEN headline ~* 'science|stud(y|ies)|huberman|attia'      THEN 'science_authority'
        ELSE 'unclassified'
      END AS angle,
      CASE
        WHEN composite_image_url ILIKE '%lifestyle%' OR composite_image_url ILIKE '%bathroom%' THEN 'lifestyle'
        WHEN composite_image_url ILIKE '%studio%' OR composite_image_url ILIKE '%product%'    THEN 'studio'
        WHEN composite_image_url ILIKE '%detail%' OR composite_image_url ILIKE '%spec%'        THEN 'detail'
        WHEN composite_image_url IS NULL                                                       THEN 'no_image'
        ELSE 'other'
      END AS img_style,
      impressions, clicks, spend, purchases, revenue
    FROM raw_ads
  ),
  agg AS (
    SELECT
      geo, age_min, age_max, interests, angle, img_style,
      COUNT(DISTINCT ad_id)::INT AS ads_n,
      SUM(impressions)::BIGINT   AS imps,
      SUM(clicks)::INT           AS clks,
      SUM(spend)::NUMERIC        AS spend_total,
      SUM(purchases)::INT        AS purch,
      SUM(revenue)::NUMERIC      AS rev_total
    FROM classified
    GROUP BY geo, age_min, age_max, interests, angle, img_style
  ),
  scored AS (
    SELECT
      *,
      CASE WHEN imps > 0 THEN ROUND((clks::NUMERIC / imps) * 100, 3) ELSE 0 END AS ctr,
      CASE WHEN clks > 0 THEN ROUND(spend_total / clks, 2) ELSE 0 END             AS cpc,
      CASE WHEN spend_total > 0 THEN ROUND(rev_total / spend_total, 2) ELSE 0 END AS roas_v,
      LEAST(1.0, GREATEST(0.0, imps::NUMERIC / 10000.0))                          AS conf
    FROM agg
  ),
  winners AS (
    SELECT
      'winner'::TEXT AS source,
      ROW_NUMBER() OVER (ORDER BY roas_v DESC, purch DESC, ctr DESC) AS rn,
      geo, age_min, age_max, interests, angle, img_style,
      ads_n, spend_total, imps, clks, ctr, cpc, purch, rev_total, roas_v, conf,
      ('Replicate this winner: ' || angle || ' angle to '
       || geo || ' (age ' || age_min || '–' || age_max || '), '
       || img_style || ' imagery. Achieved '
       || ROUND(ctr,2) || '%% CTR and '
       || ROUND(roas_v,2) || 'x ROAS over ' || imps || ' impressions.')::TEXT AS hyp,
      LEAST(50, GREATEST(5, ROUND(roas_v * 5)::INT)) AS lift
    FROM scored
    WHERE imps > 0 AND roas_v > 0
  ),
  gaps AS (
    -- Underexplored: low impression count but classified angle/img — worth testing
    SELECT
      'gap'::TEXT AS source,
      ROW_NUMBER() OVER (ORDER BY conf ASC, rev_total DESC) AS rn,
      geo, age_min, age_max, interests, angle, img_style,
      ads_n, spend_total, imps, clks, ctr, cpc, purch, rev_total, roas_v, conf,
      ('Underexplored combo: ' || angle || ' angle × ' || img_style
       || ' imagery in ' || geo || '. Only ' || imps || ' impressions to date — worth a controlled A/B vs. control.')::TEXT AS hyp,
      15 AS lift
    FROM scored
    WHERE imps < 5000 AND angle != 'unclassified' AND img_style != 'no_image'
  )
  SELECT rn::INT, source, geo, age_min, age_max, interests, angle, img_style, ads_n, spend_total, imps, clks, ctr, cpc, purch, rev_total, roas_v, hyp, lift, conf
  FROM winners
  WHERE rn <= 5
  UNION ALL
  SELECT rn::INT, source, geo, age_min, age_max, interests, angle, img_style, ads_n, spend_total, imps, clks, ctr, cpc, purch, rev_total, roas_v, hyp, lift, conf
  FROM gaps
  WHERE rn <= 5
  ORDER BY source DESC, rank_position ASC;  -- winners first
END;
$$;

COMMENT ON FUNCTION public.get_kryo_test_proposals(INT) IS
  'Hypothesis ranking for /launch-kryo skill. Returns top 5 winners + top 5 gaps over the last N days, classified by audience × angle × image style. The skill picks 3 to test next.';

GRANT EXECUTE ON FUNCTION public.get_kryo_test_proposals(INT) TO service_role, authenticated;
