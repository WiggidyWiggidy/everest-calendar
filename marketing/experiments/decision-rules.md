# KRYO Experiment Decision Rules

Every experiment must have:

- Experiment ID.
- Funnel problem.
- Evidence.
- Customer belief or objection.
- Hypothesis.
- One primary variable.
- Control and treatment.
- Primary metric.
- Guardrail metric.
- Baseline.
- Decision threshold.
- Data-quality status.
- Rollback plan.

## Allowed decisions

- Keep.
- Revert.
- Iterate.
- Continue collecting data.
- Inconclusive.
- Tracking failure.
- Invalid experiment.

## Decision guardrails

- Do not declare a winner from stale data.
- Do not run multiple major strategic variables in one test.
- Do not mix offer, proof, price and layout changes unless the experiment is explicitly a package test.
- Failed and inconclusive tests must be recorded.
- If tracking fails, decision is `tracking failure`, not `loser`.

## Automated packet review

Run:

```bash
npm run review:kryo-experiment
```

This reviews the latest experiment packet for required IDs, source-health gating, measurement-spine readiness, copy hard bans, metric rules and release blockers.

Verdicts:

- `PASS`: ready for Tom approval of named implementation work.
- `PENDING_EVIDENCE`: strategy is coherent, but source/readiness evidence is missing or stale.
- `REVISE`: required fields, hard bans or structural issues are present.
