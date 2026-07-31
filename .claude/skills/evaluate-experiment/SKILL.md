---
name: evaluate-experiment
description: Read out a running or completed KRYO experiment against its pre-registered primary metric and stop conditions.
---

# evaluate-experiment

## When to run
At the pre-registered stop condition, or when Tom asks for a readout.

## Required sources
The experiment spec in `marketing/experiments/active/`,
`attribution_touches`, `marketing_experiments`.

## Required validations
Freshness check. Confirm the stop condition is genuinely met. Confirm the primary metric
matches the pre-registered one **exactly**.

## Process
1. Compute the primary metric per arm, with sample sizes and eligibility applied.
2. Compute secondaries and guardrails separately.
3. State the effect size and uncertainty.
4. Check guardrail breaches.
5. State whether the disproving evidence appeared.
6. Recommend ship / iterate / reject — **Tom decides**.

## Expected output
Readout appended to the experiment file; move to `completed/` or `rejected/`;
write a `marketing_learnings` row.

## Failure behaviour
Under-powered → say so and either continue or stop for insufficient evidence.
**Never substitute a different metric to manufacture a result.**

## Approval boundaries
Read-only. Recommends a decision; never records one on Tom's behalf.
