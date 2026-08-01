# Data Readiness — PROFILE BEFORE YOU ANALYSE (binding, run every session)

The root cause of the 2026-07-31 failures: the agent queried tables and treated whatever came back as
truth, without ever checking whether the table was empty, thin, stale, or double-counted. A competent
analyst profiles the data first. **No analysis may run on a source until it has passed this profile.**

## Rule
Before any diagnosis/metric, run the readiness query below and classify every source you intend to use:
- **EMPTY (0 rows)** → do NOT use. The metric that depends on it is UNKNOWN. Say so.
- **THIN (n ≤ 3 / below the metric's minimum sample)** → not analysable; directional at most, labelled.
- **STALE (> its freshness threshold)** → historical only, never a current verdict.
- **KNOWN-BAD quality** → excluded even if fresh (see the quality flags below).
- **OK** → usable, but still cross-check against a second source (reconcile).
If a required source is EMPTY/THIN/STALE/known-bad, **state the gap and stop** — do not substitute a
near-neighbour table or fabricate the number.

## The profile query (run it; don't assume)
```sql
-- rows + freshness + gap flag for the marketing-critical tables
with p as (
  select 'shopify_orders' t, count(*) n, null::text mx from shopify_orders
  union all select 'shopify_order_attribution', count(*), null from shopify_order_attribution
  union all select 'kryo_leads', count(*), null from kryo_leads
  union all select 'kryo_funnel_daily', count(*), max(report_date)::text from kryo_funnel_daily
  union all select 'meta_ad_metrics_daily', count(*), max(date)::text from meta_ad_metrics_daily
  union all select 'meta_ad_breakdowns_daily', count(*), max(date)::text from meta_ad_breakdowns_daily
  union all select 'meta_asset_performance_daily', count(*), max(date)::text from meta_asset_performance_daily
  union all select 'shopify_funnel_daily', count(*), max(date)::text from shopify_funnel_daily
  union all select 'attribution_touches', count(*), max(ts)::text from attribution_touches
  union all select 'ga_pages_daily', count(*), max(date)::text from ga_pages_daily
  union all select 'gsc_query_page_daily', count(*), max(date)::text from gsc_query_page_daily
  union all select 'clarity_section_heatmap', count(*), max(date)::text from clarity_section_heatmap
  union all select 'lp_funnel_daily', count(*), max(date)::text from lp_funnel_daily
)
select t, n as rows, coalesce(mx,'n/a') latest,
  case when mx is not null then current_date - mx::date end days_stale,
  case when n=0 then 'EMPTY' when n<=3 then 'THIN'
       when mx is not null and current_date-mx::date>14 then 'STALE'
       else 'ok' end gap
from p order by rows;
```
Extend it (null-rate on key columns, date-gap detection) for the specific columns a metric needs.

## Current readiness map (2026-08-01 — re-run each session; do not trust when older than a day)
| Source | Rows | Latest | Status |
|---|---|---|---|
| shopify_orders | **0** | — | **EMPTY — revenue/AOV/ROAS impossible from here** |
| shopify_order_attribution | **0** | — | **EMPTY** |
| kryo_leads | **0** | — | **EMPTY — WhatsApp leads untracked** |
| kryo_funnel_daily | **1** | 2026-06-07 | **THIN + stale — not analysable** |
| meta_asset_performance_daily | 156 | 2026-03-02 | STALE (152d) |
| meta_ad_breakdowns_daily | 403 | 2026-05-17 | STALE (76d) |
| ga_pages_daily | 188 | 2026-06-07 | STALE (55d) |
| gsc_query_page_daily | 2191 | 2026-06-12 | STALE (50d) |
| shopify_funnel_daily | 96 | 2026-07-31 | fresh but **KNOWN-BAD: checkouts_completed double-counts upsells** |
| clarity_section_heatmap | 209 | 2026-07-29 | fresh but **quality-suspect: Clarity pixel failing** |
| meta_ad_metrics_daily | 174 | 2026-07-30 | OK (platform-attribution → directional; profitability = MER) |
| lp_funnel_daily | 45 | 2026-07-28 | OK-ish (verify) |
| attribution_touches | 13,298 | today | **OK — the one reliable live source** |

## Implication (reprioritised)
**The #1 data fix is the Shopify orders sync** — `shopify_orders` is empty, so there is no trustworthy
source for orders/revenue/AOV/MER. Until it's populated (from Shopify Admin), every profitability number
is UNKNOWN, full stop. This outranks the LP/ad work for trustworthiness.

## Quality flags (known-bad even when fresh)
- `shopify_funnel_daily.checkouts_completed` — double-counts cart upsells (use real order count).
- First-party `add_to_cart` / `whatsapp_click` — under-fire while `facebook.com/tr` aborts & Clarity fails.
- `meta_ad_metrics_daily` ROAS/CPA — platform-attribution, overstates; directional only, judge on MER.
- Cart-tracking May–early June 2026 — unreliable window.

## Enforcement
The `data-analyst` and `performance-economics` lenses MUST output the readiness classification for every
source used, at the top of any analysis. An analysis without a readiness check is invalid. Add new
EMPTY/THIN/STALE discoveries here and to `marketing/evals/` as regression cases.
