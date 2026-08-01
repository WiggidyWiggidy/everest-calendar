---
depends-on: [delivery.cost_per_lpv, delivery.uptime, money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp]
---

# Claude / Codex Configuration Map (2026-07-31)

## Which instructions load when Claude Code launches from this repo
Claude Code loads `CLAUDE.md` from the working dir and every parent up to the user root,
plus user-scope config. Codex loads `AGENTS.md` similarly. Effective stack when launched
from `everest-calendar/`:

1. `everest-calendar/CLAUDE.md` — **repo entry point (tracked, modified)**. Marketing/CAD/
   supplier rules, session warmup, verification rules.
2. `Claude Project/CLAUDE.md` (parent) — **ATLAS orchestration** (Supabase warmup, decision
   tiers, voice, "two systems" OpenClaw note). Loaded because it is a parent dir.
3. `~/.claude/CLAUDE.md` (user scope, if present) — not inspected here.
4. `everest-calendar/AGENTS.md` (untracked) — Codex instruction set for this repo.
5. `Claude Project/AGENTS.md` (parent) — Codex parent instructions.
6. User-scope MCP servers from `~/.claude.json` — includes **`meta-ads`** (Meta MCP,
   `mcp.facebook.com/ads`), per `.claude/meta/tool-map.md`.

> Note: `/memory` inspection could not be run in this environment; loading order above is
> derived from Claude Code/Codex path conventions + observed files. Confirm with `/memory`
> when next in Claude Code inside the repo.

## Inventory
| Path | Scope | Loaded from repo? | Purpose | Current KRYO2? | Stale? | Conflict | Keep/Merge/Archive |
|---|---|---|---|---|---|---|---|
| everest-calendar/CLAUDE.md | repo | Yes | Repo entry; mixes marketing + CAD + supplier | Yes | Partly (mixes excluded domains) | Overlaps parent ATLAS | **Keep, split** — strip CAD/supplier for B2C agent |
| Claude Project/CLAUDE.md | parent | Yes (as parent) | ATLAS orchestration | Partly | Some (Telegram deprecated etc.) | Duplicates warmup rules | Keep at parent; do not import excluded rules into B2C agent |
| everest-calendar/AGENTS.md | repo | Yes (Codex) | Codex repo instructions | Yes | Unknown | May diverge from CLAUDE.md | Merge intent with CLAUDE.md |
| Claude Project/AGENTS.md | parent | Yes (Codex) | Codex parent instructions | Partly | Unknown | — | Keep at parent |
| .claude/settings.json | repo | Yes | Project Claude settings (modified) | Yes | No | — | Keep, commit |
| .claude/settings.local.json | repo/local | Yes | Local permissions (Meta MCP tool allowlist etc.) | Yes | No | — | **Keep local, gitignore — never commit** |
| .claude/meta/analysis-rules.md | repo | On Meta skills | Analyst reasoning rules | Yes | No | — | Keep, commit |
| .claude/meta/metric-dictionary.md | repo | On Meta skills | Canonical metric defs | Yes | No | Should align with Supabase `analytics_metric_dictionary` | Keep, commit; reconcile with DB |
| .claude/meta/account-context.md | repo | On Meta skills | Ad account 1737922103322223, AUD, Sydney tz, UAE targeting; several `REQUIRED` blanks | Yes | Partial (economics fields blank) | — | Keep, commit; **fill REQUIRED (owner)** |
| .claude/meta/query-policy.md | repo | On Meta skills | Safe query policy | Yes | No | — | Keep, commit |
| .claude/meta/tool-map.md (+ .template) | repo | On Meta skills | Meta MCP calling convention (verified 2026-07-28) | Yes | No | — | Keep, commit |
| .claude/meta/report-template.md / change-log.md | repo | On Meta skills | Output template + log | Yes | No | — | Keep, commit |
| .claude/hooks/meta_mcp_guard.py | repo | PreToolUse | Forces confirm on Meta MCP mutations/broad reads | Yes | No | — | Keep, commit |
| .claude/skills/meta-{setup,verify,audit,daily,experiment,change,creative} | repo | On demand | Meta analytics-agent skill set | Yes | No | Overlaps `marketing/skills` | Keep; de-dupe vs marketing/skills |
| marketing/skills/{design-kryo-experiment,implement-kryo-cro-change,review-kryo-release,update-marketing-learnings,validate-marketing-data}.md | repo | On demand | CRO/experiment skills | Yes | No | Some overlap with .claude/skills | Keep; unify location |
| Claude Project/.claude/skills/{promo-*,animate-image,i2v,source-supplier} | parent | On demand | Creative/promo + supplier | promo=Yes; source-supplier=excluded | No | — | Keep promo/creative; **exclude source-supplier from B2C** |
| KRYO_B2B/.claude/skills/b2b-research | other repo | No | B2B | — | — | — | **Excluded** |
| .mcp.json | — | — | Not present in repo | — | — | — | MCP servers configured at user scope (`~/.claude.json`), not repo |

## Conflicts / risks
- **Domain bleed:** `everest-calendar/CLAUDE.md` currently references CAD + supplier alongside
  marketing. The B2C analytics agent must not inherit those. Split into a marketing-only entry.
- **Duplicate skill homes:** Meta/CRO skills exist in both `.claude/skills/` and
  `marketing/skills/`. Pick one canonical location (proposed: `.claude/skills/`).
- **Metric dictionary duplication:** `.claude/meta/metric-dictionary.md` vs Supabase
  `analytics_metric_dictionary` (9 rows). Must be reconciled so the agent and DB agree.
- **account-context.md has blank `REQUIRED` economics** (price, break-even CPA/ROAS, min spend/
  purchases) — the agent cannot judge winners without these. Owner input needed.
