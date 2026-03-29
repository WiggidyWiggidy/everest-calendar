-- ═══════════════════════════════════════════════════════════════════
-- Marketing System V2 — Ad pipeline, proposals, asset enhancements
-- Run AFTER landing_page_builder_tables.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1: Ad templates (reusable ad layouts) ─────────────────────────
CREATE TABLE IF NOT EXISTS ad_templates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name              TEXT NOT NULL,
  format            TEXT NOT NULL CHECK (format IN ('1080x1080','1200x628','1080x1920','custom')),
  layout_type       TEXT NOT NULL CHECK (layout_type IN (
                      'product_centered','lifestyle','before_after',
                      'testimonial','offer','minimal'
                    )),
  zones             JSONB NOT NULL DEFAULT '{}',
  background_color  TEXT DEFAULT '#0f1419',
  template_image_url TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ad_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ad templates"
  ON ad_templates FOR ALL USING (auth.uid() = user_id);

-- ── 2: Ad creatives (links experiments to Meta ads) ───────────────
CREATE TABLE IF NOT EXISTS ad_creatives (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  experiment_id     UUID REFERENCES marketing_experiments(id) ON DELETE SET NULL,
  template_id       UUID REFERENCES ad_templates(id) ON DELETE SET NULL,
  media_asset_id    UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  meta_ad_id        TEXT,
  meta_campaign_id  TEXT,
  meta_adset_id     TEXT,
  headline          TEXT,
  body_copy         TEXT,
  cta_text          TEXT,
  target_audience   JSONB,
  daily_budget      DECIMAL(10,2),
  status            TEXT DEFAULT 'draft' CHECK (status IN (
                      'draft','pending_approval','approved','live',
                      'paused','completed'
                    )),
  composite_image_url TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_user_status
  ON ad_creatives(user_id, status);

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ad creatives"
  ON ad_creatives FOR ALL USING (auth.uid() = user_id);

-- ── 3: Per-ad daily metrics (from Meta API) ───────────────────────
CREATE TABLE IF NOT EXISTS ad_metrics_daily (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_creative_id  UUID REFERENCES ad_creatives(id) ON DELETE CASCADE NOT NULL,
  date            DATE NOT NULL,
  impressions     INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  spend           DECIMAL(10,2) DEFAULT 0,
  ctr             DECIMAL(6,4),
  cpc             DECIMAL(8,2),
  cpm             DECIMAL(8,2),
  purchases       INTEGER DEFAULT 0,
  revenue         DECIMAL(12,2) DEFAULT 0,
  roas            DECIMAL(8,2),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_creative_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_metrics_creative_date
  ON ad_metrics_daily(ad_creative_id, date DESC);

-- RLS via ad_creatives join (no direct user_id)
ALTER TABLE ad_metrics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own ad metrics"
  ON ad_metrics_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ad_creatives ac WHERE ac.id = ad_creative_id AND ac.user_id = auth.uid()
  ));
CREATE POLICY "Users insert own ad metrics"
  ON ad_metrics_daily FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM ad_creatives ac WHERE ac.id = ad_creative_id AND ac.user_id = auth.uid()
  ));

-- ── 4: Marketing proposals (agent-generated actions) ──────────────
CREATE TABLE IF NOT EXISTS marketing_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  proposal_type     TEXT NOT NULL CHECK (proposal_type IN (
                      'pause_ad','scale_ad','new_creative','page_variant',
                      'new_blog','budget_realloc','new_experiment','new_campaign'
                    )),
  title             TEXT NOT NULL,
  reasoning         TEXT NOT NULL,
  action_data       JSONB NOT NULL DEFAULT '{}',
  metrics_snapshot  JSONB,
  priority          TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status            TEXT DEFAULT 'pending' CHECK (status IN (
                      'pending','approved','rejected','executed','expired'
                    )),
  inbox_item_id     UUID,
  executed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_proposals_user_status
  ON marketing_proposals(user_id, status);

ALTER TABLE marketing_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own marketing proposals"
  ON marketing_proposals FOR ALL USING (auth.uid() = user_id);

-- ── 5: Alter landing_pages — add page_type ────────────────────────
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'product'
    CHECK (page_type IN ('product','blog','landing'));

-- ── 6: Alter media_assets — add asset management columns ──────────
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS product_key TEXT DEFAULT 'isu001',
  ADD COLUMN IF NOT EXISTS dimensions TEXT,
  ADD COLUMN IF NOT EXISTS variant_label TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS used_in_ads TEXT[],
  ADD COLUMN IF NOT EXISTS performance_score DECIMAL(5,2);
