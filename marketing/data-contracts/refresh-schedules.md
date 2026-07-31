# Refresh Schedules

| Source | Mechanism | Cadence | Observed lag 2026-07-31 |
|---|---|---|---|
| `attribution_touches` | Storefront web pixel | Continuous | 0.0 d — healthy |
| `meta_ad_metrics_daily` | Nightly analytics sync | Daily | 1.4 d — healthy |
| `clarity_friction_elements` | Nightly analytics sync | Daily | 1.4 d — healthy |
| `shopify_funnel_daily` | Nightly analytics sync | Daily | 1.4 d — healthy |
| `clarity_section_heatmap` | Nightly analytics sync | Daily | 2.4 d — acceptable |
| `lp_funnel_daily` | Nightly analytics sync | Daily | 3.4 d — lagging |
| `meta_ad_breakdowns_daily` | **none — route deleted** | — | 75 d |
| `meta_asset_performance_daily` | **none in nightly sync** | — | 151 d |
| `ga4_page_hourly` | Google auth — failing | Hourly | 48 d |
| `gsc_query_page_daily` | Google auth — failing | Daily | 49 d |
| `shopify_orders` | **unknown / not producing rows** | — | empty |

Sync outcomes are logged to `marketing_analytics_sync_runs`.
Freshness thresholds for analysis: see `CLAUDE.md` → Data freshness gate.
