---
name: meta-audit
description: Diagnose Meta Ads account performance deeply but efficiently across delivery, creative, funnel, measurement and spend allocation, then produce a prioritised action plan.
disable-model-invocation: true
context: fork
background: false
effort: high
allowed-tools: Read Write Edit Glob Grep
---

# Meta Ads audit

Scope from user: `$ARGUMENTS`

Read all files in `${CLAUDE_PROJECT_DIR}/.claude/meta/` except templates not needed, plus the newest relevant reports.

## Boundaries

- Read-only. Never mutate live ads.
- Maximum 6 MCP calls for a normal account; stop earlier when evidence is sufficient.
- Default window: last 30 complete days, with last 7 days and previous equal-period context.
- Start at campaign level and descend only into material spend.
- One breakdown per query, and only after aggregate data creates a specific hypothesis.

## Audit sequence

1. **Economics and measurement:** confirm target CPA/ROAS, attribution basis, conversion event and any reporting caveat.
2. **Account allocation:** identify where spend and purchases are concentrated; separate prospecting, retargeting and tests.
3. **Campaign diagnosis:** compare performance, trend and data sufficiency.
4. **Ad-set diagnosis:** inspect only campaign drivers; check allocation, audience overlap/saturation indicators, frequency and learning/recent edits if supported.
5. **Ad/creative diagnosis:** shortlist only ads responsible for meaningful spend or results.
6. **Funnel diagnosis:** distinguish CPM, click, LPV, ATC, checkout and purchase leakage.
7. **Breakdown:** use at most two targeted breakdown queries across the audit, each tied to a stated hypothesis.
8. **Action plan:** rank by expected commercial impact, confidence, effort and reversibility.

## Standards

- Quantify contributions: e.g. object share of spend, purchases and change.
- Do not call an ad a winner or loser without applying configured spend/purchase thresholds.
- Flag tracking or attribution uncertainty before optimisation recommendations.
- Avoid simultaneous multi-variable changes unless the account is clearly failing and causal learning is secondary.

## Deliverable

Save `reports/YYYY-MM-DD-meta-audit.md` using `report-template.md`, then return:

- executive diagnosis,
- 5–10 key findings,
- a maximum of 5 actions divided into **now**, **next test**, and **do not touch yet**,
- query count and remaining uncertainties.
