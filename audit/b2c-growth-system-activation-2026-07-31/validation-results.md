# Validation Results — 2026-07-31

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Consolidation branch exists | **PASS** | `consolidation/b2c-marketing-2026-07-31` @ `c6ffd30` |
| 2 | Valuable files committed | **PASS** | 233 files, +24,672 / −714, across 11 commits |
| 3 | Branch pushed | **FAIL** | Push denied twice by the permission layer. Local only. |
| 4 | No secret values committed | **PASS** | Scan for JWT / `EAA*` / `sk-` / PEM / `AIza` across all 11 commits — clean |
| 5 | `main` not merged | **PASS** | `main` = `origin/main` = `633b6cd`, unchanged |
| 6 | Application build passes | **PASS** | `npm run build` exit 0 |
| 7 | Type checking passes | **PASS** | `npx tsc --noEmit` exit 0, zero output |
| 8 | Relevant tests pass | **NOT RUN** | No test script in `package.json` |
| 9 | Scripts resolve from documented paths | **PARTIAL** | `scripts/kryo-*` present; not individually executed |
| 10 | Markdown links work | **PASS** | All relative links in new docs resolve; zero broken |
| 11 | No obsolete OpenClaw paths in active files | **PASS** | Zero matches in `CLAUDE.md`, rules, skills, command, data-contracts, source-of-truth |
| 12 | No CAD/manufacturing/supplier/B2B bleed | **PASS** | Only exclusion statements, "Cadence", "manufacture a result" — verified line by line |
| 13 | `/memory` loads intended instructions | **PARTIAL** | Parent `CLAUDE.md` reduced to a router; repo `CLAUDE.md` is the B2C entry point. `/memory` is an interactive terminal command, unavailable in this session — hierarchy verified by file inspection instead |
| 14 | Skills in one location | **PASS** | `.claude/skills/` only; `marketing/skills/` removed, contents archived |
| 15 | One canonical metric dictionary | **PASS** | `marketing/data-contracts/metric-definitions.md`; other two demoted to field-mapping by rule |
| 16 | One canonical tool map | **PASS** | `marketing/data-contracts/tool-map.md` |
| 17 | One canonical experiment workflow | **PASS** | `.claude/rules/experiment-governance.md` + `design-experiment` / `evaluate-experiment` |
| 18 | Current data can produce a funnel report | **PASS** | Canonical funnel computed from live data; view logic verified read-only, reproduces it exactly |
| 19 | Missing data stated explicitly | **PASS** | `known-limitations.md` (8 defects), `metric-definitions.md` §4, diagnosis §6 |
| 20 | No live production system modified | **PASS** | All SQL read-only. No migration applied, no deploy, no Meta/Shopify write |

## Failures and partials

**#3 Push — FAIL.** The two `git push` attempts were denied at the permission prompt
(the second after explicit approval to retry), most likely because the repository sits
outside the session's primary working directory. All work is committed locally and safe,
but **not backed up to origin**. To push:

```bash
cd "/Users/happy/Desktop/Claude Project/everest-calendar" && git push -u origin consolidation/b2c-marketing-2026-07-31
```

**#8 Tests — NOT RUN.** `package.json` defines no test script. Nothing was skipped;
there is nothing to run.

**#9 Scripts — PARTIAL.** The ~50 `scripts/kryo-*` files exist and are committed, but were
not individually executed. Path resolution is unverified per-script.

**#13 `/memory` — PARTIAL.** Interactive terminal dialogs are unavailable in this session.
The instruction hierarchy was verified by reading the files: parent `CLAUDE.md` is a router
carrying no business rules; `everest-calendar/CLAUDE.md` is the B2C entry point and
references rather than duplicates.

## Data-integrity defect found during validation

Shopify theme-editor preview traffic is ingested with `is_internal=false` and was inflating
add-to-cart by 24% at session level (8 of 34 ATC sessions from 57 preview sessions), and far
more at event level. A mandatory host filter is now encoded in the metric dictionary and in
the prepared view. **Any earlier KRYO funnel analysis without this filter overstated
add-to-cart and should be re-run.**
