---
depends-on: [money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp]
---

# Experiment Infrastructure Plan

## Reused
`marketing_experiments` (24 rows), `marketing_learnings` (17), `marketing_findings` (11),
`experiment_daily_metrics`, `experiment_readouts_daily`. Not replaced.

## Missing: assignment layer
No table records which session saw which variant. Without it no experiment can be read out.

## Prepared — NOT APPLIED
`supabase/migrations/_prepared/2026-07-31_experiment_assignment.sql`

`marketing_experiment_assignments` covers every required field: `experiment_id`, `variant`,
`eligible_session`, `assigned_at`, `first_exposure_at`, `landing_page_version`,
`ad_message_angle`, plus `device_type` and `traffic_class` for guardrail splits.

**Persistence across return visits** is via `anonymous_id`, with `unique(experiment_id, session_id)`
preventing double assignment. Outcomes are computed by joining to
`marketing_session_journeys` — not stored on the assignment row, so a metric definition
change cannot silently invalidate historic assignments.

## Availability
| Consumer | State |
|---|---|
| Supabase analytics | Yes — join on `session_id` |
| Landing-page funnel reporting | Yes — via `marketing_session_journeys` |
| Clarity tags | **Not possible today** — no session-level join |
| Shopify customer events | Partial — `shopify_funnel_daily` has no device/source split |

## Blocking caveat
Assignment infrastructure does not make experiments runnable. The primary metric
(add-to-cart) is unmeasurable on mobile until EXP-0 is resolved. Deploy this, then fix
mobile, then launch.
