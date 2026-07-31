---
name: design-experiment
description: Turn a diagnosed KRYO conversion loss into a governed, launch-ready experiment spec. Refuses to design a test whose primary metric is not reliably measurable.
---

# design-experiment

## When to run
After a diagnosis identifies a loss with an established mechanism. Not before.

## Required sources
The diagnosis report, `metric-definitions.md`,
`.claude/rules/experiment-governance.md`, prior `marketing_experiments`.

## Required validations
- Primary metric must be **reliably measurable on the target segment**. If not, stop and
  say so — recommend the measurement fix instead of a test.
- Must not duplicate a completed or rejected experiment.

## Process
1. Restate the measured problem with evidence.
2. Write a falsifiable hypothesis with a mechanism.
3. Define control and challenger exactly.
4. Set audience, assignment, allocation.
5. Choose **one** primary metric; list secondaries separately.
6. Set guardrails and trip thresholds.
7. Fix start and stop conditions **in advance**.
8. State what result would disprove the hypothesis.

## Expected output
`marketing/experiments/active/KRYO-EXP-YYYYMMDD-nn.md`, all governance fields populated.

## Failure behaviour
If a required field cannot be filled, the experiment is **not ready**. Say which field and
why. Do not launch with placeholders.

## Approval boundaries
Prepares only. **Never launches.** Tom starts every experiment.
