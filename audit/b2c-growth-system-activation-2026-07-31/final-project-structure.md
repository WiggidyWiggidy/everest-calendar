---
depends-on: [constraint.binding]
---

# Final Project Structure

```
everest-calendar/
  CLAUDE.md                  # thin B2C entry point (was 177 lines -> router)
  AGENTS.md  README.md
  .claude/
    rules/                   # business-scope, evidence-standards, metric-definitions,
                             # experiment-governance, production-permissions
    skills/                  # 6 canonical + 7 existing meta-* platform skills
    commands/                # kryo-growth-diagnose.md
    agents/                  # (created, empty)
    meta/                    # Meta platform field mapping (retained, demoted)
  marketing/
    source-of-truth/         # 12 files (7 moved from foundation/, 5 new)
    data-contracts/          # 9 files
    research/  archive/      # archive/skills, archive/foundation, superseded CLAUDE.mds
    experiments/{active,completed,rejected}
    reports/{daily,weekly,investigations}
    analytics/ agents/ creative/   # retained
  src/  scripts/  supabase/  audit/
```

## Moves (all `git mv`, history preserved)
`marketing/foundation/*` -> `marketing/source-of-truth/` (7 files; `foundation/` now empty)
`marketing/analytics/attribution-rules.md` -> `marketing/data-contracts/`
`marketing/skills/*` -> `marketing/archive/skills/` (6 files; `marketing/skills/` removed)

## Application code — deliberately not moved
`src/lib/marketing/`, `src/app/api/marketing/`, `scripts/kryo-*`, `supabase/migrations/`
remain in their technical locations, per the brief.

## Archived, not deleted
`marketing/archive/CLAUDE.md.superseded-2026-07-31.md`,
`marketing/archive/parent-CLAUDE.md.superseded-2026-07-31.md`,
`marketing/archive/skills/` (6 superseded skills),
`../../CLAUDE.md.bak-2026-07-31` (outside repo).
