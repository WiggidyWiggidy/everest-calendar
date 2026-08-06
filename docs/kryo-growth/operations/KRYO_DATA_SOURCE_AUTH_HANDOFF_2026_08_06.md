# KRYO Data Source Authentication Handoff

Date: 2026-08-06
Owner: Tom / KRYO growth operator
Repo: `WiggidyWiggidy/everest-calendar`
Vercel project: `prj_qR9zv74j4YKo8x55SlwpV9SvA8xy`
Supabase project: `oksemtvjcfzicksmukmz`

## Current state

Database stale rows have been purged. External analytics sources are schema-ready but blocked by `vw_kryo_source_health` until fresh data returns.

Trusted now:

- Shopify Admin readout
- First-party Supabase attribution events
- KRYO PDP session quality events

Blocked until authentication is fixed:

- Meta Graph Ads
- GA4 Data API
- Google Search Console
- WhatsApp-assisted sales
- Shopify order attribution

## Rule

Agents must not use a source for experiment decisions unless `public.vw_kryo_source_health.decision_allowed = true`.

Health endpoint after deploy:

```text
GET /api/marketing/source-health
```

## Vercel env values

Vercel sensitive environment variable values are not readable once created. The correct validation is: presence check + health route + small API call, not printing secrets.

## Meta clean setup

Do not use Pipeboard.

Required Vercel production env vars:

```text
META_ACCESS_TOKEN=<valid Meta Marketing API token>
META_AD_ACCOUNT_ID=act_1737922103322223
MARKETING_SYNC_META_ENABLED=true
```

Preferred token type:

- Meta Business Manager system-user token
- Ad account asset access to `act_1737922103322223`
- Minimum permissions for read-only reporting: `ads_read`, `read_insights`
- Add `ads_management` only when API-side ad changes are deliberately enabled

Validation sequence:

1. Set `META_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID` in Vercel production.
2. Set `MARKETING_SYNC_META_ENABLED=true` only after token is correct.
3. Call `/api/marketing/source-health` to confirm env presence.
4. Call `/api/marketing/sync/meta-ad-insights` with `{ "days": 3 }`.
5. Confirm `meta_ad_metrics_daily` has fresh rows.
6. Confirm `vw_kryo_source_health` shows `meta_graph_ads` as `fresh_trusted`.

Failure meanings:

- `Error validating application. Application has been deleted.` means the token is tied to a deleted Meta app. A refresh will not fix it. Create a fresh token from the current Meta Business/app setup.
- Pipeboard/weekly-limit errors must not be used or debugged. Pipeboard is deprecated for KRYO.

## GA4 clean setup

Preferred auth method: service account.

Required Vercel production env vars:

```text
GA_PROPERTY_ID=<GA4 numeric property id>
GA_SERVICE_ACCOUNT_JSON=<base64-encoded service account json>
MARKETING_SYNC_GA4_ENABLED=true
```

Fallback only if service account is not possible:

```text
GOOGLE_OAUTH_CLIENT_ID=<client id>
GOOGLE_OAUTH_CLIENT_SECRET=<client secret>
GOOGLE_OAUTH_REFRESH_TOKEN=<fresh refresh token>
```

Required Google-side permission:

- Add the service account email to the GA4 property with Viewer or Analyst access.

Validation sequence:

1. Confirm the exact GA4 property ID.
2. Add service account email to the GA4 property.
3. Set `GA_PROPERTY_ID` and `GA_SERVICE_ACCOUNT_JSON` in Vercel production.
4. Set `MARKETING_SYNC_GA4_ENABLED=true`.
5. Call `/api/marketing/sync/ga4-hourly` with `{ "days": 3, "kryo_only": false }`.
6. Confirm `ga4_site_hourly` and `ga4_page_hourly` have fresh rows.
7. Confirm `vw_kryo_source_health` shows `ga4_data_api` as `fresh_trusted`.

Failure meanings:

- `403 PERMISSION_DENIED` means the property ID is wrong or the authenticated account/service account lacks access.
- Do not keep retrying the same refresh token if it returns `invalid_grant`; re-auth or use service account.

## Google Search Console clean setup

GSC usually needs OAuth user access to a verified property.

Required Vercel production env vars:

```text
GSC_SITE_URL=<exact verified GSC property url or sc-domain property>
GOOGLE_OAUTH_CLIENT_ID=<client id>
GOOGLE_OAUTH_CLIENT_SECRET=<client secret>
GOOGLE_OAUTH_REFRESH_TOKEN=<fresh refresh token with GSC scope>
MARKETING_SYNC_GSC_ENABLED=true
```

Validation sequence:

1. Confirm `GSC_SITE_URL` exactly matches the verified property.
2. Generate a fresh refresh token using the Google account with verified-owner or delegated-owner access.
3. Set Google OAuth env vars in Vercel production.
4. Set `MARKETING_SYNC_GSC_ENABLED=true`.
5. Call `/api/marketing/sync/gsc` with `{ "days": 14, "freshDays": 2, "includeHourly": false }`.
6. Confirm `gsc_query_page_daily` has rows.
7. Confirm `vw_kryo_source_health` shows `google_search_console` as at least `fresh_secondary`.

Failure meanings:

- `invalid_grant` means the refresh token is invalid, expired, revoked or from the wrong OAuth flow/account. Generate a new refresh token.
- Do not rely on hourly GSC until daily sync works.

## Cron behaviour after cleanup

The main marketing cron now fails closed.

Always enabled:

- Shopify sync
- Shopify funnel sync
- Attribution processing
- Findings refresh
- KRYO scorecard

Disabled unless explicit env flag is true:

- Meta syncs: `MARKETING_SYNC_META_ENABLED=true`
- GA4 sync: `MARKETING_SYNC_GA4_ENABLED=true`
- GSC sync: `MARKETING_SYNC_GSC_ENABLED=true`
- Clarity sync: `MARKETING_SYNC_CLARITY_ENABLED=true`

This prevents broken external sources from repeatedly failing or contaminating readouts.

## Codex should not do

- Do not reintroduce Pipeboard.
- Do not create another dashboard.
- Do not repopulate stale historical Meta/GA4/GSC data until the source passes health.
- Do not treat empty external tables as zero performance.
- Do not expose, print or commit secrets.

## Codex can do after Tom finishes auth

1. Call source health.
2. Run the matching sync route for the fixed source.
3. Backfill only after fresh sync succeeds:
   - Meta: last 30 days
   - GA4: last 14 days
   - GSC: last 30 days daily only
4. Recheck `vw_kryo_source_health`.
5. Only then re-enable the source in experiment readouts.
