# Meta MCP tool map

Seeded 2026-07-28 from a manual JSON-RPC session against `https://mcp.facebook.com/ads`; VERIFIED 2026-07-28 via a successful live `ads_get_ad_entities` call through the MCP tool interface (ad level, time_range + filtering + fields, real data returned for account 1737922103322223).

## Confirmed calling convention (from the successful live call)

- `time_range`: JSON **string**, e.g. `'{"since":"2026-07-27","until":"2026-07-28"}'` — this works. (The earlier "expected dict, got string" error was caused by `filtering` passed as strings, not by time_range.)
- `filtering`: array of **objects**: `[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE"]}]` — field must be `level.field_name`.
- Metrics only return when `time_range` or `date_preset` is supplied; without one you get attributes only.
- Values come back **formatted as strings** (`"A$27.75 AUD"`, `"1,157"`, `"3.89%"`) — parse before arithmetic.
- Missing metrics return the string `"Not available"`, not null/0 — never treat as zero without checking.
- Valid ad-level fields (returned by the server's own validation error, 2026-07-28): `amount_spent`, `impressions`, `reach`, `frequency`, `cpm`, `cpc`, `ctr`, `clicks`, `actions:link_click`, `outbound_clicks`, `omni_landing_page_view`, `omni_add_to_cart`, `omni_initiated_checkout`, `actions:omni_purchase`, `omni_purchase_values`, `purchase_roas`, `cost_per_omni_purchase`, `cost_per_link_click`, `website_purchase_roas`, video metrics (`video_thruplay_watched_actions` etc.), plus attributes `id`, `name`, `effective_status`, `status`, `objective`, `campaign_id`, `adset_id`, `creative_id`, `created_time`, `updated_time`. NOT valid at ad level: `spend` (use `amount_spent`), `inline_link_clicks` (use `actions:link_click`), bare `actions`.

## Server

- Configured server key: `meta-ads` (`~/.claude.json`, user scope)
- Canonical tool prefix: `mcp__meta-ads__`
- Authentication/account tested: OAuth confirmed live 2026-07-28; `ads_get_ad_accounts` returned real data for account 1737922103322223

## Confirmed read-only tools (name confirmed; call convention NOT fully verified)

| Tool | Purpose | Essential inputs | Output notes |
|---|---|---|---|
| `ads_get_ad_accounts` | List ad accounts on the authenticated business | none required | Confirmed working — returns array incl. status, currency, is_queryable |
| `ads_get_ad_entities` | Get campaign/adset/ad level entities + metrics | `ad_account_id`, `fields` required; `level`, `filtering`, `time_range`, `date_preset`, `time_increment`, `limit` optional | NOT yet successfully called — `time_range` must likely be passed as an object `{since, until}`, not a JSON-encoded string; `filtering` likely needs objects not strings. Confirm both before use. |
| `ads_entity_schedule_report` / `ads_entity_get_report` | Async report scheduling + polling for larger entity pulls | `report_run_id` for the getter | Long-polls up to ~25s; do not busy-retry |
| `ads_insights_performance_trend` | Trend-level insights | `ad_account_id` required; `entity_ids`, `analysis_level`, `analysis_metric` optional | Not yet called |
| `ads_insights_advertiser_context` / `ads_insights_anomaly_signal` / `ads_insights_auction_ranking_benchmarks` / `ads_insights_industry_benchmark` | Diagnostic/benchmark insights | `ad_account_id` required | Not yet called |
| `ads_get_ad_account_pages`, `ads_get_user_pages`, `ads_get_ad_account_custom_audiences`, `ads_get_custom_audience_adsets`, `ads_get_creatives`, `ads_get_creative_ads`, `ads_get_ad_images`, `ads_get_ad_videos`, `ads_get_ad_preview` | Object/creative lookups | varies | Names confirmed via `tools/list`; not called |

## Confirmed mutation tools (DO NOT allowlist — keep behind `ask`)

| Tool | Mutation | Required inputs | Rollback/read-before-write method |
|---|---|---|---|
| `ads_create_campaign`, `ads_create_ad_set`, `ads_create_ad`, `ads_create_creative` | Create objects | varies | Read-before-write not applicable (new object); confirm via `ads_get_ad_entities` after |
| `ads_update_entity`, `ads_activate_entity` | Change status/budget/bid/fields on existing objects | object id + fields | Read current state via `ads_get_ad_entities` first, verify after |
| `ads_create_custom_audience`, `ads_update_custom_audience`, `ads_update_custom_audience_users`, `ads_delete_custom_audience` | Audience mutation | audience_id | — |
| `ads_creative_update`, `ads_creative_delete`, `ads_creative_upload_image`, `ads_creative_upload_video` | Creative mutation | creative_id | — |
| `ads_catalog_*` (create/update/delete product, feed, product set, feed rule) | Catalog mutation | catalog/product ids | — |
| `ads_pixel_event_*`, `ads_pixel_parameter_*` (create/update/delete) | Pixel/conversion config mutation | dataset/event ids | — |
| `ads_experiment_abtest_create_test`, `ads_experiment_abtest_update_test`, `ads_experiment_lift_create_test` | Experiment mutation | varies | Use only via `/meta-experiment` |
| `ads_boost_ig_post` | Creates a boosted-post campaign | post id | — |

## Canonical metric mapping

| Semantic metric | MCP/API field or extraction path |
|---|---|
| Spend | `amount_spent` (formatted string incl. currency) |
| Impressions | `impressions` |
| Reach | `reach` |
| Frequency | `frequency` |
| CPM | `cpm` |
| Link/outbound clicks | `actions:link_click` (or `outbound_clicks`) |
| Link/outbound CTR | `ctr` is all-click — derive link CTR as `actions:link_click / impressions`; `unique_link_clicks_ctr` also available |
| Link/outbound CPC | `cost_per_link_click` (bare `cpc` is all-click) |
| Landing page views | `omni_landing_page_view` |
| Add to carts | `omni_add_to_cart` (value: `action_values:omni_add_to_cart`) |
| Initiate checkouts | `omni_initiated_checkout` |
| Purchases | `actions:omni_purchase` |
| Purchase conversion value | `omni_purchase_values` |
| Purchase ROAS | `purchase_roas` (also `website_purchase_roas`) |

## Known limitations

- Pagination behaviour: REQUIRED
- Maximum date window / row limit: REQUIRED
- Attribution behaviour: REQUIRED
- Creative asset retrieval behaviour: REQUIRED
- Unsupported metrics/breakdowns: REQUIRED
