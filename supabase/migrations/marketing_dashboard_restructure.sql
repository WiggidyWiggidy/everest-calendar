-- Marketing Dashboard Restructure: 6 new tables for campaign intelligence + funnel tracking
-- Applied via Supabase MCP 2026-03-30

CREATE TABLE IF NOT EXISTS meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_campaign_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  objective TEXT,
  daily_budget DECIMAL(12,2),
  lifetime_budget DECIMAL(12,2),
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_adsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_adset_id TEXT UNIQUE NOT NULL,
  meta_campaign_id TEXT NOT NULL REFERENCES meta_campaigns(meta_campaign_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  optimization_goal TEXT,
  daily_budget DECIMAL(12,2),
  targeting JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_ad_id TEXT UNIQUE NOT NULL,
  meta_adset_id TEXT NOT NULL REFERENCES meta_adsets(meta_adset_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  headline TEXT,
  body TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  link_url TEXT,
  cta_type TEXT,
  is_dynamic_creative BOOLEAN DEFAULT false,
  asset_feed_spec JSONB,
  creative_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ad_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_id TEXT NOT NULL REFERENCES meta_ads(meta_ad_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(6,4),
  cpc DECIMAL(8,2),
  cpm DECIMAL(8,2),
  purchases INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  roas DECIMAL(8,2),
  cost_per_purchase DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meta_ad_id, date)
);

CREATE TABLE IF NOT EXISTS meta_dce_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_id TEXT NOT NULL REFERENCES meta_ads(meta_ad_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  element_type TEXT NOT NULL,
  element_value TEXT NOT NULL,
  element_label TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(6,4),
  purchases INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meta_ad_id, date, element_type, element_value)
);

CREATE TABLE IF NOT EXISTS shopify_funnel_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  checkouts_started INTEGER DEFAULT 0,
  checkouts_completed INTEGER DEFAULT 0,
  checkouts_abandoned INTEGER DEFAULT 0,
  abandonment_rate DECIMAL(6,4),
  abandoned_value DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_metrics_date ON meta_ad_metrics_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ad_metrics_ad ON meta_ad_metrics_daily(meta_ad_id);
CREATE INDEX IF NOT EXISTS idx_meta_dce_ad_date ON meta_dce_metrics(meta_ad_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ads_adset ON meta_ads(meta_adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_adsets_campaign ON meta_adsets(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_shopify_funnel_date ON shopify_funnel_daily(user_id, date DESC);

ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_dce_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_funnel_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own campaigns" ON meta_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own adsets" ON meta_adsets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own ads" ON meta_ads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own ad metrics" ON meta_ad_metrics_daily FOR SELECT USING (
  meta_ad_id IN (SELECT meta_ad_id FROM meta_ads WHERE user_id = auth.uid())
);
CREATE POLICY "Users can read own dce metrics" ON meta_dce_metrics FOR SELECT USING (
  meta_ad_id IN (SELECT meta_ad_id FROM meta_ads WHERE user_id = auth.uid())
);
CREATE POLICY "Users can read own funnel" ON shopify_funnel_daily FOR SELECT USING (auth.uid() = user_id);
