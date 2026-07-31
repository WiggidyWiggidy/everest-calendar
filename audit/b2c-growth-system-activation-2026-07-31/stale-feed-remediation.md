# Stale Feed Remediation — 2026-07-31

Nothing here is deployed. All items are prepared for review.

## 1. Meta breakdowns — RECOMMEND RESTORE

- **Table:** `meta_ad_breakdowns_daily` — 403 rows, last `date` **2026-05-17** (75 d stale).
- **Cause:** sync route `src/app/api/marketing/sync/meta-breakdowns/route.ts` was deleted.
- **Recovery state:** the deletion is **uncommitted**. Both the route and its migration
  (`supabase/migrations/2026-05-04_meta_ad_breakdowns_daily.sql`) are intact in the repo at
  HEAD. Restoring is `git restore` — no rewrite needed.
- **Evidence it was not intentionally retired:** the table still exists and is populated;
  downstream creative-angle analysis (EXP-3) depends on it; no deprecation note exists.
- **Prepared plan:** restore route → read-only validation run → include in nightly analytics
  sync → duplicate protection on `(ad_id, date, breakdown)` → failure logging to
  `marketing_analytics_sync_runs` → document in `refresh-schedules.md`.
- **Approval required before any deploy.**

## 2. Meta asset performance — ONE canonical refresh path

- **Table:** `meta_asset_performance_daily` — 156 rows, last **2026-03-02** (151 d stale).
- **Finding:** two competing paths exist — `refresh-asset-performance.mjs` and the
  `process-directives` route. Neither runs in the nightly sync.
- **Recommendation:** make `refresh-asset-performance.mjs` canonical (script, testable,
  no HTTP auth surface) and invoke it from the nightly analytics sync. Retire the
  directives path or document explicitly why both exist.
- **Not the top priority.** The current funnel diagnosis does not depend on it, and the
  data does not yet support calling asset performance the constraint.

## 3. GA4 / GSC — documented, not blocking

- `ga4_page_hourly` last 2026-06-13; `gsc_query_page_daily` last 2026-06-12.
- **Cause:** Google authentication failure.
- **Remediation path:** re-authorise the Google service credential, backfill from the last
  good date, verify `gsc_sync_runs` records a success, re-enable the schedule.
- **Explicitly not a prerequisite** for the current diagnosis — the dominant loss is
  first-party and on-site. Do not block on this.

## 4. NEW — preview-traffic contamination (highest data-integrity priority)

- **Defect:** Shopify theme-editor preview traffic is ingested with `is_internal=false`
  and is therefore counted as real customer traffic.
- **Signature:** `page_url` on `everestcoldwater.myshopify.com`, `?source=visualPreviewInitialLoad`,
  `?oseid=…`.
- **Impact:** 57 sessions supplying **8 of 34** add-to-cart sessions (24% overstatement);
  far larger distortion at event level (~16 duplicate cart events per session).
- **Interim control:** the mandatory host filter in
  `marketing/data-contracts/metric-definitions.md` §0. Already applied to every figure
  in this audit.
- **Permanent fix (prepared, not applied):** set `is_internal=true` at ingestion for any
  event whose `page_url` host is not `everestlabs.co`.
- **Consequence:** any prior KRYO funnel analysis without this filter overstated add-to-cart.
