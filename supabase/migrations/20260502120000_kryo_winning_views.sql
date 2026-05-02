-- 4 winning-data views for the KRYO Kimi-stack /launch-kryo-v2 generation flow.
-- Writers (Hero/Benefits/SocialProof/FAQ agents) read these views ONLY — no raw-table joins.
-- Window: rolling 90 days. Empty results when underlying data is sparse — that is OK and load-bearing
-- (writers fall back to product_context.kryo_v4_canonical defaults when a view returns no rows).

------------------------------------------------------------------------------------------------
-- 1. vw_winning_products — top product by revenue/orders/AOV, 90-day window
--    Source: lp_funnel_daily aggregated up via landing_pages.product_line/family
------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_winning_products AS
SELECT
  lp.product_line,
  lp.product_family,
  COALESCE(SUM(f.revenue), 0)                                        AS revenue_90d,
  COALESCE(SUM(f.orders), 0)                                         AS orders_90d,
  CASE WHEN COALESCE(SUM(f.orders), 0) > 0
       THEN COALESCE(SUM(f.revenue), 0) / SUM(f.orders)
       ELSE NULL END                                                 AS aov_90d,
  COALESCE(SUM(f.sessions), 0)                                       AS sessions_90d,
  CASE WHEN COALESCE(SUM(f.sessions), 0) > 0
       THEN COALESCE(SUM(f.orders), 0)::numeric / SUM(f.sessions)
       ELSE NULL END                                                 AS conversion_rate_90d,
  COUNT(DISTINCT lp.id)                                              AS variants_tested
FROM public.landing_pages lp
LEFT JOIN public.lp_funnel_daily f
  ON f.landing_page_id = lp.id
 AND f.date >= (CURRENT_DATE - INTERVAL '90 days')
WHERE lp.product_line IS NOT NULL
GROUP BY lp.product_line, lp.product_family
ORDER BY revenue_90d DESC NULLS LAST, orders_90d DESC NULLS LAST;

COMMENT ON VIEW public.vw_winning_products IS
  'Top product by revenue/orders/AOV (90d window). Reads from landing_pages + lp_funnel_daily. Read by writer agents in /launch-kryo-v2.';

------------------------------------------------------------------------------------------------
-- 2. vw_winning_creatives — top creative by ROAS per angle/hook/cta/image_style, 90-day window
--    Source: ad_creatives joined to meta_ad_metrics_daily via meta_ad_id (real Meta perf data).
--    Future: when ad_metrics_daily is populated, view can be re-pointed to channel-agnostic source.
------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_winning_creatives AS
WITH meta_perf AS (
  SELECT
    m.meta_ad_id,
    SUM(m.spend)       AS spend,
    SUM(m.impressions) AS impressions,
    SUM(m.clicks)      AS clicks,
    SUM(m.purchases)   AS purchases,
    SUM(m.revenue)     AS revenue,
    CASE WHEN SUM(m.spend) > 0
         THEN SUM(m.revenue) / SUM(m.spend) ELSE 0 END AS roas,
    CASE WHEN SUM(m.impressions) > 0
         THEN SUM(m.clicks)::numeric / SUM(m.impressions) ELSE 0 END AS ctr
  FROM public.meta_ad_metrics_daily m
  WHERE m.date >= (CURRENT_DATE - INTERVAL '90 days')
  GROUP BY m.meta_ad_id
)
SELECT
  c.id                       AS ad_creative_id,
  c.angle,
  c.hook_type,
  c.cta_text,
  c.cta_style,
  c.image_style,
  c.audience_segment_label,
  c.headline,
  c.body_copy,
  c.composite_image_url,
  c.meta_ad_id,
  COALESCE(p.spend, 0)       AS spend_90d,
  COALESCE(p.impressions, 0) AS impressions_90d,
  COALESCE(p.clicks, 0)      AS clicks_90d,
  COALESCE(p.purchases, 0)   AS purchases_90d,
  COALESCE(p.revenue, 0)     AS revenue_90d,
  COALESCE(p.roas, 0)        AS roas_90d,
  COALESCE(p.ctr, 0)         AS ctr_90d
FROM public.ad_creatives c
LEFT JOIN meta_perf p ON p.meta_ad_id = c.meta_ad_id
WHERE c.angle IS NOT NULL
ORDER BY roas_90d DESC NULLS LAST, ctr_90d DESC NULLS LAST;

COMMENT ON VIEW public.vw_winning_creatives IS
  'Top creative by ROAS, 90d window. Joins ad_creatives.meta_ad_id to meta_ad_metrics_daily. Read by Hero+SocialProof+FAQ writers in /launch-kryo-v2.';

