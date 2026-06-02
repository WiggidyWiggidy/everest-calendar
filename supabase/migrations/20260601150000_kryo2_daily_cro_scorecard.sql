CREATE TABLE IF NOT EXISTS public.meta_ad_metrics_hourly (
  meta_ad_id TEXT NOT NULL,
  report_hour TIMESTAMPTZ NOT NULL,
  account_timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  link_clicks INTEGER NOT NULL DEFAULT 0,
  landing_page_views INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC NOT NULL DEFAULT 0,
  add_to_carts INTEGER NOT NULL DEFAULT 0,
  checkouts_started INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meta_ad_id, report_hour)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_metrics_hourly_report_hour
  ON public.meta_ad_metrics_hourly(report_hour DESC);

CREATE TABLE IF NOT EXISTS public.kryo_lp_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  report_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  window_start_at TIMESTAMPTZ NOT NULL,
  window_end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  source_freshness JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  ga4_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  clarity_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  gsc_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  storefront_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparisons JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_path, window_end_at)
);

CREATE INDEX IF NOT EXISTS idx_kryo_lp_scorecards_latest
  ON public.kryo_lp_scorecards(page_path, window_end_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_analytics_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  trigger TEXT NOT NULL DEFAULT 'daily_cron',
  source_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  scorecard_id UUID REFERENCES public.kryo_lp_scorecards(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.get_latest_kryo_lp_scorecard(
  p_page_path TEXT DEFAULT '/products/kryo2'
) RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT to_jsonb(s)
  FROM public.kryo_lp_scorecards s
  WHERE s.page_path = p_page_path
  ORDER BY s.window_end_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_kryo_lp_scorecard(TEXT) TO anon, authenticated, service_role;
