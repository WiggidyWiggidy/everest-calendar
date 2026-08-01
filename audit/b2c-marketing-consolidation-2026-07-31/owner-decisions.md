---
depends-on: [delivery.cost_per_lpv, delivery.uptime, money.cpa, money.sales_lifetime, site.tracking_capi]
---

# Owner Decisions Required — Tom (2026-07-31)

Consolidation cannot proceed past preservation without these. Nothing will be merged, deleted,
renamed, or pushed until you confirm.

## Decisions
1. **Push newest work to GitHub now?** Phase 1 commits the untracked B2C toolchain + migrations
   + docs to `codex/kryo-proof-guardrails` and pushes. (Recommended — it's currently Mac-only.)
2. **Tracked deletions — confirm each:**
   - `docs/SHOPIFY_WEB_PIXEL.md` (delete OK?)
   - `src/app/api/marketing/sync/meta-breakdowns/route.ts` (removed intentionally?)
   - `supabase/migrations/2026-05-04_meta_ad_breakdowns_daily.sql` — **was this migration already
     applied to the remote DB?** If yes, do NOT delete the file; use a forward migration instead.
3. **Branch fate:** approve "compare-only" review of `codex/google-oauth-ga4-gsc`,
   `codex/gsc-fast-analytics`, `feature/creative-velocity-engine`, `codex/kryo-clean-clarity-7d`
   to salvage unique work. Which (if any) can be archived outright?
4. **Fill the economics blanks** in `.claude/meta/account-context.md`: selling price, gross
   revenue/purchase, variable cost, break-even CPA, target CPA, break-even/target ROAS, min spend
   before judging a no-purchase ad, min purchases before a winner claim. **Blocking for verdicts.**
5. **Canonical metric dictionary:** file (`.claude/meta/metric-dictionary.md`) or DB
   (`analytics_metric_dictionary`) as source of truth? (Proposed: DB is canonical, file mirrors.)
6. **Meta path:** confirm MCP `meta-ads` (OAuth) as primary and direct Graph token as fallback —
   or vice-versa. Also: re-auth the Meta MCP to clear the suspected 403.
7. **GA4/GSC re-establish:** confirm direct Google OAuth (not Pipeboard) is the intended path
   (code already uses `GOOGLE_OAUTH_*`).
8. **Security — RLS:** approve a plan to enable Row-Level Security + policies on the 98 exposed
   tables (currently anon key can read/write all marketing + customer data). Do not auto-apply.
9. **Skill/rule home:** approve `.claude/skills/` as the single skill location and splitting
   `CLAUDE.md` into a marketing-only entry (CAD/supplier removed from B2C agent).

## Explicitly confirmed out of scope (no action)
B2B (`KRYO_B2B`, `b2b_*`), manufacturing/CAD (`KRYO_2.0`, `01_Manufacturing`, `CAD_RUNBOOK.md`),
suppliers (`supplier_*`, `SUPPLIER_RUNBOOK.md`, `source-supplier` skill). Desktop proof/validation
folders remain untouched pending a separate decision.
