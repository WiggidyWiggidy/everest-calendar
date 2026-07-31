# Meta MCP tool map

Seeded 2026-07-28 from a manual JSON-RPC session against `https://mcp.facebook.com/ads` (not yet run through `/meta-setup`). Tool names below are confirmed via live `tools/list` (98 tools total). Metric field paths are NOT yet confirmed — the one insights call attempted this session errored (`time_range` as a JSON string was rejected: "expected dict, got string"). Run `/meta-setup` or `/meta-verify` to fix the calling convention and complete the metric mapping below before relying on it.

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
| Spend | REQUIRED |
| Impressions | REQUIRED |
| Reach | REQUIRED |
| Frequency | REQUIRED |
| CPM | REQUIRED |
| Link/outbound clicks | REQUIRED |
| Link/outbound CTR | REQUIRED |
| Link/outbound CPC | REQUIRED |
| Landing page views | REQUIRED |
| Add to carts | REQUIRED |
| Initiate checkouts | REQUIRED |
| Purchases | REQUIRED |
| Purchase conversion value | REQUIRED |
| Purchase ROAS | REQUIRED or derived |

## Known limitations

- Pagination behaviour: REQUIRED
- Maximum date window / row limit: REQUIRED
- Attribution behaviour: REQUIRED
- Creative asset retrieval behaviour: REQUIRED
- Unsupported metrics/breakdowns: REQUIRED
