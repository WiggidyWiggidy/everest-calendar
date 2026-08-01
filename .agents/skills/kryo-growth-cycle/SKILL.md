---
name: kryo-growth-cycle
description: Run the governed KRYO B2C growth loop from fresh data through diagnosis, experiment design, build, independent QA, readout and learning. Use for multi-stage CRO/marketing experiment work; do not use for isolated copy edits.
---

# KRYO Growth Cycle

1. Read `AGENTS.md`, source-of-truth, data contracts, experiment governance and prior experiment learnings.
2. Run source health. If the target metric is not reliably measurable, create a measurement-fix task instead of an experiment.
3. Delegate independent diagnosis in parallel where useful: `measurement_analyst`, `tracking_auditor`, `experiment_strategist`, and other read-only lenses. The primary thread synthesizes.
4. Freeze one experiment: problem, mechanism, control, treatment, eligible audience, allocation, one primary metric, secondary metrics, guardrails, baseline, MDE, alpha, power, sample/stop rule, falsification and rollback.
5. Have `cro_builder` implement only the frozen treatment in an isolated worktree/branch.
6. Have `ux_reviewer`, `tracking_auditor`, and `release_reviewer` independently review. Reviewers never fix their own findings. Return failures to the builder until PASS.
7. Present Tom one named launch packet. No production activation without approval.
8. Once live, `experiment_analyst` checks assignment/exposure/data quality before lift. Formal status every 48h may be WIN_READY, LOSS_READY, CONTINUE, INCONCLUSIVE, TRACKING_FAILURE or INVALID_EXPERIMENT.
9. Record the result and learning even when the test loses or is inconclusive. Query those learnings before the next hypothesis.

Maintain persistent artifacts under `artifacts/experiments/<EXPERIMENT_ID>/` and avoid relying on conversational handoffs.
