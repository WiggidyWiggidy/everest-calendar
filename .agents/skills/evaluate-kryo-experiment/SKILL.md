---
name: evaluate-kryo-experiment
description: Evaluate a running KRYO experiment against its frozen primary metric, assignment/exposure health and pre-registered stopping rule. Use for 48-hour reviews and final readouts.
---

# Evaluate KRYO Experiment

Read the frozen experiment spec first.

Before effect estimates, verify:
- source freshness
- eligible sample definition
- assignment counts
- actual exposure counts
- sample-ratio mismatch
- cross-variant contamination
- primary metric tracking
- guardrail tracking

Then report:
- n by arm
- primary rate/value by arm
- absolute effect
- relative effect
- uncertainty / confidence interval from deterministic stats tooling
- guardrails separately
- whether the pre-registered stop condition is met

Allowed statuses only:
`WIN_READY`, `LOSS_READY`, `CONTINUE`, `INCONCLUSIVE`, `TRACKING_FAILURE`, `INVALID_EXPERIMENT`.

Never replace the primary metric after seeing the data. Never call a non-significant/underpowered result a loser merely because 48 hours passed. Persist the readout and learning.
