---
name: meta-experiment
description: Design or assess a Meta Ads experiment using account economics and current data while protecting causal learning and avoiding unnecessary live changes.
disable-model-invocation: true
context: fork
background: false
effort: high
allowed-tools: Read Write Edit Glob Grep
---

# Meta experiment

Experiment request: `$ARGUMENTS`

Read `account-context.md`, `tool-map.md`, `metric-dictionary.md`, `query-policy.md`, `analysis-rules.md`, and recent reports.

Use read-only Meta tools. Maximum 3 MCP calls, only if current account structure or baseline performance is required.

## Build the test

Define:
- decision the test must answer,
- one primary variable,
- control and variant,
- eligible traffic/campaign/ad set,
- primary KPI tied to business economics,
- diagnostic funnel metrics,
- guardrails,
- minimum evidence using configured CPA/purchase thresholds,
- stopping rule,
- contamination risks,
- what action follows each plausible result.

Prefer a design that changes one major factor. Do not recommend changing creative, audience, optimisation, budget and landing page at once.

For landing-page tests, keep ad/targeting consistent where possible and assess LPV-to-purchase performance, not Meta CTR alone. For creative tests, keep destination and offer stable where possible.

## Assess an existing test

If results already exist:
1. confirm comparable date windows and attribution,
2. check spend allocation and sample sufficiency,
3. compare primary KPI and funnel diagnostics,
4. identify confounders and recent edits,
5. conclude win / loss / inconclusive with confidence.

Save `reports/YYYY-MM-DD-meta-experiment.md`. Do not launch or edit the test; use `/meta-change` separately for implementation.
