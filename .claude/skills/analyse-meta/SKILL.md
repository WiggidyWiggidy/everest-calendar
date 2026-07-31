---
name: analyse-meta
description: Analyse KRYO Meta ad delivery and downstream on-site intent. Judges ads on downstream add-to-cart, not click metrics alone.
---

# analyse-meta

## When to run
Questions about ad delivery, spend efficiency, creative or audience performance.

## Required sources
`meta_ad_metrics_daily` (delivery), `attribution_touches` (downstream intent, joined on
`meta_ad_id`), `meta_ad_breakdowns_daily` (**orphaned since 2026-05-17** — creative-level
breakdown unavailable).

Platform field mapping: `.claude/meta/tool-map.md` and `.claude/meta/analysis-rules.md`.
Existing platform procedures — reuse, do not rebuild: `.claude/skills/meta-daily`,
`meta-audit`, `meta-creative`, `meta-experiment`, `meta-verify`.

## Required validations
Meta spend fresh within 24h. State the attribution window and account timezone.
Never compare rows with different attribution settings.

## Process
1. Delivery: spend, impressions, CPM, outbound clicks, CTR, LPV, LPV rate.
2. **Join to downstream on-site intent** via `meta_ad_id` and evaluate ads on
   add-to-cart, not clicks.
3. Split by device — mandatory.
4. Separate delivery decay (CPM) from engagement decay (CTR) from on-site leakage.

## Expected output
Delivery + downstream table with sample sizes, and an explicit statement of which layer
the problem sits in.

## Failure behaviour
Stale spend → label `historical through <max date>` and issue no current verdict
(no CPA, ROAS, winner, or fatigue claim).

## Approval boundaries
Read-only. **No campaign, budget, or status change without Tom's approval.**

## Current caution
Paid Meta traffic is 97% mobile, and mobile cannot currently add to cart. Do not conclude
"paid traffic is low quality" from add-to-cart data until that defect is resolved —
the metric is confounded by device.
