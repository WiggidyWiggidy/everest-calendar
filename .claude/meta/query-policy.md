# Minimal-query policy

## Default sequence

1. Read `account-context.md`, `tool-map.md` and the newest relevant report.
2. Translate the user's question into one decision and one primary KPI.
3. Query campaign-level aggregate data for the smallest complete date window.
4. Compare with one relevant baseline: previous equal period, target economics, or both.
5. Drill into only the campaigns/ad sets/ads materially responsible for spend or change.
6. Stop when the evidence answers the decision. Do not collect data merely because it is available.

## Default query limits

- Standard daily check: current 7 complete days and previous 7 complete days.
- Fast anomaly check: yesterday plus trailing 7 complete days.
- Audit: 30 complete days, with 7-day and previous-period context.
- Default level: campaign.
- Default row cap: 50; use filters to stay below it.
- Default fields: identifiers/names plus no more than 12–16 required metrics.
- Filter to delivery/spend greater than zero and relevant status where supported.
- One breakdown per query. Never request all combinations of age, gender, placement, device, region and day.
- Retrieve creative copy/media only after ad-level performance identifies a shortlist, normally top/bottom five.

## Avoid these token traps

- Listing every account before using the configured account ID.
- Pulling lifetime insights.
- Fetching campaign, ad set and ad levels in parallel before seeing the summary.
- Requesting full nested `actions`, `action_values`, `cost_per_action_type` and every video metric together.
- Repeating the same query because the first response was not normalised locally.
- Dumping raw JSON into the answer.
- Asking Meta for data already stored in a recent report unless freshness materially matters.

## Failure handling

- On timeout or oversized response: reduce date range, fields, level or row limit; do not repeat unchanged.
- On unsupported breakdown/field combinations: remove the least essential dimension and retry once.
- On empty conversion metrics: verify attribution setting, event mapping, object objective and reporting delay before declaring zero sales.
- On pagination: fetch only enough pages to cover material spend or the requested shortlist.
