---
depends-on: [site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# Branch Map — last ~60 days (2026-07-31)

No branch was merged, cherry-picked, or checked out during this audit.
"In working tree?" = whether the branch's changes already appear in the current
`codex/kryo-proof-guardrails` working tree (inferred from route/file overlap).

## Foundation
- **Strongest foundation: `codex/kryo-proof-guardrails`** (current, HEAD 2026-07-06 + 144
  uncommitted). It carries the newest marketing routes, the proof/guardrail gates, and the
  entire untracked analytics toolchain. All consolidation should base here.
- `main` (2026-06-02, merge PR #151) is the stable trunk but ~1 month + 144 changes behind.

## Relevant B2C branches
| Branch | Last commit | Inferred purpose | Unique work? | In working tree? | Obsolete? | Domain | Recommended action |
|---|---|---|---|---|---|---|---|
| codex/kryo-proof-guardrails | 2026-07-06 | Proof/recommendation guardrails + current work | Yes (base) | — | No | B2C | **Base for consolidation** |
| codex/kryo-clean-clarity-7d | 2026-06-08 | Clean KRYO2 behaviour reporting + section telemetry | Likely partly | Partly (clarity route modified) | Maybe | B2C | compare further |
| codex/kryo-cart-tracker-v22 | 2026-06-02 | Direct cart permalink attribution fallback | Possibly | Unknown | Maybe | B2C | compare further |
| codex/kryo-analytics-v2 | 2026-06-02 | Resolve stale Meta URL guardrails | Possibly | Partly | Maybe | B2C | compare further |
| codex/kryo2-daily-cro | 2026-06-01 | Daily KRYO2 CRO scorecard | Possibly | Unknown | Maybe | B2C | compare further |
| codex/google-oauth-ga4-gsc | 2026-05-26 | Direct Google OAuth for GA4+GSC (prevent stale reads) | **Likely unique — relevant to GA4/GSC re-establish** | Partly (gsc/ga4 routes modified) | No | B2C | **requires Tom decision / compare further** |
| origin/codex/gsc-fast-analytics | 2026-05-26 | Fast GSC analytics cache | Possibly unique | Unknown | Maybe | B2C | compare further |
| origin/codex/fix-gsc-lint | 2026-05-26 | GSC sync lint fix | No | Likely | Yes | B2C | ignore |
| codex/ga4-48h-cache (+ -pr131-safe) | 2026-05-26/28 | Intraday GA4 snapshot + journey tracking | Possibly | Partly | Maybe | B2C | compare further |
| codex/ga4-hobby-cron-fix | 2026-05-28 | Daily GA4 cron for Vercel Hobby | Maybe | vercel.json changed | Maybe | B2C | compare further |
| codex/ga4-sync-setup | 2026-05-05 | Early GA4 sync + promote-ads image fix | Superseded | Likely | Yes | B2C | archive |
| feature/creative-velocity-engine | 2026-03-29 | 64 ad-copy variations generator (+ product-context helper) | **Likely unique, unpushed** | Unknown | Maybe | B2C | **requires Tom decision** |
| feature/marketing-engine-v3 | 2026-03-30 | Meta Graph v21→v25 upgrade (unpushed) | Maybe (superseded by newer meta code) | Likely superseded | Maybe | B2C | compare further |
| feature/clarity-telegram-digest | 2026-05-12 | 4h Clarity sync | Possibly | Partly | Maybe | B2C | compare further |
| feature/atc-diagnosis-loop | 2026-05-03 | clone-template split-test unlock | Likely merged | Likely | Yes | B2C | ignore |
| diagnostic/shopify-whoami | 2026-05-03 | Shopify identity/scopes diagnostic | Maybe | Possibly | Maybe | B2C | compare further |
| feature/launch-angle-system, clone-page-*, theme-discovery, update-body-html, list-shopify-files, upload-image | 2026-05-03/14 | Shopify/launch route features | Mostly merged to main | Likely | Mostly | B2C | ignore / spot-check |
| fix/daily-focus-control-dashboard | 2026-03-13 | Early CLAUDE.md (unpushed commit a6bae4f) | No | Superseded by current CLAUDE.md | Yes | B2C | archive |

## Excluded-domain branches
None of the above are B2B/manufacturing/CAD/supplier. (B2B lives in the separate `KRYO_B2B`
repo; supplier/CAD are excluded from this project entirely.)

## Net
- Base on `codex/kryo-proof-guardrails`.
- Four branches most worth comparing for **unique** work before anything is discarded:
  `codex/google-oauth-ga4-gsc`, `codex/gsc-fast-analytics`, `feature/creative-velocity-engine`,
  `codex/kryo-clean-clarity-7d`.
- Everything else is either already integrated, merged to main, or superseded — but **verify by
  diff before deletion** (next phase, with approval).
