# Reconnection Status — evidence-based (2026-07-31)

Health judged by **actual data recency in Supabase** (truest signal of what's connected),
cross-checked against the last `marketing_analytics_sync_runs` row. No tokens rotated; no
prod writes. Sandbox has no internet egress, so live token calls must run on the Mac.

## Verdict per source
| Source | Latest data | Stale | Live status | Evidence |
|---|---|---|---|---|
| First-party pixel (`attribution_touches`) | 2026-07-31 | 0d | **CONNECTED** | 13,159 rows, updating today |
| **Meta** core (`meta_ad_metrics_daily`) | 2026-07-30 | 1d | **CONNECTED** | sync run: meta=200 |
| **Shopify** (`shopify_funnel_daily`) | 2026-07-30 | 1d | **CONNECTED** | sync run: shopify=200 |
| **Clarity** (`clarity_friction_elements`) | 2026-07-30 | 1d | **CONNECTED** | sync run: clarity=200 |
| Correlation (`ad_metrics_daily`,`lp_funnel_daily`) | 2026-07-28 | 3d | **LAGGING** | compute running behind |
| **GSC** (`gsc_query_page_daily`) | 2026-06-12 | 49d | **BROKEN** | sync run: gsc=**500** |
| **GA4** (`ga_pages_daily`) | 2026-06-07 | 54d | **BROKEN** | sync run: ga4_hourly=**500** |
| Meta breakdowns (`meta_ad_breakdowns_daily`) | 2026-05-17 | 75d | **STALE (not 500)** | route deleted in working tree; sync not invoked |
| Meta creative perf (`meta_asset_performance_daily`) | 2026-03-02 | 151d | **STALE (not 500)** | 2,796-asset library not being scored |

## Read of it
- **Good news:** Meta (core), Shopify, Clarity, and the storefront pixel are all live and fresh
  (≤2 days). These do **not** need reconnecting — the runbook's pessimism is outdated.
- **The real breakage is GA4 + GSC only.** Both have returned HTTP 500 since ~mid-June while
  everything else returns 200. Both routes obtain a Google token via service-account JWT
  (`GA_SERVICE_ACCOUNT_JSON`) OR OAuth refresh (`GOOGLE_OAUTH_REFRESH_TOKEN`), then 500 on
  "Failed to get Google access token" / "GSC API error". **Most likely cause:** the Google OAuth
  refresh token was revoked/expired (classic when the OAuth consent screen is in "Testing" mode →
  refresh tokens die after 7 days), and/or the service account is no longer granted on GA4
  property `GA_PROPERTY_ID` / the GSC site `GSC_SITE_URL`. Credentials for both **exist** in
  `.env.prod.local`; they've simply gone invalid.
- **Two Meta sub-feeds are stale but NOT failing** — they aren't being called. `meta_ad_breakdowns`
  (its route/migration were deleted in the working tree) and `meta_asset_performance` (the creative
  library scorer). The latter is the biggest missed lever for creative-driven split tests.

## Blockers on my side (need the Mac)
1. **Git preservation blocked:** `.git/index.lock` (empty, ~3.5h old) can't be removed from the
   sandbox ("Operation not permitted" on the mounted FS). Fix on Mac: `rm -f .git/index.lock`.
2. **No sandbox network:** cannot call Google/Meta/Shopify/Clarity from here. Live re-auth and the
   readiness scripts must run in the Mac Terminal (has network + env).

## Exact next actions (Mac Terminal, in your repo)
```bash
cd ~/Desktop/Claude\ Project/everest-calendar
# 1) unblock git so the Mac-only toolchain can be committed + pushed
rm -f .git/index.lock

# 2) see the REAL GA4/GSC error (this is what 500s)
node scripts/kryo-source-health.mjs --out /tmp/kryo-health   # or hit the routes directly:
# curl -s -H "x-sync-secret: $MARKETING_SYNC_SECRET" https://<yourapp>/api/marketing/sync/ga4 | jq
```
Then paste me the GA4/GSC error detail and I'll fix the auth (regenerate the Google OAuth refresh
token with consent screen in "Production", or re-grant the service account on the GA4 property +
GSC site), re-enable the two stale Meta feeds, and catch up the correlation layer.

## Order (matches your plan)
Shopify ✓ · Meta ✓ · Clarity ✓ (already connected) → **fix GA4 + GSC (the actual work)** →
re-enable meta breakdowns + asset-performance → catch up correlation → analytics agent + split tests.
