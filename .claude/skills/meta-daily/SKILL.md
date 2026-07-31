---
name: meta-daily
description: Run a token-efficient Meta Ads daily health check, compare recent complete performance with the prior period and targets, and surface only material actions.
disable-model-invocation: true
context: fork
background: false
effort: medium
allowed-tools: Read Write Edit Glob Grep
---

# Daily Meta Ads check

Scope from user: `$ARGUMENTS`

Read `account-context.md`, `tool-map.md`, `metric-dictionary.md`, `query-policy.md`, `analysis-rules.md`, and the newest relevant report in `reports/`.

## Data plan

Use confirmed read-only Meta tools. Maximum 3 MCP calls.

1. Default to the last 7 complete account days versus the previous 7 complete days. Exclude today unless the user explicitly asks for intraday data.
2. Query campaign level first with only the metrics needed for spend, purchases, purchase value/ROAS, CPA, CPM, link/outbound CTR/CPC, LPV, ATC and checkout where available.
3. Drill down once, only into campaigns materially responsible for spend, deterioration, improvement or the user's scope.
4. Use one optional object/creative lookup only when it directly explains the anomaly.

## Analysis

- Compare against configured target and break-even economics.
- Identify the single largest positive driver and single largest negative driver.
- Classify the problem: delivery, creative, click quality, landing page/offer, checkout, measurement or insufficient evidence.
- Mark recent/incomplete conversion data as provisional.
- Do not recommend a live change merely because a metric moved; require materiality and adequate evidence.

## Output

Return no more than:

1. **Verdict** — 3–5 sentences.
2. **Scorecard** — current, previous, change, target for at most 8 KPIs.
3. **Do now** — at most 3 prioritised actions with confidence.
4. **Watch** — at most 2 unresolved risks.

Save a compact report to `reports/YYYY-MM-DD-meta-daily.md`. Include a one-line record of each query, never raw JSON.
