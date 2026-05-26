-- GSC fast analytics raw storage + KRYO reporting view.

CREATE TABLE IF NOT EXISTS gsc_query_page_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  normalized_page TEXT NOT NULL DEFAULT '',
  product_handle TEXT,
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  search_type TEXT NOT NULL DEFAULT 'web',
  data_state TEXT NOT NULL DEFAULT 'all',
  is_final BOOLEAN NOT NULL DEFAULT false,
  first_incomplete_date DATE,
  query_group TEXT NOT NULL DEFAULT 'irrelevant',
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(12,8) NOT NULL DEFAULT 0,
  avg_position NUMERIC(10,4),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB,
  UNIQUE(date, query, page, country, device, search_type, data_state)
);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_date_group
  ON gsc_query_page_daily(date DESC, query_group);
CREATE INDEX IF NOT EXISTS idx_gsc_daily_page
  ON gsc_query_page_daily(normalized_page, date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_daily_query
  ON gsc_query_page_daily(query, date DESC);

CREATE TABLE IF NOT EXISTS gsc_query_page_hourly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hour_start TIMESTAMPTZ NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  normalized_page TEXT NOT NULL DEFAULT '',
  product_handle TEXT,
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  search_type TEXT NOT NULL DEFAULT 'web',
  data_state TEXT NOT NULL DEFAULT 'hourly_all',
  is_final BOOLEAN NOT NULL DEFAULT false,
  first_incomplete_hour TIMESTAMPTZ,
  query_group TEXT NOT NULL DEFAULT 'irrelevant',
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(12,8) NOT NULL DEFAULT 0,
  avg_position NUMERIC(10,4),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB,
  UNIQUE(hour_start, query, page, country, device, search_type)
);

CREATE INDEX IF NOT EXISTS idx_gsc_hourly_hour_group
  ON gsc_query_page_hourly(hour_start DESC, query_group);

CREATE TABLE IF NOT EXISTS gsc_sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'google_search_console',
  status TEXT NOT NULL,
  requested_start_date DATE,
  requested_end_date DATE,
  newest_daily_date DATE,
  newest_hour TIMESTAMPTZ,
  first_incomplete_date DATE,
  first_incomplete_hour TIMESTAMPTZ,
  daily_rows_fetched INTEGER NOT NULL DEFAULT 0,
  hourly_rows_fetched INTEGER NOT NULL DEFAULT 0,
  daily_rows_upserted INTEGER NOT NULL DEFAULT 0,
  hourly_rows_upserted INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_started
  ON gsc_sync_runs(started_at DESC);

CREATE OR REPLACE VIEW vw_kryo_gsc_fast_report AS
SELECT
  date,
  query_group,
  query,
  normalized_page,
  product_handle,
  country,
  device,
  bool_and(is_final) AS is_final,
  min(first_incomplete_date) AS first_incomplete_date,
  max(fetched_at) AS fetched_at,
  sum(clicks) AS clicks,
  sum(impressions) AS impressions,
  CASE WHEN sum(impressions) > 0 THEN sum(clicks)::numeric / sum(impressions) ELSE 0 END AS ctr,
  CASE WHEN sum(impressions) > 0 THEN sum(avg_position * impressions)::numeric / sum(impressions) ELSE NULL END AS avg_position
FROM gsc_query_page_daily
WHERE query_group <> 'irrelevant'
   OR normalized_page ILIKE '%/products/kryo%'
   OR normalized_page ILIKE '%/blogs/news/%cold%'
   OR normalized_page ILIKE '%/blogs/news/%ice%'
GROUP BY date, query_group, query, normalized_page, product_handle, country, device;