------------------------------------------------------------------------------------------------
-- 3. vw_winning_pages — top landing page by conversion rate + scroll depth, 90-day window
--    Source: landing_pages joined to lp_funnel_daily aggregated.
------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_winning_pages AS
WITH page_perf AS (
  SELECT
    f.landing_page_id,
    SUM(f.sessions)               AS sessions,
    SUM(f.add_to_carts)            AS atc,
    SUM(f.checkouts_started)       AS checkouts,
    SUM(f.orders)                  AS orders,
    SUM(f.revenue)                 AS revenue,
    AVG(f.avg_scroll_depth)        AS avg_scroll_depth,
    AVG(f.bounce_rate)             AS bounce_rate,
    AVG(f.engagement_score)        AS engagement_score,
    CASE WHEN SUM(f.sessions) > 0
         THEN SUM(f.orders)::numeric / SUM(f.sessions)
         ELSE 0 END                AS conversion_rate
  FROM public.lp_funnel_daily f
  WHERE f.date >= (CURRENT_DATE - INTERVAL '90 days')
  GROUP BY f.landing_page_id
)
SELECT
  lp.id                                AS landing_page_id,
  lp.name,
  lp.shopify_url,
  lp.variant_angle,
  lp.product_line,
  lp.page_type,
  lp.parent_page_id,
  lp.experiment_id,
  COALESCE(p.sessions, 0)              AS sessions_90d,
  COALESCE(p.atc, 0)                   AS atc_90d,
  COALESCE(p.orders, 0)                AS orders_90d,
  COALESCE(p.revenue, 0)               AS revenue_90d,
  COALESCE(p.conversion_rate, 0)       AS conversion_rate_90d,
  COALESCE(p.avg_scroll_depth, 0)      AS avg_scroll_depth_90d,
  COALESCE(p.bounce_rate, 0)           AS bounce_rate_90d,
  COALESCE(p.engagement_score, 0)      AS engagement_score_90d
FROM public.landing_pages lp
LEFT JOIN page_perf p ON p.landing_page_id = lp.id
WHERE lp.status IN ('monitoring', 'testing', 'paused')
ORDER BY conversion_rate_90d DESC NULLS LAST, sessions_90d DESC NULLS LAST;

COMMENT ON VIEW public.vw_winning_pages IS
  'Top landing pages by conversion rate (90d). Read by Benefits writer in /launch-kryo-v2 to identify top-converting layouts to mimic.';

------------------------------------------------------------------------------------------------
-- 4. vw_fatigue_signals — exhausted angles (rolling 14d): CTR declining + frequency rising
--    Source: meta_ad_metrics_daily joined to ad_creatives.angle.
--    Detection: 14d trailing CTR slope vs 14-28d trailing CTR. Negative slope + freq rising = fatigue.
------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_fatigue_signals AS
WITH ad_angle AS (
  SELECT meta_ad_id, angle FROM public.ad_creatives WHERE angle IS NOT NULL AND meta_ad_id IS NOT NULL
),
window_recent AS (
  SELECT
    a.angle,
    SUM(m.impressions) AS impressions,
    SUM(m.clicks)      AS clicks,
    AVG(m.cpm)         AS cpm,
    AVG(m.ctr)         AS ctr_avg
  FROM public.meta_ad_metrics_daily m
  JOIN ad_angle a ON a.meta_ad_id = m.meta_ad_id
  WHERE m.date >= (CURRENT_DATE - INTERVAL '14 days')
  GROUP BY a.angle
),
window_prior AS (
  SELECT
    a.angle,
    SUM(m.impressions) AS impressions,
    SUM(m.clicks)      AS clicks,
    AVG(m.ctr)         AS ctr_avg
  FROM public.meta_ad_metrics_daily m
  JOIN ad_angle a ON a.meta_ad_id = m.meta_ad_id
  WHERE m.date >= (CURRENT_DATE - INTERVAL '28 days')
    AND m.date <  (CURRENT_DATE - INTERVAL '14 days')
  GROUP BY a.angle
)
SELECT
  COALESCE(r.angle, p.angle)                                         AS angle,
  COALESCE(r.ctr_avg, 0)                                             AS ctr_recent_14d,
  COALESCE(p.ctr_avg, 0)                                             AS ctr_prior_14d,
  CASE WHEN COALESCE(p.ctr_avg, 0) > 0
       THEN ((r.ctr_avg - p.ctr_avg) / p.ctr_avg) * 100
       ELSE NULL END                                                 AS ctr_change_pct,
  COALESCE(r.impressions, 0)                                         AS impressions_recent_14d,
  COALESCE(p.impressions, 0)                                         AS impressions_prior_14d,
  CASE
    WHEN p.ctr_avg IS NULL OR p.ctr_avg = 0 THEN 'insufficient_data'
    WHEN r.ctr_avg < p.ctr_avg * 0.85 THEN 'fatigued'
    WHEN r.ctr_avg < p.ctr_avg * 0.95 THEN 'softening'
    ELSE 'fresh'
  END                                                                 AS fatigue_state
FROM window_recent r
FULL OUTER JOIN window_prior p ON p.angle = r.angle
ORDER BY ctr_change_pct ASC NULLS LAST;

COMMENT ON VIEW public.vw_fatigue_signals IS
  'Per-angle fatigue state (14d window vs prior 14d). Read by FAQ writer in /launch-kryo-v2 to surface objections still novel (avoid fatigued angles).';
