---
name: analyse-clarity
description: Analyse Microsoft Clarity friction and section engagement for KRYO pages. Diagnoses friction only — never a conversion source.
---

# analyse-clarity

## When to run
After a diagnosis localises a loss to a page and device, to find the behavioural mechanism.

## Required sources
`clarity_friction_elements` (fresh, 1.4 d), `clarity_section_heatmap` (2.4 d).

## Required validations
Freshness check. Confirm the page and device segment matches the diagnosis segment —
Clarity evidence for desktop does not explain a mobile defect.

## Process
1. Pull friction elements for the affected page + device.
2. Look for dead clicks, rage clicks and quick-backs on the failing control.
3. Pull section heatmap to see how far users engage and where they stall.
4. Relate findings to the specific funnel stage under investigation.

## Expected output
Ranked friction list for the affected segment, tied to a funnel stage.

## Failure behaviour
No Clarity coverage for the segment → say so. Do not substitute desktop evidence for a
mobile question, and do not infer behaviour from absence of data.

## Approval boundaries
Read-only.

## Hard rule
Clarity diagnoses friction. It is **never** a conversion or winner source — see
`marketing/data-contracts/metric-definitions.md`.
