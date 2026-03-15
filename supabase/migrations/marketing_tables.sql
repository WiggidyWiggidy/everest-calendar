-- ═══════════════════════════════════════════════════════════════════
-- Marketing Command Station — Phase 1 Tables
-- ═══════════════════════════════════════════════════════════════════

-- ── Table 1: Daily metric snapshots ────────────────────────────────
-- One row per user per day. UPSERT-safe via UNIQUE(user_id, date).
-- Wide-format for fast time-series queries without pivoting.
-- data_source tracks manual vs future API-synced rows.

CREATE TABLE IF NOT EXISTS marketing_metrics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,

  -- Shopify
  shopify_revenue DECIMAL(12,2),
  shopify_orders INTEGER,
  shopify_aov DECIMAL(10,2),
  shopify_sessions INTEGER,
  shopify_conversion_rate DECIMAL(6,4),
  shopify_add_to_cart_rate DECIMAL(6,4),
  shopify_checkout_rate DECIMAL(6,4),

  -- Meta Ads
  meta_spend DECIMAL(10,2),
  meta_impressions INTEGER,
  meta_clicks INTEGER,
  meta_ctr DECIMAL(6,4),
  meta_cpm DECIMAL(8,2),
  meta_cpc DECIMAL(8,2),
  meta_roas DECIMAL(8,2),
  meta_purchases INTEGER,
  meta_cost_per_purchase DECIMAL(10,2),

  -- Google Analytics
  ga_sessions INTEGER,
  ga_users INTEGER,
  ga_new_users INTEGER,
  ga_bounce_rate DECIMAL(6,4),
  ga_avg_session_duration INTEGER,
  ga_conversion_rate DECIMAL(6,4),

  -- Microsoft Clarity
  clarity_engagement_score DECIMAL(5,2),
  clarity_rage_clicks INTEGER,
  clarity_dead_clicks INTEGER,
  clarity_avg_scroll_depth DECIMAL(5,2),

  -- Top-line KPIs (manual or computed)
  customers_acquired INTEGER,
  gross_profit DECIMAL(12,2),
  profit_per_customer DECIMAL(10,2),

  notes TEXT,
  data_source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_marketing_metrics_user_date
  ON marketing_metrics_daily(user_id, date DESC);

ALTER TABLE marketing_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own marketing metrics"
  ON marketing_metrics_daily FOR ALL
  USING (auth.uid() = user_id);

-- ── Table 2: Marketing experiments / split tests ────────────────────
-- Tracks all tests: landing pages, creatives, copy, offers, audiences.
-- Links to assets once the asset library is built.

CREATE TABLE IF NOT EXISTS marketing_experiments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('landing_page','creative','copy','offer','audience','email')),
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','running','paused','completed','archived')),
  start_date DATE,
  end_date DATE,
  primary_metric TEXT,
  baseline_value DECIMAL(10,4),
  result_value DECIMAL(10,4),
  lift_percent DECIMAL(8,2),
  result TEXT CHECK (result IN ('winner','loser','inconclusive')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_experiments_user_status
  ON marketing_experiments(user_id, status);

ALTER TABLE marketing_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own experiments"
  ON marketing_experiments FOR ALL
  USING (auth.uid() = user_id);

-- ── Table 3: Marketing assets (Phase 2 scaffold) ────────────────────
-- Creatives, copy, landing pages — linked to experiments.
-- Approval workflow and Meta deployment come in Phase 2.

CREATE TABLE IF NOT EXISTS marketing_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  experiment_id UUID REFERENCES marketing_experiments(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('creative','copy','landing_page','video','email')),
  title TEXT NOT NULL,
  url TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','live','archived','rejected')),
  approval_notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_user_status
  ON marketing_assets(user_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_experiment
  ON marketing_assets(experiment_id);

ALTER TABLE marketing_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own assets"
  ON marketing_assets FOR ALL
  USING (auth.uid() = user_id);
