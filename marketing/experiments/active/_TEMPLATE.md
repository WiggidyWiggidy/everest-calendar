# KRYO Experiment

Experiment ID: `KRYO-EXP-YYYYMMDD-NN`
Status: `DRAFT`
Owner: `growth_operator`
Created: `YYYY-MM-DD`

## 1. Measured problem

- Funnel stage:
- Canonical source:
- As-of:
- Eligible sample n:
- Baseline value:
- Device/segment split:
- Why this is commercially meaningful:

## 2. Supporting evidence

- Evidence 1:
- Evidence 2:
- Alternative explanation:
- What would distinguish the alternative:

## 3. Customer mechanism

Customer belief / objection / friction:

Expected mechanism:

## 4. Hypothesis

If [exact treatment], then [primary metric] will [direction] because [mechanism].

Disproving evidence:

## 5. Control

Exact current state:

## 6. Treatment

Exact changed state:

### Frozen variable

Only this major variable may change:

### Explicitly unchanged

- Price:
- Offer:
- Product:
- Cart/checkout path:
- Audience:
- Other page sections:

## 7. Audience and assignment

- Eligible market:
- Page/route:
- Traffic source:
- Device rule:
- New/returning rule:
- Exclusions:
- Experiment unit ID:
- Assignment method:
- Allocation:
- Persistence rule:
- Exposure definition:

## 8. Metrics

### Primary metric

- Metric key:
- Numerator:
- Denominator:
- Canonical source:

### Secondary metrics

- 

### Guardrails

- Metric:
- Trip threshold:

## 9. Statistical plan

- Baseline:
- Minimum detectable effect:
- Alpha:
- Power:
- Required sample:
- Estimated eligible traffic/day:
- Estimated runtime:
- Minimum runtime:
- Maximum runtime:
- Analysis method:
- Look schedule:
- SRM alpha:

Fixed-horizon tests may be reviewed every 48h for health, but may not stop merely because an ordinary p-value temporarily looks favourable.

## 10. Start gates

- [ ] Source health passes
- [ ] Primary metric tracking passes
- [ ] Assignment/exposure runtime passes
- [ ] A/A validation completed if this is a new experiment surface
- [ ] Treatment build complete
- [ ] UX reviewer PASS
- [ ] Tracking auditor PASS
- [ ] Release reviewer PASS
- [ ] Rollback tested/defined
- [ ] Tom approved named live experiment

## 11. Rollback

Exact rollback procedure:

## 12. Build

- Builder provider:
- Branch/worktree:
- Build manifest:
- QA report:

## 13. Launch

- Approved by:
- Actual launch timestamp:
- Control version:
- Treatment version:
- Allocation at launch:

## 14. Readout

- Data-quality verdict:
- SRM verdict:
- Control n:
- Treatment n:
- Primary control value:
- Primary treatment value:
- Absolute effect:
- Relative effect:
- Uncertainty:
- Guardrails:
- Stop condition met:

Allowed status:
`WIN_READY | LOSS_READY | CONTINUE | INCONCLUSIVE | TRACKING_FAILURE | INVALID_EXPERIMENT`

## 15. Owner decision

`KEEP | REVERT | ITERATE | CONTINUE | INVALIDATE`

## 16. Learning

What did this experiment teach us?

What should the next experiment do differently?

Context limits: where should this learning NOT be generalized?
