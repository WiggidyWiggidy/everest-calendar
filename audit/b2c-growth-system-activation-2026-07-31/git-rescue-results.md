# Git Rescue Results — 2026-07-31

## Repository identification

The brief pointed at "this repo". Two clones of `everest-calendar` exist on this machine:

| Path | Branch | Uncommitted |
|---|---|---|
| `/Users/happy/everest-calendar` | `main` | 8 |
| `/Users/happy/Desktop/Claude Project/everest-calendar` | `codex/kryo-proof-guardrails` | **130** |

Both share origin `https://github.com/WiggidyWiggidy/everest-calendar.git`.

The Desktop clone matched the described state (branch name + change count), and the brief
names it explicitly. **All work below was performed in the Desktop clone.**
`/Users/happy/everest-calendar` was not modified.

## Lock state

- `/Users/happy/everest-calendar/.git/index.lock` — did not exist.
- `/Users/happy/Desktop/Claude Project/everest-calendar/.git/index.lock` — **existed**,
  zero bytes, timestamped `Jul 31 13:29`.

Lock owner (`lsof`): PID 60928,
`com.apple.Virtualization.VirtualMachine` — a macOS VM holding the shared folder open
**read-only**. No `git` process owned the lock; the lock was stale.

No immutable flag was set. Removed with `rm -f`; no `sudo` required.
Post-removal write test (`git status`) succeeded.

**Git rescue is complete — the lock is cleared.**

Note: the VM still has this directory shared. If the lock reappears, that VM is the
likely cause.

## Branch

Created from `codex/kryo-proof-guardrails` @ `5c23bb7`:

```
consolidation/b2c-marketing-2026-07-31
```

All 130 working-tree changes were preserved across the switch (verified before and after).

## .gitignore verification

`git check-ignore` confirmed all required paths are ignored:

| Path | Result |
|---|---|
| `.env.local` | IGNORED |
| `.env.prod.local` | IGNORED |
| `.vercel/.env.production.local` | IGNORED |
| `.claude/settings.local.json` | IGNORED |
| `tmp/` | IGNORED |
| `reports/` | IGNORED |
| `screenshots/` | IGNORED |
| `supabase/.temp/` | IGNORED |
| `$CODEX_HOME/` | IGNORED |

No additions to `.gitignore` were needed — it was already hardened.

## Commits

`HEAD` = `99adc262291f0e983fff1d7cc64ad069c6669d21`

Total across the branch: **181 files changed, 22,018 insertions(+), 608 deletions(-)**

| # | SHA | Commit | Files |
|---|---|---|---|
| 1 | `e65f9f3` | chore(repo): harden .gitignore for secrets, caches, local settings | 1 |
| 2 | `a195979` | chore(agents): update Claude agent definitions, skills and CI config | 23 |
| 3 | `d8336c4` | feat(scripts): B2C marketing automation and system scripts | 44 |
| 4 | `32a8e9b` | feat(app): marketing dashboard and API route updates | 43 |
| 5 | `7f44eba` | feat(marketing): B2C campaign assets and Shopify theme sections | 36 |
| 6 | `f721057` | feat(db): migrations, RPCs and views for marketing data layer | 21 |
| 7 | `99adc26` | docs: KRYO runbooks, operating map and QC documentation | 13 |

The brief listed 8 commit groups; these 7 cover the same material. "Structural
consolidation and reference updates" (group 8) has no content yet — it belongs to
Phase 3, which has not been performed.

## Secret scan

Run across the full committed range
(`git diff codex/kryo-proof-guardrails..HEAD`) for JWTs, Meta `EAAG/EAAB` tokens,
`sk-` keys, PEM private-key headers, and Google `AIza` keys.

**Result: clean. No secret values were committed.**

No `.env*`, `settings.local.json`, `tmp/`, `reports/`, `screenshots/`,
`supabase/.temp/` or `audit/` path appears in any commit.

## Deliberately NOT committed

Left as uncommitted working-tree changes so the decision stays open:

| Path | State | Reason |
|---|---|---|
| `src/app/api/marketing/sync/meta-breakdowns/route.ts` | deleted in worktree, **present in repo** | Restoration pending (Phase 11) |
| `supabase/migrations/2026-05-04_meta_ad_breakdowns_daily.sql` | deleted in worktree, **present in repo** | **Not in the brief's defer list.** Backs `meta_ad_breakdowns_daily`; committing its deletion would undercut restoring the route. Deferred on the same reasoning. |
| `docs/SHOPIFY_WEB_PIXEL.md` | deleted in worktree, **present in repo** | Per brief |
| `supabase/.temp/cli-latest` | modified | Cache file, forbidden by project rules. Content is `v2.109.1` — not a secret. |
| `audit/` | untracked | Deferred per brief |

### Open item: `supabase/.temp/cli-latest` is tracked

The file is gitignored but was committed before `.gitignore` was hardened, so the ignore
rule does not apply to it. Its modification is excluded from these commits, but it will
keep reappearing as a dirty path until untracked:

```bash
git rm --cached supabase/.temp/cli-latest
```

Not done — it is a deletion of a tracked file and was outside the brief's scope.

## Push status

**NOT PUSHED — the push command was denied at the permission prompt.**

The branch exists locally only. Nothing has reached `origin`. To push:

```bash
cd "/Users/happy/Desktop/Claude Project/everest-calendar" && git push -u origin consolidation/b2c-marketing-2026-07-31
```

## Confirmations

- `main` was **not** merged into, and was not modified.
- No production system was touched (no Supabase, Shopify, Meta, Vercel writes).
- No existing work was discarded — all 130 working-tree changes are either committed
  or intentionally retained as pending changes.
- Two intermediate commit attempts were made and rewound with `git reset --mixed` before
  any push; the rewinds were local-only and lost no file content.
