-- Schema additions for /launch-angle orchestrator (2026-05-14)
-- Adds the FKs and tagging columns needed for end-to-end ad↔LP attribution
-- when /launch-angle clones a winning Meta ad + its landing page.

-- 1. ad_creatives.landing_page_id — wire ads back to their cloned LPs.
--    Without this, /launch-angle's ad-clone step can't say "this ad goes to that new LP",
--    UTM attribution falls back to the canonical kryo_ control, and creative_performance_by_angle
--    can't regress winning angles back to LPs.
ALTER TABLE ad_creatives
  ADD COLUMN IF NOT EXISTS landing_page_id UUID REFERENCES landing_pages(id);

CREATE INDEX IF NOT EXISTS ad_creatives_landing_page_id_idx
  ON ad_creatives(landing_page_id) WHERE landing_page_id IS NOT NULL;

-- 2. meta_ads angle/hook/audience tagging — mirrors ad_creatives so the
--    real synced winners (365 rows in meta_ads) can also be regressed by
--    creative_performance_by_angle, not just our 22 internal drafts.
ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS angle TEXT,
  ADD COLUMN IF NOT EXISTS hook_type TEXT,
  ADD COLUMN IF NOT EXISTS audience_segment_label TEXT,
  ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES marketing_experiments(id);

CREATE INDEX IF NOT EXISTS meta_ads_angle_idx ON meta_ads(angle) WHERE angle IS NOT NULL;
CREATE INDEX IF NOT EXISTS meta_ads_experiment_id_idx ON meta_ads(experiment_id) WHERE experiment_id IS NOT NULL;

-- 3. Helpful comments for future readers
COMMENT ON COLUMN ad_creatives.landing_page_id IS
  'FK to landing_pages.id. Set by /launch-angle when an ad is cloned for an angle test, pointing at the cloned LP. Allows promote-ads to use the variant LP URL instead of falling back to /products/kryo_.';

COMMENT ON COLUMN meta_ads.angle IS
  'Angle classification (matches ad_creatives.angle vocabulary). Populated by /tag-ad-creative extended to meta_ads, or by /launch-angle at clone time. NULL = untagged historical.';

COMMENT ON COLUMN meta_ads.experiment_id IS
  'FK to marketing_experiments.id. Set when /launch-angle clones an ad for a registered experiment.';
