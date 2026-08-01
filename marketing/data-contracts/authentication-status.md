# Authentication Status — 2026-07-31

| Integration | Status | Evidence |
|---|---|---|
| Supabase | **Working** | Live queries succeeded this session |
| Meta Ads API | **Working** | `meta_ad_metrics_daily` fresh to 2026-07-30 |
| Shopify storefront pixel | **Working** | `attribution_touches` live to 2026-07-31 09:11 UTC |
| Shopify Admin (orders) | **SUSPECT** | `shopify_orders` = 0 rows while `shopify_funnel_daily` updates. Either a sync failure or genuinely zero orders — **Tom must confirm which** |
| Microsoft Clarity | **Working** | `clarity_friction_elements` fresh to 2026-07-30 |
| Google Analytics 4 | **FAILED** | `ga4_page_hourly` last 2026-06-13 |
| Google Search Console | **FAILED** | `gsc_query_page_daily` last 2026-06-12 |
| WhatsApp / Green API | **NOT CAPTURING** | `kryo_whatsapp_conversations` = 0 rows |

## Remediation — Google (GA4 + GSC)
Re-authorise the Google service credential → backfill from last good date → confirm
`gsc_sync_runs` logs a success → re-enable schedule.
**Not blocking** the current diagnosis. See `CURRENT-STATE.md` for the binding constraint.

## Remediation — Shopify orders
Determine whether the order sync is broken or whether there are genuinely no orders.
This is decision #3 in `owner-decisions.md` and changes the entire priority order.
