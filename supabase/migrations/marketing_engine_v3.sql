-- ═══════════════════════════════════════════════════════════════════
-- Marketing Engine V3 -- KPIs, Brand Tracking, Customer Feedback, Trends RPC
-- Run AFTER marketing_system_v2.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1: Add computed KPI columns to marketing_metrics_daily ────────
ALTER TABLE marketing_metrics_daily
  ADD COLUMN IF NOT EXISTS cpa DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS sales_growth_rate DECIMAL(8,4);

-- ── 2: Brand tracking (Google Search Console, Google Trends, social) ──
CREATE TABLE IF NOT EXISTS brand_tracking_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  source TEXT NOT NULL,
  term TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  avg_position DECIMAL(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, source, term)
);

CREATE INDEX IF NOT EXISTS idx_brand_tracking_date
  ON brand_tracking_daily(date DESC);

CREATE INDEX IF NOT EXISTS idx_brand_tracking_term
  ON brand_tracking_daily(term, date DESC);

-- ── 3: Customer feedback (WhatsApp lead ads, surveys, post-purchase) ──
CREATE TABLE IF NOT EXISTS customer_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,
  responses JSONB NOT NULL DEFAULT '{}',
  customer_email TEXT,
  customer_phone TEXT,
  meta_ad_id TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_source
  ON customer_feedback(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_meta_ad
  ON customer_feedback(meta_ad_id) WHERE meta_ad_id IS NOT NULL;

-- ── 4: RPC - get_marketing_trends ─────────────────────────────────
-- Returns current vs prior period metrics, growth rates, anomaly flags
CREATE OR REPLACE FUNCTION get_marketing_trends(days_back INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  current_period RECORD;
  prior_period RECORD;
  latest_day RECORD;
  anomalies JSONB := '[]'::JSONB;
  rolling_avg RECORD;
BEGIN
  -- Current period averages (last N days)
  SELECT
    COALESCE(AVG(shopify_revenue), 0) AS avg_revenue,
    COALESCE(SUM(shopify_revenue), 0) AS total_revenue,
    COALESCE(AVG(shopify_orders), 0) AS avg_orders,
    COALESCE(SUM(shopify_orders), 0) AS total_orders,
    COALESCE(AVG(shopify_aov), 0) AS avg_aov,
    COALESCE(AVG(meta_spend), 0) AS avg_spend,
    COALESCE(SUM(meta_spend), 0) AS total_spend,
    COALESCE(AVG(meta_roas), 0) AS avg_roas,
    COALESCE(AVG(meta_ctr), 0) AS avg_ctr,
    COALESCE(AVG(meta_cpc), 0) AS avg_cpc,
    COALESCE(AVG(meta_cpm), 0) AS avg_cpm,
    COALESCE(SUM(meta_purchases), 0) AS total_purchases,
    COALESCE(AVG(ga_sessions), 0) AS avg_sessions,
    COALESCE(AVG(ga_bounce_rate), 0) AS avg_bounce_rate,
    COALESCE(AVG(ga_conversion_rate), 0) AS avg_conversion_rate,
    COALESCE(AVG(clarity_engagement_score), 0) AS avg_engagement,
    COALESCE(AVG(clarity_rage_clicks), 0) AS avg_rage_clicks,
    COALESCE(SUM(customers_acquired), 0) AS total_customers,
    COALESCE(AVG(cpa), 0) AS avg_cpa,
    COALESCE(AVG(profit_per_customer), 0) AS avg_profit_per_customer,
    COALESCE(AVG(gross_profit), 0) AS avg_gross_profit,
    COUNT(*) AS days_with_data
  INTO current_period
  FROM marketing_metrics_daily
  WHERE date >= CURRENT_DATE - days_back
    AND date < CURRENT_DATE;

  -- Prior period averages (the N days before that)
  SELECT
    COALESCE(AVG(shopify_revenue), 0) AS avg_revenue,
    COALESCE(SUM(shopify_revenue), 0) AS total_revenue,
    COALESCE(AVG(shopify_orders), 0) AS avg_orders,
    COALESCE(SUM(shopify_orders), 0) AS total_orders,
    COALESCE(AVG(meta_spend), 0) AS avg_spend,
    COALESCE(SUM(meta_spend), 0) AS total_spend,
    COALESCE(AVG(meta_roas), 0) AS avg_roas,
    COALESCE(SUM(meta_purchases), 0) AS total_purchases,
    COALESCE(AVG(ga_sessions), 0) AS avg_sessions,
    COALESCE(AVG(ga_conversion_rate), 0) AS avg_conversion_rate,
    COALESCE(SUM(customers_acquired), 0) AS total_customers,
    COALESCE(AVG(cpa), 0) AS avg_cpa,
    COUNT(*) AS days_with_data
  INTO prior_period
  FROM marketing_metrics_daily
  WHERE date >= CURRENT_DATE - (days_back * 2)
    AND date < CURRENT_DATE - days_back;

  -- Latest day snapshot
  SELECT *
  INTO latest_day
  FROM marketing_metrics_daily
  WHERE date = (SELECT MAX(date) FROM marketing_metrics_daily)
  LIMIT 1;

  -- 7-day rolling averages for anomaly detection
  SELECT
    COALESCE(AVG(shopify_revenue), 0) AS avg_revenue,
    COALESCE(STDDEV(shopify_revenue), 0) AS std_revenue,
    COALESCE(AVG(meta_roas), 0) AS avg_roas,
    COALESCE(STDDEV(meta_roas), 0) AS std_roas,
    COALESCE(AVG(ga_conversion_rate), 0) AS avg_conversion,
    COALESCE(STDDEV(ga_conversion_rate), 0) AS std_conversion,
    COALESCE(AVG(cpa), 0) AS avg_cpa,
    COALESCE(STDDEV(cpa), 0) AS std_cpa
  INTO rolling_avg
  FROM marketing_metrics_daily
  WHERE date >= CURRENT_DATE - 7
    AND date < CURRENT_DATE;

  -- Detect anomalies on latest day
  IF latest_day IS NOT NULL AND rolling_avg.std_revenue > 0 THEN
    IF latest_day.shopify_revenue IS NOT NULL
       AND ABS(latest_day.shopify_revenue - rolling_avg.avg_revenue) > (2 * rolling_avg.std_revenue) THEN
      anomalies := anomalies || jsonb_build_object(
        'metric', 'shopify_revenue',
        'value', latest_day.shopify_revenue,
        'avg_7d', ROUND(rolling_avg.avg_revenue::numeric, 2),
        'direction', CASE WHEN latest_day.shopify_revenue > rolling_avg.avg_revenue THEN 'spike' ELSE 'drop' END
      );
    END IF;
  END IF;

  IF latest_day IS NOT NULL AND rolling_avg.std_cpa > 0 THEN
    IF latest_day.cpa IS NOT NULL
       AND latest_day.cpa > rolling_avg.avg_cpa + (2 * rolling_avg.std_cpa) THEN
      anomalies := anomalies || jsonb_build_object(
        'metric', 'cpa',
        'value', latest_day.cpa,
        'avg_7d', ROUND(rolling_avg.avg_cpa::numeric, 2),
        'direction', 'spike'
      );
    END IF;
  END IF;

  IF latest_day IS NOT NULL AND rolling_avg.std_roas > 0 THEN
    IF latest_day.meta_roas IS NOT NULL
       AND latest_day.meta_roas < rolling_avg.avg_roas - (2 * rolling_avg.std_roas) THEN
      anomalies := anomalies || jsonb_build_object(
        'metric', 'meta_roas',
        'value', latest_day.meta_roas,
        'avg_7d', ROUND(rolling_avg.avg_roas::numeric, 2),
        'direction', 'drop'
      );
    END IF;
  END IF;

  -- Build result
  result := jsonb_build_object(
    'period_days', days_back,
    'data_coverage', jsonb_build_object(
      'current_days_with_data', current_period.days_with_data,
      'prior_days_with_data', prior_period.days_with_data
    ),
    'latest_date', latest_day.date,
    'latest_day', jsonb_build_object(
      'revenue', latest_day.shopify_revenue,
      'orders', latest_day.shopify_orders,
      'aov', latest_day.shopify_aov,
      'meta_spend', latest_day.meta_spend,
      'meta_roas', latest_day.meta_roas,
      'meta_ctr', latest_day.meta_ctr,
      'ga_sessions', latest_day.ga_sessions,
      'ga_bounce_rate', latest_day.ga_bounce_rate,
      'ga_conversion_rate', latest_day.ga_conversion_rate,
      'clarity_engagement', latest_day.clarity_engagement_score,
      'cpa', latest_day.cpa,
      'profit_per_customer', latest_day.profit_per_customer,
      'customers_acquired', latest_day.customers_acquired
    ),
    'current_period', jsonb_build_object(
      'total_revenue', ROUND(current_period.total_revenue::numeric, 2),
      'avg_daily_revenue', ROUND(current_period.avg_revenue::numeric, 2),
      'total_orders', current_period.total_orders,
      'avg_daily_orders', ROUND(current_period.avg_orders::numeric, 1),
      'avg_aov', ROUND(current_period.avg_aov::numeric, 2),
      'total_spend', ROUND(current_period.total_spend::numeric, 2),
      'avg_roas', ROUND(current_period.avg_roas::numeric, 2),
      'avg_ctr', ROUND(current_period.avg_ctr::numeric, 4),
      'total_purchases', current_period.total_purchases,
      'avg_sessions', ROUND(current_period.avg_sessions::numeric, 0),
      'avg_bounce_rate', ROUND(current_period.avg_bounce_rate::numeric, 4),
      'avg_conversion_rate', ROUND(current_period.avg_conversion_rate::numeric, 4),
      'avg_engagement', ROUND(current_period.avg_engagement::numeric, 2),
      'total_customers', current_period.total_customers,
      'avg_cpa', ROUND(current_period.avg_cpa::numeric, 2),
      'avg_profit_per_customer', ROUND(current_period.avg_profit_per_customer::numeric, 2)
    ),
    'growth_vs_prior', jsonb_build_object(
      'revenue_change_pct', CASE WHEN prior_period.total_revenue > 0
        THEN ROUND(((current_period.total_revenue - prior_period.total_revenue) / prior_period.total_revenue * 100)::numeric, 1)
        ELSE NULL END,
      'orders_change_pct', CASE WHEN prior_period.total_orders > 0
        THEN ROUND(((current_period.total_orders - prior_period.total_orders)::numeric / prior_period.total_orders * 100)::numeric, 1)
        ELSE NULL END,
      'spend_change_pct', CASE WHEN prior_period.total_spend > 0
        THEN ROUND(((current_period.total_spend - prior_period.total_spend) / prior_period.total_spend * 100)::numeric, 1)
        ELSE NULL END,
      'roas_change_pct', CASE WHEN prior_period.avg_roas > 0
        THEN ROUND(((current_period.avg_roas - prior_period.avg_roas) / prior_period.avg_roas * 100)::numeric, 1)
        ELSE NULL END,
      'sessions_change_pct', CASE WHEN prior_period.avg_sessions > 0
        THEN ROUND(((current_period.avg_sessions - prior_period.avg_sessions) / prior_period.avg_sessions * 100)::numeric, 1)
        ELSE NULL END,
      'customers_change_pct', CASE WHEN prior_period.total_customers > 0
        THEN ROUND(((current_period.total_customers - prior_period.total_customers)::numeric / prior_period.total_customers * 100)::numeric, 1)
        ELSE NULL END,
      'cpa_change_pct', CASE WHEN prior_period.avg_cpa > 0
        THEN ROUND(((current_period.avg_cpa - prior_period.avg_cpa) / prior_period.avg_cpa * 100)::numeric, 1)
        ELSE NULL END
    ),
    'anomalies', anomalies,
    'brand_tracking', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'term', bt.term,
        'source', bt.source,
        'latest_impressions', bt.impressions,
        'latest_clicks', bt.clicks,
        'avg_position', bt.avg_position
      )), '[]'::JSONB)
      FROM brand_tracking_daily bt
      WHERE bt.date = (SELECT MAX(date) FROM brand_tracking_daily)
    ),
    'recent_feedback_count', (
      SELECT COUNT(*) FROM customer_feedback
      WHERE created_at >= CURRENT_DATE - days_back
    )
  );

  RETURN result;
END;
$$;
