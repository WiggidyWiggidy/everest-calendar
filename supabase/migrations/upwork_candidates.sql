-- ============================================
-- Upwork Candidate Evaluation Pipeline
-- Stores candidates evaluated by Claude in Chrome
-- from the Upwork hiring process for the
-- aluminium enclosure engineering role
-- ============================================

CREATE TABLE upwork_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Upwork profile
  name TEXT NOT NULL,
  upwork_profile_url TEXT,
  hourly_rate DECIMAL(10,2),
  job_success_score DECIMAL(5,2),  -- percentage e.g. 95.5
  location TEXT,
  -- Evaluation scoring
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  tier TEXT CHECK (tier IN ('top', 'maybe', 'reject')) DEFAULT 'maybe',
  status TEXT CHECK (status IN ('new', 'messaged', 'trialled', 'hired', 'rejected')) DEFAULT 'new',
  -- Proposal & assessment
  proposal_snippet TEXT,
  strengths TEXT[],
  weaknesses TEXT[],
  manufacturing_experience TEXT,
  cad_software TEXT[],
  enclosures_count INTEGER,         -- number of enclosures actually manufactured
  evaluator_notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE upwork_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own candidates"
  ON upwork_candidates FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_upwork_candidates_user_id ON upwork_candidates(user_id);
CREATE INDEX idx_upwork_candidates_tier ON upwork_candidates(user_id, tier);
CREATE INDEX idx_upwork_candidates_status ON upwork_candidates(user_id, status);
CREATE INDEX idx_upwork_candidates_score ON upwork_candidates(user_id, score DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_upwork_candidates_updated_at
  BEFORE UPDATE ON upwork_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
