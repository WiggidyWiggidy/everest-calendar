# Everest Calendar Agent Rules

## KRYO B2C growth system

This repository supports both Claude Code and Codex. The KRYO Growth OS is the system; model providers are workers inside it.

Before any KRYO marketing analysis, website experiment, ad draft, or customer-facing copy:

1. Read `MARKETING_RUNBOOK.md`.
2. Read `KRYO_SYSTEM_OPERATING_MAP.md`.
3. Read the relevant files in `marketing/source-of-truth/` and `marketing/data-contracts/`.
4. Read prior experiment findings/learnings before proposing a new test.
5. Run source health before current recommendations:

```bash
npm run audit:kryo-source-health
```

## Hard rules

- No live Shopify, theme, product, ad, budget, offer, or production DB mutation without Tom approving the exact named action.
- Ads created for approval must land paused.
- Website changes must be branch/worktree and PR based unless Tom explicitly requests a direct hotfix.
- Existing canonical cart/checkout/Meta tracking must not be disturbed casually.
- Every experiment needs: experiment ID, measured problem, falsifiable hypothesis, exact control/treatment, eligible audience, assignment method, allocation, one primary metric, secondaries, guardrails, baseline, MDE/power or other predeclared stop logic, rollback and decision rule.
- Primary metric and stopping rule are frozen before launch. Do not manufacture a result by changing metrics after seeing data.
- Failed, inconclusive, invalid and tracking-failure experiments are retained as learnings.
- Every recommendation states evidence, sample, source freshness, expected mechanism and what would falsify it.
- Never invent medical, health, price, product, delivery, availability, scarcity or warranty claims.
- Use AED for UAE-facing KRYO copy unless the approved market source says otherwise.
- Do not produce output merely to appear productive.

## Codex multi-agent routing

Project Codex agents live under `.codex/agents/`; repo skills live under `.agents/skills/`.

For multi-stage KRYO growth work, keep the primary Codex thread in the **Growth Operator** role. Delegate bounded work to specialist agents and collect distilled outputs back into the primary thread.

Available core roles:

- `growth_operator` — experiment lifecycle/orchestration and synthesis.
- `measurement_analyst` — canonical funnel, baselines, cohorts and source health. Read-only.
- `experiment_strategist` — up to 3 falsifiable high-leverage hypotheses from measured problems. Read-only.
- `experiment_analyst` — power/MDE, assignment/exposure quality, SRM, primary readout and statistical status. Read-only.
- `tracking_auditor` — end-to-end event/attribution verification. Read-only.
- `cro_builder` — implements a frozen treatment only. Write-heavy owner.
- `ux_reviewer` — independent rendered mobile-first UX review. Read-only.
- `release_reviewer` — independent final experiment/release gate. Read-only.

### Parallelism rule

Parallelise independent read-heavy work such as:

- funnel quantification
- tracking audit
- UX reproduction
- customer/offer research
- hypothesis challenge/red-team
- release review dimensions

Be conservative with write-heavy work. **One task = one implementation owner = one branch/worktree.** Never let Claude and Codex, or two Codex subagents, edit the same implementation files concurrently.

Preferred cross-model pattern when both providers are active:

- Claude strategy -> Codex build -> Claude review, or
- Codex build -> Claude UX/release review -> Codex fix -> reviewer retest.

Reviewer must not fix its own findings.

## Experiment lifecycle

Every controlled KRYO experiment follows:

`VERIFY DATA -> DIAGNOSE -> DESIGN/STATS -> BUILD -> UX QA -> RELEASE QA -> OWNER APPROVAL -> LAUNCH -> MONITOR -> DECIDE -> LEARN`

The frozen experiment spec cannot be redefined by the Builder.

The 48-hour operating cadence is a **review cadence**, not a forced stopping rule. An underpowered valid experiment returns `CONTINUE`.

Maintain where traffic allows:

- 1 live experiment
- 1 next experiment fully built and QA-passed
- 3-5 ranked hypotheses

Do not run confounded overlapping page tests against the same eligible audience.

## Persistent agent handoffs

Do not rely on conversational memory between agents/providers.

For every experiment use:

```text
marketing/experiments/active/<EXPERIMENT_ID>.md
artifacts/experiments/<EXPERIMENT_ID>/
  diagnosis.md
  stats-plan.json
  treatment-spec.md
  build-manifest.json
  qa-report.json
  readout.json
  learning.md
  state.json
```

The Growth Operator owns `state.json` and lifecycle transitions. Each worker writes its owned artifact only.

## Experiment architecture direction

For high-velocity CRO tests, prefer one canonical KRYO commerce path with a first-party experiment runtime that controls A/B UI treatment. Preserve the same canonical product, inventory, cart and checkout where possible.

Do not use duplicated Shopify products as the default statistical testing architecture. Keep clone infrastructure for radical concept pages, sandboxes and intentionally isolated landing pages.

Assignment and actual exposure are distinct. Do not count assignment as exposure. Returning users should remain on the same experiment treatment using a verified stable experiment identity.

Before interpreting effects, require:

- fresh sources
- assignment health
- exposure health
- no material cross-variant contamination
- SRM check
- reliable primary metric tracking

Run an A/A validation before trusting a new assignment/exposure runtime.

## Skills

Useful repo-scoped Codex skills:

- `$kryo-growth-cycle`
- `$design-kryo-experiment`
- `$evaluate-kryo-experiment`
- `$audit-kryo-ux`

Skills define workflows. Agents define bounded roles. Deterministic scripts/tests should perform statistical calculations and technical assertions rather than asking an LLM to improvise them.

## Current KRYO commands

- `npm run audit:kryo-source-health` — validate source freshness.
- `npm run analyse:kryo-performance` — produce analyst pack.
- `npm run operator:kryo-growth-brief` — founder decision brief.
- `npm run operator:kryo-experiment-packet` — proposed experiment packet.
- `npm run audit:kryo-measurement-spine` — lead/deposit/experiment readiness.
- `npm run operator:kryo-preflight -- --mode website --handle kryo2_` — website readiness.

## Definition of agentic success

A multi-stage task is not complete because a plan or patch exists. It is complete when the relevant independent reviewer has verified the rendered/real behavior, deterministic checks pass, the persistent artifacts are current, and no autonomously fixable blocker remains.

Only genuine owner decisions should return to Tom: production launch/mutation, price/offer changes, paid-service costs, irreversible changes, contradictory approved business facts, or material strategic trade-offs.
