-- 2026-05-04: meta_ad_breakdowns_daily
-- Per-ad demographic + placement breakdowns from Meta Insights API.
-- One row per (date, ad_creative_id, breakdown_type, breakdown_value).
-- Filled by /api/marketing/sync/meta-breakdowns (chained after /sync/meta-ads).

CREATE TABLE IF NOT EXISTS public.meta_ad_breakdowns_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  ad_creative_id UUID NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  meta_ad_id TEXT NOT NULL,

  -- 'age_gender' | 'region' | 'placement' | 'country' (extensible)
  breakdown_type TEXT NOT NULL,

  -- JSON dict of the dimension(s), e.g. {"age":"25-34","gender":"male"} or {"region":"Dubai"}
  breakdown_value JSONB NOT NULL,

  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  spend NUMERIC(12,4) NOT NULL DEFAULT 0,
  ctr NUMERIC(8,6),
  cpc NUMERIC(12,4),
  cpm NUMERIC(12,4),
  purchases BIGINT NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  roas NUMERIC(10,4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotent upsert key
  CONSTRAINT meta_ad_breakdowns_daily_unique
    UNIQUE (date, ad_creative_id, breakdown_type, breakdown_value)
);

CREATE INDEX IF NOT EXISTS idx_mabd_date ON public.meta_ad_breakdowns_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_mabd_ad_creative ON public.meta_ad_breakdowns_daily(ad_creative_id);
CREATE INDEX IF NOT EXISTS idx_mabd_breakdown_type ON public.meta_ad_breakdowns_daily(breakdown_type);
CREATE INDEX IF NOT EXISTS idx_mabd_breakdown_jsonb ON public.meta_ad_breakdowns_daily USING gin(breakdown_value);

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at_meta_ad_breakdowns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ad_breakdowns_updated_at ON public.meta_ad_breakdowns_daily;
CREATE TRIGGER trg_meta_ad_breakdowns_updated_at
  BEFORE UPDATE ON public.meta_ad_breakdowns_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_meta_ad_breakdowns();

-- Service-role-only (the sync route uses SUPABASE_SERVICE_ROLE_KEY)
ALTER TABLE public.meta_ad_breakdowns_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_ad_breakdowns_daily_service ON public.meta_ad_breakdowns_daily
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.meta_ad_breakdowns_daily IS
  'Per-ad demographic/placement breakdowns from Meta Insights API. Filled daily by /api/marketing/sync/meta-breakdowns. Used by Skill C (everest-marketing-split-test-monitor) for demographic + placement reporting on live split tests.';
