---
depends-on: [money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# B2C Marketing System Map (2026-07-31) — read-only

## Application
- **Next.js app:** `everest-calendar/` (App Router, `src/app`). Deployed to Vercel
  (`vercel.json`, project ref in `supabase/.temp/project-ref`).
- **Marketing dashboard UI:** `src/components/marketing/MarketingDashboard.tsx` +
  `ICEMatrixTab.tsx` (untracked); route group `src/app/(app)/marketing`.
- **Landing-page section library:** `src/lib/page-sections/` — existing + 5 new untracked
  variants (`bentoGrid`, `comparisonSlider`, `marqueeBand`, `scrollRevealMetrics`,
  `stickyScrollytelling`) = split-test building blocks.
- **Shared marketing lib:** `src/lib/marketing/` (untracked, 112K) — imported by routes;
  treat as critical.

## Marketing API routes (`src/app/api/marketing/…`)
- **Sync:** `sync/{meta,meta-ads,meta-campaigns,meta-dce,meta-ad-insights}`, `sync/{shopify,
  shopify-funnel}`, `sync/{ga4,ga4-hourly,ga4-pages}`, `sync/gsc`, `sync/clarity`,
  `sync/storefront-event`, `sync/extract-assets`, `sync/resolve-meta-asset-urls`.
- **Launch/experiment:** `launch/{clone-page,promote-ads,publish-product}`,
  `experiments/`, `experiments/execute/`, `kryo/update-page` (untracked `kryo/`).
- **Theme ops:** `theme/{info,asset,clone-template,configure-product,deploy-asset}`.
- **Shopify:** `shopify/{whoami,get-product,admin-graphql,delete-product,upsert-redirect,
  upload-image}` (last three untracked).
- **Reporting/ops (untracked):** `ops/`, `reports/`, `log-change/`, `insights/`,
  `campaign-intelligence`, `analyse-strategy`, `proposals`, `execute-proposal`.
- **Images:** `images/generate`, `media-assets`.
- **Webhooks:** `webhooks/meta-leads` (modified), `webhooks/meta-whatsapp` (untracked),
  `webhooks/shopify`.

## Cron jobs (`vercel.json`)
| Path | Schedule |
|---|---|
| /api/cron/cowork-followup | `0 0 * * *` (daily 00:00) |
| /api/cron/process-directives | `0 6 * * *` (daily 06:00) |
| /api/cron/marketing-analytics-sync | `0 7 * * *` (daily 07:00) — Meta/GA4/Shopify/Clarity roll-up |

Local scheduled runners (launchd, untracked): `scripts/system/kryo-analytics-ops-runner.plist`,
`scripts/ai.everestlabs.agent-memory-sync.plist`.

## Integrations (env-var NAMES only — no values)
| Source | Env vars (names) | Path in code |
|---|---|---|
| Supabase | EVEREST_SUPABASE_URL, EVEREST_SUPABASE_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | `src/lib/supabase/*`, all routes |
| Meta (DIRECT) | META_ACCESS_TOKEN, META_SYSTEM_USER_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_GRAPH_VERSION, META_PIXEL_ID, NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, FACEBOOK_CONVERSIONS_API_TOKEN, META_WHATSAPP_BUSINESS_ACCOUNT_ID, META_WHATSAPP_PHONE_NUMBER_ID | `sync/meta*`, `webhooks/meta-*`, `scripts/*meta*` |
| Meta (MCP) | OAuth via `meta-ads` server in `~/.claude.json` | `.claude/meta/*`, `mcp__meta-ads__*` |
| Shopify | SHOPIFY_STORE_URL, NEXT_PUBLIC_SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET | `shopify/*`, `theme/*`, `webhooks/shopify` |
| GA4 + GSC | GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN, GSC_SITE_URL | `sync/ga4*`, `sync/gsc` |
| Clarity | CLARITY_API_TOKEN, CLARITY_PROJECT_ID | `sync/clarity` |
| Internal sync auth | MARKETING_SYNC_SECRET, NEXT_PUBLIC_MARKETING_SYNC_SECRET, ALLOW_QUARANTINED_MARKETING_SYNCS | sync routes + `scripts/qc-shopify-page.mjs` |

Note: GA4/GSC already use **direct Google OAuth** in code. "Pipeboard" now appears only inside
health/preflight scripts as a *source to check*, not a core dependency — so the
"Meta not Pipeboard / re-establish GA4+GSC directly" direction is already largely reflected in code.

## Supabase (canonical live data) — see prior list_tables audit
~180 tables. Marketing-relevant families: `meta_*` (ads/campaigns/adsets/metrics/creative_assets),
`shopify_funnel_daily` + `shopify_orders`, `ga4_*` + `ga_pages_daily` + `gsc_query_page_daily`,
`clarity_*`, `attribution_touches` (13,108), `ad_metrics_daily`, `lp_funnel_daily`,
`kryo_*` (funnel, lp_scorecards, pdp_*, images, copy_slots, growth_experiments),
`marketing_{experiments,findings,learnings,proposals,change_log,guardrail_alerts}`.
Correlation scaffolding exists but is **empty**: `analytics_identity_registry` (0),
`analytics_reconciliation_daily` (4), `analytics_metric_dictionary` (9), `benchmark_registry` (4).
Correlation RPCs present: `compute_ad_metrics_daily`, `compute_lp_funnel_daily`,
`compute_clarity_section_heatmap`, `refresh_marketing_findings`, `compute_significance`.

## Migrations / functions
`supabase/migrations/` — many tracked + several **untracked** critical ones:
`20260608170000_kryo_analytics_operating_system_v2.sql`, `20260725050000_kryo_measurement_spine.sql`,
`20260725062000_kryo_whatsapp_cloud_api.sql`, plus diagnostics/experiment migrations. Numerous
`*_remote_applied_placeholder.sql` markers indicate migrations applied directly to remote.
**Do not delete any migration that may already be applied remotely** (see working-tree B).

## Experiment / findings / funnel / metric definitions
- Experiment code: `api/marketing/experiments{,/execute}`, scripts `kryo-experiment-*`,
  tables `marketing_experiments`, `experiment_daily_metrics`, `kryo_growth_experiments`,
  `experiment_readouts_daily`; significance via `compute_significance`.
- Funnel definition: `marketing/foundation/funnel.md` (impression→click→LPV→engaged→CTA→
  WhatsApp→enquiry→deposit→checkout).
- Metric definitions: `.claude/meta/metric-dictionary.md` + Supabase `analytics_metric_dictionary`
  (must be reconciled).
- Findings/learnings: `marketing_findings` (11), `marketing_learnings` (17), `hypothesis_learnings`.

## Target of all of this
Live landing page **https://everestlabs.co/products/kryo2_** (34 variants tracked in
`landing_pages`). Split-test engine components exist; they need trustworthy correlated data.
