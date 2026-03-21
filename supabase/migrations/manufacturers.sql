-- ============================================
-- Manufacturer Pipeline
-- Tracks sheet metal fabrication shops being
-- evaluated to produce the aluminium enclosure.
-- ============================================

CREATE TABLE manufacturers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Identity
  company_name      TEXT NOT NULL,
  contact_name      TEXT,
  phone             TEXT,
  email             TEXT,
  location          TEXT,
  website           TEXT,

  -- Pipeline status
  status            TEXT NOT NULL DEFAULT 'prospecting'
    CHECK (status IN ('prospecting', 'contacted', 'sample_requested', 'sample_received', 'quoting', 'quoted', 'trialling', 'selected', 'rejected')),

  -- Commercial
  quoted_price_usd  DECIMAL(10,2),
  lead_time_days    INTEGER,
  min_order_qty     INTEGER,

  -- Notes
  strengths         TEXT,
  concerns          TEXT,
  notes             TEXT,

  -- Timestamps
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own manufacturers" ON manufacturers
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_manufacturers_user_id ON manufacturers(user_id);
CREATE INDEX idx_manufacturers_status  ON manufacturers(user_id, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_manufacturers_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_manufacturers_updated_at
  BEFORE UPDATE ON manufacturers
  FOR EACH ROW EXECUTE FUNCTION update_manufacturers_updated_at();
