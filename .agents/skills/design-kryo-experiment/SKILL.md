---
name: design-kryo-experiment
description: Turn a measured KRYO funnel loss into a falsifiable, statistically pre-registered experiment. Use only after diagnosis; refuse when the target metric is unmeasurable.
---

# Design KRYO Experiment

Required inputs: diagnosis evidence, canonical metric definition, source freshness, prior experiments/learnings, current page/offer state.

Produce exactly one frozen experiment spec containing:
- experiment ID
- measured problem + source + n
- customer mechanism/belief
- falsifiable hypothesis
- exact control and exact treatment
- eligible audience and exclusions
- deterministic assignment method and allocation
- one primary metric
- secondary metrics
- guardrails + thresholds
- baseline
- minimum detectable effect
- alpha and power
- required sample or fixed stop rule
- minimum/maximum runtime where relevant
- expected mechanism
- disproving result
- rollback

Rules:
- one primary metric before launch
- no post-hoc metric substitution
- no generic industry benchmark as proof of a KRYO defect
- do not combine major offer, proof, price and layout changes unless explicitly running a package test
- if tracking is unreliable, output `MEASUREMENT_FIX_REQUIRED` instead of designing a test
- do not launch
