# KRYO Metric Definitions

Every marketing recommendation must show source, max data timestamp and freshness status.

## Canonical source policy

| Metric | Canonical source | Freshness threshold | Notes |
|---|---|---:|---|
| Spend | `meta_ad_metrics_daily.spend` | 24h | Current claims require fresh delivery rows |
| Impressions | `meta_ad_metrics_daily.impressions` | 24h | Historical allowed with max date |
| Clicks | `meta_ad_metrics_daily.clicks` / outbound clicks preferred | 24h | Use outbound clicks for traffic quality |
| Landing-page views | `meta_ad_metrics_daily.landing_page_views` | 24h | Paid post-click quality |
| Paid ATC | `meta_ad_metrics_daily.add_to_carts` | 24h | Do not use old first-party ATC as paid verdict |
| Initiate checkout | `meta_ad_metrics_daily.initiate_checkouts` plus Shopify/first-party cross-check | 24h/48h | Reconcile naming |
| Purchase/revenue | Shopify orders/funnel when fresh; Meta for paid attribution when fresh | 48h/24h | Label source |
| WhatsApp interest | `attribution_touches.event_type='whatsapp_click'` | 48h | Click only, not qualified lead |
| Qualified lead | future WhatsApp/CRM status table | 48h | Missing today |
| Deposit initiated/completed | future deposit events/orders | 48h | Missing today |
| Clarity friction | `clarity_friction_elements`, `clarity_section_heatmap` | 48h | Diagnose friction, not paid winners |
| GA4 behavior | Pipeboard GA4 live read or `ga4_page_hourly` when fresh | 48h | Currently quota-limited/stale |
| GSC search | `gsc_query_page_daily` | 48h | Currently blocked |

## Forbidden current verdicts

Do not say current CPA, ROAS, conversion rate, winner, best ad, fatigue, or scale unless `npm run audit:kryo-source-health` says the required source is usable.

Historical paid data must say: `cached/historical through <max date>`.

## WhatsApp paid lead metrics

| Metric | Formula | Source | Freshness rule |
|---|---|---|---|
| Cost per website WhatsApp click | Meta spend / `whatsapp_click` sessions | `meta_ad_metrics_daily` + `attribution_touches` | Valid only when Meta spend is fresh and ad IDs/UTMs join |
| Cost per WhatsApp signup | Meta spend / `kryo_leads` | `meta_ad_metrics_daily` + `kryo_leads` | Valid only when Meta spend is fresh and lead capture is deployed |
| Cost per qualified WhatsApp lead | Meta spend / qualified `kryo_leads` | `meta_ad_metrics_daily` + `kryo_leads` | Requires manual/CRM qualification status |
| Cost per deposit | Meta spend / `deposit_completed` | `meta_ad_metrics_daily` + `kryo_deposit_events` | Requires deposit payment flow and fresh spend |
