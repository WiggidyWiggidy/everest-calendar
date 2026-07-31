---
name: diagnose-kryo-conversion
description: Produce an evidence-backed KRYO conversion diagnosis — canonical funnel, dominant loss, responsible cohorts, alternative explanations. Device-split mandatory.
---

# diagnose-kryo-conversion

## When to run
Whenever the question is "why aren't we converting?" or before proposing any experiment.
The full orchestrated version is `/kryo-growth-diagnose`.

## Required sources
`attribution_touches` (spine), `shopify_funnel_daily`, Clarity tables,
`marketing_findings` / `marketing_learnings` / `marketing_experiments` (prior work).

## Required validations
Run `validate-marketing-data` first. Apply `metric-definitions.md` §0 eligibility —
**including the `everestlabs.co` host filter**. Session grain only.

## Process
1. Validate freshness. 2. Read prior findings — never duplicate a completed experiment.
3. Compute the canonical funnel, **split by device**. 4. Rank stage drops by absolute lost
sessions, not percentage. 5. Segment (device, source, page, campaign, cohort) with sample
sizes. 6. Contrast high- vs low-intent sessions. 7. Pull Clarity friction for the affected
page/device. 8. Assign the loss to pre-CTA / CTA-to-cart / cart-to-checkout / in-checkout.
9. State at least one alternative explanation and the test that would distinguish it.

## Expected output
Report at `marketing/reports/investigations/YYYY-MM-DD-<slug>.md`, plus a
`marketing_findings` row.

## Failure behaviour
Missing source → state which conclusions are unavailable and diagnose the rest.
Never fill a gap with a benchmark or an assumption.

## Approval boundaries
Read-only. Recommends; never implements.
