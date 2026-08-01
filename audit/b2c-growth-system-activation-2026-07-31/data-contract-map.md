# Data Contract Map

`marketing/data-contracts/` — 9 files.

| File | Purpose |
|---|---|
| `metric-definitions.md` | **Canonical dictionary.** Eligibility §0, rates §2, verified baselines §3, unmeasurable §4 |
| `source-inventory.md` | Every source: grain, identifiers, range, refresh, limitations, safe-for-analysis |
| `table-map.md` | Canonical table per analytical question |
| `tool-map.md` | Which tool for which need + approval level |
| `funnel-definitions.md` | Pointer to §1–§2 (no duplication) |
| `attribution-rules.md` | Moved from `analytics/` |
| `refresh-schedules.md` | Mechanism, cadence, observed lag |
| `known-limitations.md` | 8 verified defects |
| `authentication-status.md` | Per-integration auth state + remediation |

## Single canonical dictionary
`marketing/analytics/metric-definitions.md` and `.claude/meta/metric-dictionary.md` are
**demoted to Meta platform field mapping only**. Neither may define a funnel rate.
Enforced by `.claude/rules/metric-definitions.md`.
