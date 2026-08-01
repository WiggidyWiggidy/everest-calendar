---
depends-on: [money.cpa, money.sales_lifetime]
---

# Rules and Skills Map

## Active rules — `.claude/rules/`
| File | Governs |
|---|---|
| `business-scope.md` | KRYO B2C only; excludes B2B/manufacturing/CAD/suppliers; priority order |
| `evidence-standards.md` | 8 required elements; FACT/PATTERN/HYPOTHESIS/UNKNOWN/RECOMMENDATION; bans benchmark-as-proof, correlation-as-causation, blended device rates |
| `metric-definitions.md` | Pointer to the canonical dictionary; bans silent redefinition |
| `experiment-governance.md` | 19 required fields; pre-registered metric and stop condition |
| `production-permissions.md` | Read-only allowed; deploy/campaign/theme/schema need Tom |

## Active skills — `.claude/skills/` (single location)
`validate-marketing-data` · `diagnose-kryo-conversion` · `analyse-meta` · `analyse-clarity` ·
`design-experiment` · `evaluate-experiment`

Each documents: when to run · required sources · required validations · process ·
expected output · failure behaviour · approval boundaries.

Retained Meta platform skills (reused, not rebuilt): `meta-audit`, `meta-change`,
`meta-creative`, `meta-daily`, `meta-experiment`, `meta-setup`, `meta-verify`.

## Command
`.claude/commands/kryo-growth-diagnose.md` — 11-step workflow, forbids opening with
generic CRO advice.

## Archived
`marketing/archive/skills/` — 6 superseded skills. Business facts moved to
`source-of-truth/`; metric definitions moved to `data-contracts/`.
