---
name: validate-marketing-data
description: Verify KRYO marketing source freshness and integrity before any analysis. Run first in every diagnosis. Reports usable/directional/unusable per source and halts on a stale spine.
---

# validate-marketing-data

## When to run
First step of every diagnosis, report or experiment readout. Never skip.

## Required sources
`marketing/data-contracts/source-inventory.md` (expected state),
`refresh-schedules.md` (thresholds).

## Process
1. Query `max()` of the date column for every source in the inventory.
2. Compute staleness in days; compare against the threshold.
3. Classify: **usable** / **directional** / **unusable**.
4. Check integrity:
   - preview-host contamination present? (`page_url` not on `everestlabs.co`)
   - event duplication ratio (events per session) abnormal?
   - any table expected to have rows returning 0?
5. Print a freshness table.

## Expected output
Freshness table + explicit list of conclusions that are unavailable this run.

## Failure behaviour
If `attribution_touches` is >48h stale, **halt**. It is the analysis spine; do not
substitute another source. Report and stop.

## Approval boundaries
Read-only. Never writes.
