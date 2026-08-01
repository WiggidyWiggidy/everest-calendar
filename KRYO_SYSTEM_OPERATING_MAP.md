# KRYO System Operating Map

Generated for systems-only cleanup. This is the canonical map for future KRYO website work and marketing-data analysis. It does not authorize live Shopify, Meta, or ad mutations.


## Mandatory preflight

Before any KRYO website-change plan or marketing recommendation, run:

```bash
npm run operator:kryo-preflight -- --mode all --handle kryo2_
```

Mode-specific shortcuts:

```bash
npm run operator:kryo-preflight -- --mode marketing
npm run operator:kryo-preflight -- --mode website --handle kryo2_
```

The preflight is intentionally blocking when:

- Current paid-ad CPA/ROAS/winner/scale claims are requested without fresh Meta delivery rows. Pipeboard Meta is canonical; direct Meta is deprecated fallback only.
- Shopify readiness finds a template/product blocker such as foreign variant IDs.
- Recommendation text contains current CPA/ROAS/winner/scale claims while sources are stale.
- A queried route/task/connector is quarantined.

Preflight does not mutate Shopify, ads, products, themes, or budgets.

## Non-negotiable rules

- No live Shopify/theme/product/ad mutation without Tom explicitly approving a named patch.
- Every metric used for a recommendation must carry source, max data timestamp, and freshness status.
- Stale data can be shown only as historical context, never as a current verdict.
- Shopify page work is not complete until asset readback and public render QC pass.
- If public render is blocked by Shopify/CDN/rate limit, report `asset readable, public render not verified`.

## Canonical website-ops path

1. Read product with `/api/marketing/shopify/get-product?handle=<handle>`.
2. Read live theme with `/api/marketing/theme/info`.
3. Read and back up target template with `/api/marketing/theme/asset?key=<template>`.
4. Produce a patch plan and dry-run diff locally.
5. Only after explicit approval, patch via `/api/marketing/theme/clone-template` or `/api/marketing/theme/deploy-asset`.
6. Re-read the changed asset and count old/new strings.
7. Render the normal public product URL with `?country=AE` and capture proof.
8. For cart logic changes, render an attached cart URL with the affected variant.

Canonical Shopify routes:

- `shopify/whoami` — app/scopes audit.
- `shopify/admin-graphql` — read-only Admin GraphQL checks unless a named mutation has approval.
- `shopify/get-product` — product/template/variant discovery.
- `theme/info` — live theme and theme-asset endpoint health.
- `theme/asset` — template/asset readback.
- `theme/clone-template` — approved template patch/clone path.
- `theme/configure-product` — approved product/template binding path.
- `launch/clone-page` — approved new-product clone path.

## Canonical data sources and metric validity

| Metric family | Canonical source | Freshness threshold | Current rule |
|---|---|---:|---|
| Paid Meta spend, LPV, ATC, IC, purchase, ROAS, CPA | `meta_ad_metrics_daily` | 24h | Use only when Pipeboard Meta is connected and fresh delivery rows exist. If ads are off, historical rows can be shown only with max-date labels. |
| Onsite intent | `vw_kryo_intent_daily` | 48h | Pool 7-day windows; daily rates are noise. |
| WhatsApp interest | `attribution_touches` where `event_type='whatsapp_click'` | 48h | Clicks only; conversations/closes require Tom/manual source. |
| Shopify orders/revenue | `shopify_funnel_daily` plus order sync | 48h | Use only when sync is fresh. |
| Clarity friction | `clarity_friction_elements` / section heatmap | 48h | Use for friction diagnosis, not paid-ad verdicts. |
| GA4 | Pipeboard Google Analytics MCP | 48h | Canonical GA4 source; connected for property 353715595, but currently quota-limited until Pipeboard usage resets/upgrades. |
| GSC | `gsc_query_page_daily` or future GSC connector | 48h | Still blocked; stale through 2026-06-12. |

Known invalid verdict metrics:

- Old first-party `add_to_cart` rows in `attribution_touches` undercount and must not be used for paid-ad ATC verdicts.
- Old first-party `order_placed` rows are not valid for paid purchase verdicts until order attribution is revalidated.
- `marketing_findings` rows derived from broken old journey trackers must be treated as historical/unsafe.


### Canonical WhatsApp number — hard rule

- Correct KRYO website / owner WhatsApp number: `+44 7724 709585` (`+447724709585`).
- Correct `wa.me` prefix: `https://wa.me/447724709585`.
- Verified in live Shopify `kryo2_` template on 2026-07-25.
- Vercel `OWNER_WHATSAPP_PHONE` is set to `+447724709585` in production/preview/development.
- Any other owner or website WhatsApp number is stale unless Tom explicitly replaces it after this date.
- Meta Ads screenshot-selected WhatsApp asset remains `Everest Labs` / `907927035270302`, but API verification is blocked until Pipeboard quota resets/upgrades or a fresh direct Meta token is provided.

## Source-health registry

Run `npm run audit:kryo-source-health` before marketing analysis.

Expected registry entries:

