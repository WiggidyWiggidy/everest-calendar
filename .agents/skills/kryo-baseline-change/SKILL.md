---
name: kryo-baseline-change
description: Run a frozen KRYO baseline-change task through the deterministic executor. Use only for high-confidence non-experiment Shopify baseline releases. Codex must not research or orchestrate APIs itself.
---

# KRYO Baseline Change

## Operating rule

The research layer has already decided the marketing change, exact copy, exact IDs, exact assets, exact preconditions, rollback and monitoring rules.

Codex is an executor only.

Do not research, browse, search the repo for alternatives, inspect competitors, design CRO changes, choose APIs, rewrite copy, discover routes, refactor code, or improvise around failures.

## Source of truth

Execution mechanics:
`scripts/kryo-baseline-change.mjs`

Frozen task intent/state:
`marketing/baseline-changes/<TASK>.json`

Always execute the copies from `origin/main`, not potentially stale local working-tree copies.

## Materialise without changing the user's worktree

For every run:

1. `git fetch origin main`
2. create a temporary directory
3. materialise the executor with:
   `git show origin/main:scripts/kryo-baseline-change.mjs > <tmp>/run.mjs`
4. materialise the exact named JSON task with:
   `git show origin/main:marketing/baseline-changes/<TASK>.json > <tmp>/task.json`
5. run executor self-test:
   `node <tmp>/run.mjs selftest <tmp>/task.json`
6. only if self-test returns `SELFTEST_PASS`, run the requested phase.

Do not `git pull`, checkout, reset, stash, merge, or modify unrelated local files.

## REVIEW_BUILD

Run:
`node <tmp>/run.mjs review <tmp>/task.json`

The executor owns all precondition reads, review-template construction, Shopify-safe template parsing, allowed writes, live rereads and storefront checks.

Codex must not call Shopify/Vercel endpoints separately before or after the executor.

Success must be executor output `REVIEW_READY`.
Then stop.

A review run is never allowed to continue into production deployment.

## DEPLOY_APPROVED

Only run after the owner explicitly provides the exact approval token contained in the JSON task.

Run:
`node <tmp>/run.mjs deploy <tmp>/task.json '<EXACT OWNER APPROVAL TOKEN>'`

Success must be executor output `LIVE_VERIFIED`.
Then stop.

The executor creates/verifies the rollback template before production mutation and attempts automatic rollback if a later deployment step fails.

## ROLLBACK_APPROVED

Only run after the owner explicitly provides the exact rollback token contained in the JSON task.

Run:
`node <tmp>/run.mjs rollback <tmp>/task.json '<EXACT OWNER ROLLBACK TOKEN>'`

Success must be executor output `ROLLBACK_VERIFIED`.
Then stop.

## Environment

The executor first loads `MARKETING_SYNC_SECRET` from an existing local `.env.local` / `.env.production.local` if present.

If it is absent, the executor attempts to re-run itself using the linked Vercel project's production environment through `vercel env run -e production` using the frozen project/team IDs.

Never print secrets.
Never ask the owner to copy Shopify credentials.

If environment bootstrap is unavailable, return the executor's `ENVIRONMENT_UNAVAILABLE` output and stop. Do not substitute another auth method.

## Failure rule

Return the executor output as-is and stop on any failure state, including:

- `PRECONDITION_DRIFT`
- `ENVIRONMENT_UNAVAILABLE`
- `EXECUTION_SURFACE_UNAVAILABLE`
- `STOREFRONT_VERIFY_FAILED`
- `REVIEW_VERIFY_FAILED`
- `DEPLOY_FAILED_ROLLED_BACK`
- `ROLLBACK_FAILED`
- `ROLLBACK_VERIFY_FAILED`

Do not investigate or repair within the same run.
The research layer resolves failures and freezes a revised task/executor if required.

## Forbidden Codex behaviour

Never call or invent:
- `/api/marketing/shopify/admin-graphql`
- `/api/marketing/theme/clone-template`
- `/api/marketing/theme/configure-product`

Never mutate:
- live page during REVIEW_BUILD
- product template assignment
- price
- variants
- inventory
- cart/checkout
- Downpay
- Meta/tracking
- unrelated theme or repository files

The executor is the only implementation surface for this workflow.
