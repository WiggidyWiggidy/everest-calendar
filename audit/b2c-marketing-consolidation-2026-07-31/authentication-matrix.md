---
depends-on: [site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# Authentication Matrix (2026-07-31) — safe read-only tests only

No credentials were rotated; no external permissions changed. Where an authenticated
external call would have required using a live secret, the test was **not** run (marked
Untested) to avoid exposing secrets or tripping rate/permission limits.

## The reported 403 — isolation result
Reported previously: `Failed to authenticate. API Error: 403 Request not allowed`.

- **That exact string does NOT appear in any accessible repo log/artifact.**
- The only 403s recoverable from evidence are in `artifacts/shopify-page-qc/**/shopify-page-qc.json`
  (2026-07-26): browser console entries `"Failed to load resource: the server responded with a
  status of 403 ()"` captured while QC-rendering the **public kryo2_ storefront** — i.e.
  **blocked front-end resource loads (asset/pixel/CDN) on the live page**, not an API auth failure.
- Therefore the reported `API Error: 403 Request not allowed` **could not be isolated from local
  evidence**. Its phrasing is characteristic of an **MCP-server / OAuth token rejection**, not the
  storefront 403s above. Highest-probability candidate given this setup: the **Meta Ads MCP
  (`meta-ads`, `mcp.facebook.com/ads`)** OAuth token — `account-context.md`/`tool-map.md` show it
  was "confirmed live 2026-07-28"; a later token expiry would produce a 403. Supabase is confirmed
  healthy (see below), so Supabase is an unlikely source. **Requires a live check of the Meta MCP
  session token to confirm.**

## Matrix
| Service | Config location | Env var NAMES (no values) | Read test attempted | Status | Error category | Likely cause | Safe remediation | Trust for analysis now? |
|---|---|---|---|---|---|---|---|---|
| **Supabase** | `.env.local`, Supabase MCP | EVEREST_SUPABASE_URL/SERVICE_KEY, NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY | `list_projects`, `list_tables`, `execute_sql` via MCP | **Working** | none | — | — | **Yes** (data reads trusted; note RLS-disabled security issue) |
| **GitHub** | git remote `origin` | (git credential helper) | `git ls-remote --heads origin` | **Working** | none | — | — | Yes (repo push/pull ok) |
| **Meta Ads (MCP `meta-ads`)** | `~/.claude.json` (user scope) + `.claude/meta/tool-map.md` | OAuth (server-managed) | Not runnable here (server not attached to this session) | **Untested / suspected 403** | OAuth token / permission | Session OAuth token likely expired since 2026-07-28 | Re-auth the `meta-ads` MCP; re-run `ads_get_ad_accounts` | No — verify first |
| **Meta Ads (DIRECT Graph)** | `.env.prod.local` | META_ACCESS_TOKEN, META_SYSTEM_USER_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_GRAPH_VERSION, META_PIXEL_ID, META_CAPI_ACCESS_TOKEN | Not run (would use live token) | **Untested** | — | Token may be short-lived; `exchange-meta-token.mjs` exists to mint long-lived | Run `scripts/verify-meta-token.mjs` locally (owner) | No — verify first |
| **Shopify** | `.env.prod.local` | SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID/SECRET, SHOPIFY_WEBHOOK_SECRET | Not run (live token) | **Untested** | — | Storefront resource 403s seen in QC may be unrelated CDN/theme asset blocks | Run `scripts/kryo-shopify-readiness.mjs` + `shopify/whoami` locally | No — verify scopes/theme first |
| **GA4** | `.env.prod.local` | GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN | Not run (live token) | **Untested** | — | Runbook notes GA4 was quota-limited via Pipeboard; code path is direct OAuth | Verify refresh token via `sync/ga4` dry run (owner) | No — re-establish AFTER Shopify/Meta/Clarity |
| **GSC** | `.env.prod.local` | GOOGLE_OAUTH_* , GSC_SITE_URL | Not run | **Untested** | — | Runbook: GSC stale since 2026-06-12 (permission/property) | Re-auth Google + confirm property access | No — re-establish last |
| **Microsoft Clarity** | `.env.prod.local` | CLARITY_API_TOKEN, CLARITY_PROJECT_ID | Not run | **Untested** | — | Clarity public export API limited (element data via own pixel) | Run `sync/clarity` dry check (owner) | Partial — friction only, not paid verdicts |
| **Vercel** | `.vercel/` , `vercel.json` | VERCEL_URL | Not run | **Untested** | — | Deploy protection could cause 403 on protected preview URLs | Check Vercel deploy-protection settings (owner) | N/A (hosting) |

## Notes
- The internal sync routes are gated by `MARKETING_SYNC_SECRET`; a mismatch there returns 401/403
  from the app itself — another possible source of an app-level 403 if a script ran without the
  header. Confirm `MARKETING_SYNC_SECRET` matches between env and caller.
- All "Untested" rows are untested **by choice** (safe-mode), not failures. Owner can run the
  named readiness scripts locally to fill them in without exposing secrets to this session.
