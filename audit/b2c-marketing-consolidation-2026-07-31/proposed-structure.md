---
depends-on: [site.tracking_capi]
---

# Proposed Canonical Structure (PROPOSAL ONLY — do not perform)

No renames/moves performed. `marketing/` must NOT be renamed until all code/path imports are
mapped (several routes import `src/lib/marketing/`; scripts read `config/` and `marketing/`).

## Target layout (B2C marketing only)
```
everest-calendar/
  CLAUDE.md            <- eventual MAIN entry point (marketing-only; CAD/supplier removed)
  AGENTS.md            <- Codex counterpart, kept in sync with CLAUDE.md
  .claude/
    settings.json      <- committed
    settings.local.json<- gitignored (local perms; Meta MCP allowlist)
    skills/            <- SINGLE home for all B2C skills (meta-* + CRO/experiment)
    commands/
    hooks/             <- meta_mcp_guard.py etc.
    meta/              <- Meta analytics-agent config (analysis-rules, metric-dictionary, …)
  marketing/
    source-of-truth/   <- positioning, offer, brand-voice, funnel, visual-direction, runbooks
    data-contracts/    <- metric dictionary (reconciled w/ Supabase), source-health registry, exclusion rules
    research/
    experiments/       <- experiment briefs, ICE queue, readouts
    reports/           <- generated (gitignored)
    archive/           <- superseded material
  app/ (src/app)       <- Next.js routes (unchanged)
  supabase/            <- migrations + functions (unchanged; never delete applied migrations)
  scripts/             <- toolchain (kryo-*, system/*)
  docs/                <- playbooks, protocols, audits
```

## Placement of current items
| Current | Proposed home |
|---|---|
| MARKETING_RUNBOOK.md, KRYO_SYSTEM_OPERATING_MAP.md, KRYO_MARKETING_SYSTEM_QC.md, KRYO_PRODUCT_RUNBOOK.md | `marketing/source-of-truth/` |
| marketing/foundation/* | `marketing/source-of-truth/` |
| config/kryo-system-registry.json, qc-shopify-pages.json, kryo-whatsapp-tracking.json | `marketing/data-contracts/` |
| .claude/meta/metric-dictionary.md | `marketing/data-contracts/` (single canonical; agent reads it) |
| marketing/skills/* + .claude/skills/meta-* | `.claude/skills/` (one home) |
| scripts/kryo-* , scripts/system/* | stay in `scripts/` |
| artifacts/, reports/, screenshots/, tmp/ | gitignored generated output |
| CAD_RUNBOOK.md, SUPPLIER_RUNBOOK.md | **out of B2C scope** — keep in repo but not referenced by B2C CLAUDE.md |

## Guardrails on the proposal
- `CLAUDE.md` becomes the main entry point ONLY after CAD/supplier content is factored out so the
  B2C agent never loads excluded-domain rules.
- Do not move `marketing/` or `src/lib/marketing/` until an import/path map confirms no broken refs.
- Skill de-duplication requires diffing the two skill homes first (content may differ).
