-- ═══════════════════════════════════════════════════════════════════
-- Landing Page Builder — Tables
-- Run AFTER marketing_tables.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── Table 1: Tracked Shopify landing pages ──────────────────────────
CREATE TABLE IF NOT EXISTS landing_pages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  shopify_url     TEXT NOT NULL,
  shopify_page_id TEXT,           -- set once a draft is created via API
  status          TEXT NOT NULL DEFAULT 'monitoring'
                  CHECK (status IN ('monitoring','testing','paused','archived')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_user_status
  ON landing_pages(user_id, status);

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own landing pages"
  ON landing_pages FOR ALL
  USING (auth.uid() = user_id);

-- ── Table 2: AI analysis proposals (one per run) ────────────────────
CREATE TABLE IF NOT EXISTS page_proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  landing_page_id   UUID REFERENCES landing_pages(id) ON DELETE CASCADE NOT NULL,
  diagnosis         TEXT,           -- AI markdown narrative
  proposed_sections JSONB,          -- ProposedSection[] array
  user_plan         TEXT,           -- nullable: user-written override
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','user_written','building','live','rejected')),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_proposals_page
  ON page_proposals(landing_page_id, created_at DESC);

ALTER TABLE page_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own proposals"
  ON page_proposals FOR ALL
  USING (auth.uid() = user_id);

-- ── Table 3: Uploaded media assets (NOT marketing_assets) ───────────
-- marketing_assets = abstract campaign tracking
-- media_assets    = real uploaded image/video files in Supabase Storage
CREATE TABLE IF NOT EXISTS media_assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_path    TEXT NOT NULL,          -- {user_id}/{timestamp}-{filename}
  public_url      TEXT NOT NULL,
  filename        TEXT NOT NULL,
  file_size       INTEGER,
  mime_type       TEXT,
  width           INTEGER,
  height          INTEGER,
  ai_category     TEXT CHECK (ai_category IN (
                    'product_hero','lifestyle','feature',
                    'social_proof','packaging','ingredient','other'
                  )),
  ai_description  TEXT,
  ai_tags         TEXT[],
  ai_suitable_for TEXT[],                 -- section type names this image suits
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','archived')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_user_category
  ON media_assets(user_id, ai_category);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own media assets"
  ON media_assets FOR ALL
  USING (auth.uid() = user_id);

-- ── Table 4: Asset requests (flagged gaps in library) ───────────────
CREATE TABLE IF NOT EXISTS asset_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  landing_page_id UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  asset_type      TEXT NOT NULL CHECK (asset_type IN ('image','video')),
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested','in_progress','done')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE asset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own asset requests"
  ON asset_requests FOR ALL
  USING (auth.uid() = user_id);

-- ── Supabase Storage bucket note ─────────────────────────────────────
-- Bucket name: marketing-assets
-- Must be created manually in Supabase Dashboard → Storage
-- Settings: Public = true, allowed MIME: image/*, video/*, max 50MB
