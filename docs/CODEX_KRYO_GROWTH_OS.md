# Codex KRYO Growth OS

## Purpose

Codex operates as a peer implementation of the existing KRYO B2C Growth OS. It shares the same business source-of-truth, data contracts, experiment ledger and approval boundaries as Claude Code.

The objective is rapid evidence-backed experimentation without creating a second marketing system.

## Core architecture

```text
PRIMARY CODEX THREAD = GROWTH OPERATOR
           |
           +-- parallel read-heavy analysis when useful
           |     measurement_analyst
           |     tracking_auditor
           |     customer_psychology
           |     meta_ads_expert
           |     experiment_strategist
           |     red_team_verifier
           |
           +-- experiment_analyst freezes stats plan
           |
           +-- cro_builder owns implementation
           |
           +-- independent review
                 ux_reviewer
                 tracking_auditor
                 release_reviewer
```

Parallel analysis is encouraged. Parallel writes to the same implementation are prohibited.

## Agent locations

Project Codex custom agents:

`.codex/agents/*.toml`

Repo workflow skills:

`.agents/skills/*/SKILL.md`

Primary repo constitution:

`AGENTS.md`

## Recommended first prompt

From the repository root on the Codex feature branch:

```text
Use $kryo-growth-cycle.
Act as the KRYO Growth Operator.
Audit the current live B2C growth/experiment readiness from fresh sources.
Delegate independent read-heavy analysis in parallel to the measurement analyst, tracking auditor, Meta ads expert and customer psychology lens where relevant. Have the red-team verifier attack the leading conclusion.
Do not change production.
Return:
1. current canonical funnel and biggest reliable loss,
2. measurement/experiment infrastructure blockers,
3. top 3 ranked hypotheses only if the measurement is reliable,
4. the exact highest-leverage non-production implementation tasks Codex can begin now.
Persist the findings in the standard experiment/growth artifacts.
```

## Experiment lifecycle

1. VERIFY DATA
2. DIAGNOSE
3. DESIGN
4. STATS PLAN
5. BUILD
6. UX QA
7. TRACKING QA
8. RELEASE QA
9. OWNER APPROVAL
10. LAUNCH
11. DAILY HEALTH
12. 48-HOUR FORMAL REVIEW
13. DECIDE WHEN STOP RULE IS MET
14. LEARN

A 48-hour review does not force a decision.

## Experiment artifacts

```text
marketing/experiments/active/KRYO-EXP-YYYYMMDD-NN.md
artifacts/experiments/KRYO-EXP-YYYYMMDD-NN/
  diagnosis.md
  stats-plan.json
  treatment-spec.md
  build-manifest.json
  qa-report.json
  readout.json
  learning.md
  state.json
```

The primary Growth Operator owns lifecycle/state. Worker roles own bounded outputs.

## Completion markers

The project Stop hook understands these explicit markers:

```text
[KRYO-EXP:<ID>] BUILD_COMPLETE
[KRYO-EXP:<ID>] QA_COMPLETE
[KRYO-EXP:<ID>] READY_FOR_OWNER
```

Do not emit these until the corresponding artifacts actually exist.

`READY_FOR_OWNER` additionally requires independent QA = PASS and the deterministic experiment-statistics unit test to pass.

Project hooks are non-managed and must be reviewed/trusted once with Codex `/hooks` before they execute.

## Deterministic statistics

CLI:

```bash
node scripts/kryo-experiment-stats.mjs plan \
  --baseline 0.05 \
  --relative-lift 0.50 \
  --daily-eligible 100

node scripts/kryo-experiment-stats.mjs srm \
  --control-n 500 \
  --treatment-n 500

node scripts/kryo-experiment-stats.mjs readout \
  --control-n 1500 \
  --control-conversions 75 \
  --treatment-n 1500 \
  --treatment-conversions 110

node scripts/kryo-experiment-stats.test.mjs
```

The current script is deliberately fixed-horizon. It must not be used for repeated optional stopping. Add a tested sequential method later only after A/A validates the assignment/exposure system.

## Rapid experiment operating model

When traffic supports it:

- 1 live experiment
- 1 next experiment built and independently QA-passed
- 3-5 ranked hypotheses
- daily data-quality/guardrail health
- formal experiment review every 48 hours

At low traffic, prioritize experiments capable of large effects on the specific funnel stage rather than cosmetic changes.

## Roles vs skills

Agents answer **who does the job**.

Skills answer **how that workflow must be performed**.

For example:

- `experiment_strategist` + `$design-kryo-experiment`
- `experiment_analyst` + `$evaluate-kryo-experiment`
- `ux_reviewer` + `$audit-kryo-ux`
- Growth Operator + `$kryo-growth-cycle`

## Claude + Codex parallelism

Both providers may consume the same frozen experiment artifacts.

Preferred cross-model review:

```text
Claude strategy -> Codex build -> Claude independent review -> Codex fix
```

or

```text
Codex strategy/analysis -> Claude build -> Codex independent review
```

Do not have both models edit the same files simultaneously.

For the first 2-3 bounded implementations, it is reasonable to benchmark Claude and Codex against the exact same frozen spec in separate branches, scoring requirement adherence, QA failures, mobile quality, test quality and owner intervention required. Do not deploy both.

## Immediate infrastructure target

Before the first statistically trusted commercial A/B test:

- verify canonical event tracking is healthy
- finish/apply the reviewed experiment assignment layer
- use a verified stable first-party experiment identity
- separate assignment from actual exposure
- enrich funnel events with experiment identifiers
- preserve the same canonical product/cart/checkout path
- run A/A validation
- automatically calculate SRM

Do not interpret treatment lift before these data-quality gates pass.

## Production boundary

Codex can prepare code, branches, diffs, tests, analysis, experiment packets and review artifacts autonomously.

Tom approval remains required for production Shopify mutations, Meta activation/budget/objective changes, production DB migrations, price/offer changes, irreversible actions and other existing owner-only decisions.
