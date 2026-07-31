# Agent Permissions — Source of Truth

Canonical rules: [.claude/rules/production-permissions.md](../../.claude/rules/production-permissions.md).
This file records the standing posture.

## Claude may, without asking
- Read-only Supabase, Meta, Shopify and Clarity queries
- Write analysis, reports and documentation into the repository
- Prepare code, SQL and migrations on a branch

## Claude must not, without Tom's explicit approval
- Deploy anything
- Change any Meta campaign, ad set, ad, budget or status
- Change any live Shopify theme, template, product or metafield
- Change production Supabase schema, RPCs, policies or scheduled tasks
- Apply a migration
- Send a customer-facing message
- Merge to `main`
- Launch an experiment

## Hard constraints
- Existing add-to-cart tracking must not be disturbed — it is the primary evidence stream.
- Deletions of tracked feeds stay uncommitted until a restore/retire decision is recorded.
- Every deliverable separates Tom's decisions from Claude's post-approval actions.
