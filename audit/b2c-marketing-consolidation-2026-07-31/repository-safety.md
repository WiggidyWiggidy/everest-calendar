# Repository Safety — everest-calendar (2026-07-31)

Read-only inspection. Nothing was reset, checked out, stashed, staged, or discarded.

## Facts
| Item | Value |
|---|---|
| Absolute repository path | `/Users/happy/Desktop/Claude Project/everest-calendar` |
| Repository root (toplevel) | same as above |
| Worktree type | **Normal clone** (`git-dir` = `.git`, common-dir = `.git`; not a linked worktree) |
| Current branch | `codex/kryo-proof-guardrails` |
| Current commit SHA | `5c23bb7d8be4c03ccbbab44ae43ed96a8654756d` (`5c23bb7`, 2026-07-06 22:27 +0800) |
| Remotes | `origin` → https://github.com/WiggidyWiggidy/everest-calendar.git (fetch+push) |
| Upstream branch | `origin/codex/kryo-proof-guardrails` |
| Ahead / behind upstream | **0 / 0** (branch tip is fully pushed) |
| Modified (tracked) files | 29 |
| Deleted (tracked) files | 3 |
| Untracked files | 112 |
| Staged files | 0 |
| Total porcelain entries | 144 |
| Commits on local branches not on any remote | 5 |

## Interpretation
- **GitHub is NOT behind at the branch tip.** `codex/kryo-proof-guardrails` @ `5c23bb7`
  exists on origin. The earlier "GitHub is behind" read was about *newest work*, which is
  correct in a different sense: the newest work is **uncommitted** (112 untracked + 29
  modified), so it is on this Mac only, not on GitHub.
- **Two distinct risk pools:**
  1. 144 uncommitted working-tree changes on the current branch (biggest pool; includes the
     entire new analytics/measurement toolchain — see working-tree-classification.md).
  2. 5 commits that live only on other local branches (see local-only-commits below), never pushed.
- `main` last moved 2026-06-02 (merge PR #151). The current branch is ~1 month ahead of main
  in committed history and much further ahead in uncommitted work.

## 5 local-only (unpushed) commits
| SHA | Branch | Date | Subject |
|---|---|---|---|
| `0ba3eaf` | fix/eslint-unused-imageRows | 2026-05-03 | Bypass auth middleware for `/api/marketing/sync/storefront-event` (public pixel) |
| `4a078b6` | feature/marketing-engine-v3 | 2026-03-30 | fix: upgrade Meta Graph API v21.0 → v25.0 |
| `02a23ba` | feature/creative-velocity-engine | 2026-03-29 | feat: creative matrix generator — 64 ad-copy variations from one brief |
| `5c7012f` | (dangling on velocity branch) | 2026-03-29 | feat: add product context helper for content generation |
| `a6bae4f` | feature/daily-focus-control-dashboard | 2026-03-13 | docs: add CLAUDE.md for Claude Code context |

## Recovery status
A full recovery package was created OUTSIDE the repo at
`~/Desktop/everest-calendar-recovery-2026-07-31/` (git metadata + tracked diff + verbatim
copy of at-risk untracked B2C work + sha256 manifest of 211 files). Secrets excluded.
See that folder's `RESTORE_INSTRUCTIONS.md`.
