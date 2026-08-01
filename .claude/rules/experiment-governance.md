# Experiment Governance

No experiment may be queued, launched or evaluated without every field below.
Template: `marketing/experiments/active/_TEMPLATE.md`.

| Field | Requirement |
|---|---|
| Experiment ID | `KRYO-EXP-YYYYMMDD-nn` |
| Problem observed | The measured loss, with source and sample |
| Supporting evidence | Query + numbers, per evidence-standards.md |
| Hypothesis | Falsifiable statement of mechanism |
| Control | Exact current state |
| Challenger | Exact proposed state |
| Eligible audience | Device, geo, traffic class, page |
| Assignment method | How a session is allocated |
| Traffic allocation | Split, e.g. 50/50 |
| Primary metric | One only, from the canonical dictionary |
| Secondary metrics | Reported separately, never merged into primary |
| Guardrails | What must not degrade, and the trip threshold |
| Start condition | What must be true to begin |
| Stop condition | Sample size or date, fixed in advance |
| Expected mechanism | Why the challenger should move the metric |
| Disproving evidence | What result would falsify the hypothesis |
| Result | Filled at readout |
| Decision | ship / iterate / reject — Tom's call |
| Learning | Written to `marketing_learnings` |

## Rules
- Primary metric is fixed **before** launch. Post-hoc substitution is prohibited.
- Stop conditions are fixed before launch. No peeking-and-stopping on a favourable day.
- Do not run confounded experiments simultaneously on the same audience and page.
- An experiment that cannot state its disproving evidence is not ready.
- **A funnel stage that is not reliably tracked cannot be an experiment's primary metric.**
  Fix measurement first — an experiment measured on a broken metric produces nothing.