- `meta_direct` — deprecated direct Meta Graph token/app/account health.
- `pipeboard_meta` — Pipeboard Meta MCP connection health.
- `ga4` — Pipeboard GA4 live-read health plus stale warehouse fallback state.
- `gsc` — warehouse freshness and known GSC permission state.
- `clarity` — Clarity warehouse freshness.
- `shopify_funnel` — Shopify funnel warehouse freshness.
- `attribution_touches` — first-party event freshness.
- `shopify_admin_theme` — Shopify Admin/theme API read health.

## Recommendation gate

Run `npm run gate:kryo-recommendations -- --text-file <report.md>` before showing marketing recommendations.

The gate blocks current claims containing terms such as CPA, ROAS, conversion rate, winner, scale, or best ad when the required source is stale. Historical wording is allowed only when clearly labelled with stale/cache context.

## Website-readiness command

Run `npm run audit:kryo-shopify-readiness -- --handle kryo2_` before planning any Shopify change.

It must:

- Confirm Shopify API access/scopes.
- Confirm live theme and product/template mapping.
- Back up the target template locally.
- Detect variant ID mismatches and other dangerous template references.
- Check whether public render QC is currently possible.
- Write JSON and Markdown artifacts under `artifacts/kryo-shopify-readiness/`.

## Machine-readable registry

- Canonical/quarantine status is also recorded in `config/kryo-system-registry.json`.
- Treat that file as the system registry for agents before invoking old scheduled tasks, routes, or connectors.

## Quarantine-first cleanup

Canonical scheduled job:

- `kryo-marketing-watch` — canonical daily KRYO source-health, intent, experiment, and brief job.

Quarantine/manual-only candidates until proven needed:

- `kryo-hourly-meta-sync` — manual-only while ads are off and Pipeboard quota is limited.
- `kryo-daily-ads-briefing` — replaced by canonical watch brief.
- `kryo-cost-per-x-monitor` — unsafe while Meta data is stale.
- `marketing-data-sync` — overlaps canonical sync/watch.
- `marketing-agent` — must consume source-health gate before recommendations.
- `ad-performance-monitor` — unsafe while Meta data is stale.
- `creative-tester` — manual strategy only; no current winner claims while Meta stale.

Quarantine route families; do not hard delete yet:

- Mock/seed/restore/backup: `seed-mock`, `restore`, `backup/full`.
- Legacy body composer: `compose-body-html`.
- Duplicate/proposal executors: `execute-proposal`, `experiments/execute`.
- Duplicate sync variants: `sync/meta`, `sync/meta-ads`, `sync/meta-ad-insights`, `sync/meta-campaigns`, `sync/meta-dce`, `sync/ga4`, `sync/ga4-hourly`, `sync/ga4-pages`, `sync/gsc`.

Hard deletion should be planned only after the canonical system runs cleanly for 7 days.

## Connector policy

- Shopify writes: Vercel marketing API only.
- Shopify Dev MCP: docs/schema/dev inspection only, never live mutation.
- Supabase REST: canonical until Supabase MCP credentials are verified.
- Pipeboard Meta: canonical Meta source. Connected; no recent delivery rows means ads are off, not source failure.
- Pipeboard Google Analytics: canonical GA4 source at `https://google-analytics.mcp.pipeboard.co/`; quota limit is an account/plan blocker, not GA4 permission failure.
- Local analytics-mcp service-account path: deprecated fallback until permissions are fixed.
- GSC: still blocked until Search Console access or a dedicated connector exists.
- Chrome DevTools: optional render/debug helper; public render can fall back to HTTP/Playwright.

## Startup warmup caveat

`session_warmup` currently reports three BOM/component-health failures. Those are product/procurement completeness checks, not KRYO marketing-data or website-ops readiness checks. Use `npm run audit:kryo-source-health`, `npm run health:kryo-tools`, and `npm run operator:kryo-preflight` for marketing/site readiness.

## Growth OS additions added 2026-07-25

Chat insight and experiment design now use these read-only commands:

```bash
npm run analyse:kryo-performance
npm run audit:kryo-measurement-spine
npm run operator:kryo-experiment-packet
```

Artifacts:

- `artifacts/kryo-performance-analyst-pack/latest/analyst-pack.md`
- `artifacts/kryo-measurement-spine/latest/measurement-spine-health.md`
- `artifacts/kryo-experiment-packets/latest/experiment-spec.md`

Current hard blocker before a true WhatsApp/deposit experiment can be called live:

- The repository migration `supabase/migrations/20260725050000_kryo_measurement_spine.sql` exists, but the live DB migration is not applied yet.
- `supabase db push --dry-run --linked` is blocked by remote migration-history drift, so do not push the whole migration folder blindly.
- Until resolved, `kryo_leads`, `kryo_deposit_events`, and `vw_kryo_growth_spine_daily` are not usable in production.

Lead capture route prepared in repository:

- `POST /api/marketing/kryo/leads/capture`
- Public, consent-required, records to `kryo_leads` once the measurement-spine migration is applied.
- It does not send WhatsApp messages and does not create deposit/payment links.
