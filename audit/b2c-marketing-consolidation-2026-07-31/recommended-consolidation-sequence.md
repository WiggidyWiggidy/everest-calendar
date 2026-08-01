# Recommended Consolidation Sequence (2026-07-31)

Ordered, reversible, low-risk-first. Nothing here has been executed. Each step lists its
guard so no live system or unsaved work is endangered.

## Phase 0 — DONE (this session)
- [x] Read-only repo safety inspection.
- [x] Recovery package at `~/Desktop/everest-calendar-recovery-2026-07-31/` (211 files, sha256, no secrets).
- [x] Full working-tree + branch + config + system + auth maps (this audit folder).

## Phase 1 — Preserve in git (no reorg yet) — HIGHEST PRIORITY
Goal: get the untracked toolchain off "this-Mac-only" status.
1. Confirm `.gitignore` covers `.env*`, `.claude/settings.local.json`, `tmp/`, `artifacts/`,
   `reports/`, `screenshots/`, `supabase/.temp/`, `$CODEX_HOME/`. Fix if not.
2. On the current branch, stage + commit the **untracked B2C toolchain, migrations, docs,
   `.claude/meta` + skills + hooks** in logical commits. **Do NOT commit** secrets or local perms.
3. Resolve the 3 tracked deletions deliberately (esp. the migration deletion — verify remote
   state first; prefer a forward migration over deleting an applied one).
4. Push the branch. Guard: branch already has upstream; push is additive.
   - Result: GitHub now holds the newest work; recovery package becomes backup, not lifeline.

## Phase 2 — Compare the 4 candidate branches for unique work (no merge)
Diff-only against the current tree; extract anything unique into notes, decide per file.
- `codex/google-oauth-ga4-gsc`, `codex/gsc-fast-analytics` (GA4/GSC direct-OAuth work),
  `feature/creative-velocity-engine` (64-variation generator), `codex/kryo-clean-clarity-7d`.
- Deliver a per-branch "unique work" list for Tom's keep/drop decision. **No cherry-pick yet.**

## Phase 3 — Reconcile the analytics contracts (make data trustworthy)
Prereq for the analytics agent.
1. Reconcile `.claude/meta/metric-dictionary.md` ⇄ Supabase `analytics_metric_dictionary`.
2. Fill blank `REQUIRED` economics in `account-context.md` (owner input) — price, break-even
   CPA/ROAS, min spend/purchases. Agent cannot judge winners without these.
3. Populate the empty correlation scaffolding: `analytics_identity_registry`,
   `analytics_reconciliation_daily`; wire the `compute_*` RPCs into the nightly cron.
4. Enforce `analytics_exclusion_rules` so known-bad legacy rows never reach a verdict.

## Phase 4 — Verify + re-establish sources in required order
Run the readiness scripts locally (owner, real env):
`Shopify → Meta(direct + MCP) → Clarity → then GA4 + GSC`.
- `kryo-shopify-readiness.mjs`, `verify-meta-token.mjs`/`kryo-meta-direct-readiness.mjs`,
  `sync/clarity` check, then `sync/ga4` + `sync/gsc`. Each gated by `kryo-source-health.mjs`.

## Phase 5 — Structure + skill de-dup (the reorg)
Only after Phases 1–2 secure the work: apply `proposed-structure.md`.
- Split `CLAUDE.md` into marketing-only entry (remove CAD/supplier).
- Unify skills into `.claude/skills/`; move source-of-truth + data-contracts; gitignore generated.
- Guard: move `marketing/`/`src/lib/marketing/` only after an import/path map — do a build after each move.

## Phase 6 — Stand up the analytics agent + first split test
- Agent reads reconciled contracts, queries correlated data, proposes/reads kryo2_ experiments.
- Run first experiment off trusted data; every readout writes a learning.

## Cross-cutting: security
Address Supabase **RLS-disabled on 98 tables** before scaling exposure (present SQL to Tom;
enable with policies so the app keeps access). Do not auto-apply.
