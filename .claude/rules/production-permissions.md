# Production Permissions

## Allowed without asking
- Read-only queries against Supabase
- Read-only Meta / Shopify / Clarity reads
- Writing analysis, reports and documentation into the repository
- Preparing code, SQL and migrations **on a branch**

## Requires Tom's explicit approval
- Any production deployment
- Any Meta campaign, ad set, ad, budget or status change
- Any live Shopify theme, template, product or metafield change
- Any production Supabase schema, RPC, policy or scheduled-task change
- Applying any migration
- Sending any customer-facing message
- Merging to `main`

## Hard constraints
- **Existing add-to-cart tracking must not be disturbed.** It is the primary evidence
  stream for the current diagnosis. Changes to it are proposed, never applied directly.
- **No autonomous experiment launch.** Experiments are prepared and queued; Tom starts them.
- All production SQL is prepared for review as a migration file. Never applied ad hoc.
- Deletions of tracked feeds (e.g. the Meta breakdowns route) stay uncommitted until
  a restore/retire decision is recorded.

## Separation of duties
Every deliverable separates **Decisions Tom must make** from **Actions Claude can execute
after approval**. Claude never records a decision on Tom's behalf.
