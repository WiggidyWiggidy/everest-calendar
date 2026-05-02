-- QC firewall persistence: rejected variants land here, never in platform_inbox.
-- Tom's discipline: hard reject + diagnostics, no auto-fix-forward (per CLAUDE.md circuit breaker rule).

CREATE TABLE IF NOT EXISTS public.qc_rejected_variants (
  id                    uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id       uuid                     REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  shopify_product_id    text,
  shopify_handle        text,
  preview_url           text,
  variant_angle         text,
  experiment_id         uuid                     REFERENCES public.marketing_experiments(id) ON DELETE SET NULL,

  -- Council verdict
  inspector_visual      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  inspector_functional  jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  inspector_creative    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  failed_checks         text[]                   NOT NULL DEFAULT '{}',
  total_score           int,
  pass_threshold        int,

  -- Artifact pointers
  desktop_screenshot_url  text,
  mobile_screenshot_url   text,
  diagnostics_json_path   text,

  -- Surface state
  surfaced_to_tom       boolean                  NOT NULL DEFAULT false,
  one_line_summary      text,

  created_at            timestamptz              NOT NULL DEFAULT now(),
  resolved_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_qc_rejected_variants_created_at
  ON public.qc_rejected_variants (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_rejected_variants_landing_page_id
  ON public.qc_rejected_variants (landing_page_id);
CREATE INDEX IF NOT EXISTS idx_qc_rejected_variants_unresolved
  ON public.qc_rejected_variants (created_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.qc_rejected_variants IS
  'QC firewall rejection log. Pages that fail any of the 3 inspectors land here, NEVER in platform_inbox. Tom sees a one-line summary via Telegram; full diagnostics queryable.';

-- Extend landing_pages.status to allow qc_pending + qc_rejected.
-- The clone-page route writes qc_pending right after Shopify deploy; QC verify flips to testing (pass) or qc_rejected.
ALTER TABLE public.landing_pages DROP CONSTRAINT IF EXISTS landing_pages_status_check;
ALTER TABLE public.landing_pages
  ADD CONSTRAINT landing_pages_status_check
  CHECK (status = ANY (ARRAY[
    'monitoring'::text,
    'testing'::text,
    'paused'::text,
    'archived'::text,
    'qc_pending'::text,
    'qc_rejected'::text
  ]));

COMMENT ON COLUMN public.landing_pages.status IS
  'Lifecycle: qc_pending (deployed to Shopify draft, awaiting council) → testing (council passed, in inbox for Tom) → monitoring (Tom approved, live) | qc_rejected (council failed, see qc_rejected_variants) | paused | archived.';
