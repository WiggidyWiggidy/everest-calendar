---
name: meta-creative
description: Analyse Meta ad creative performance without downloading every asset, identify robust winners and fatigue, and turn evidence into specific next creative tests.
disable-model-invocation: true
context: fork
background: false
effort: high
allowed-tools: Read Write Edit Glob Grep
---

# Meta creative analysis

Scope from user: `$ARGUMENTS`

Read `account-context.md`, `tool-map.md`, `metric-dictionary.md`, `query-policy.md`, `analysis-rules.md`, and recent reports.

## Query sequence

Maximum 5 MCP calls.

1. Default to last 30 complete days, with a recent 7-day view for fatigue.
2. Query ad-level performance only for the relevant campaign(s), capped to ads with spend/delivery and at most 50 rows.
3. Request only identifiers/names plus spend, impressions, frequency, CPM, link/outbound CTR/CPC, LPV, purchases, CPA and ROAS/value.
4. Rank using commercial outcomes first, then apply spend and purchase sufficiency.
5. Fetch creative copy/media metadata only for a shortlist: normally top 5, bottom 5 with material spend, and up to 3 fatigue suspects. Do not retrieve all creatives.
6. Use placement or format breakdown only when it tests a specific hypothesis.

## Analysis

For each shortlisted creative identify, when evidence permits:
- format,
- opening hook/first frame,
- angle/problem/desire,
- mechanism or proof,
- offer/CTA,
- likely audience stage,
- current performance and confidence.

Distinguish:
- proven commercial winner,
- promising but under-tested,
- high-click/low-conversion mismatch,
- low-click creative weakness,
- fatigued former winner,
- insufficient evidence.

## Output

Save `reports/YYYY-MM-DD-meta-creative.md` and return:

1. Creative portfolio verdict.
2. Compact winner/loser/fatigue table.
3. The 3 highest-leverage next concepts, each specifying hook, visual, claim/proof, body and CTA.
4. What not to conclude from the data.
