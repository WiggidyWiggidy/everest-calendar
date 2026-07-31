# Owner Decisions — 2026-07-31

## Decisions only Tom can make

| # | Decision | Why it needs Tom | Blocks |
|---|---|---|---|
| 1 | Approve the mobile add-to-cart reproduction test | Touches the live storefront (read-only, no change) | Everything |
| 2 | Pause / reduce paid Meta spend until mobile can transact | 97% of paid traffic lands on a page it cannot buy from. Campaign state is Tom-only. | Ongoing spend |
| 3 | **Is `shopify_orders` being empty a sync failure or genuinely zero sales?** | Cannot be resolved from data. Determines whether this is a measurement problem or a demand problem — and reorders every priority below. | Revenue analysis |
| 4 | Restore or retire the Meta breakdowns route | Product decision. Deletion is uncommitted and fully recoverable. | EXP-3 |
| 5 | Approve deploying WhatsApp lead capture | `kryo_leads` empty; the whole WhatsApp funnel is unmeasurable | EXP-2 |
| 6 | Confirm offer facts are current (AED 3,990, Aug 30 dispatch, 10-unit batch) | Marked "pending Tom confirmation" in `marketing/foundation/offer.md` since before this session | Any live copy |
| 7 | Approve pushing `consolidation/b2c-marketing-2026-07-31` to origin | Push was denied twice by the permission layer | Backup of 181 files |

## Actions Claude can execute after approval

| # | Action | Needs |
|---|---|---|
| 1 | Run the mobile reproduction test and report which hypothesis survives | Decision 1 |
| 2 | Fix the mobile add-to-cart path on a branch (no deploy) | Result of 1 |
| 3 | Prepare a migration adding the preview-host exclusion to ingestion | — |
| 4 | Restore the Meta breakdowns route + sync inclusion on a branch | Decision 4 |
| 5 | Prepare the asset-performance refresh path | — |
| 6 | Re-run `/kryo-growth-diagnose` after any fix to verify recovery | Fix landed |
| 7 | Build EXP-1 challenger page as a draft (unpublished) | EXP-0 verified |

## Standing constraints observed this session

- `main` not merged, not modified.
- No production Supabase, Shopify, Meta or Vercel write performed. All queries read-only.
- Existing add-to-cart tracking untouched.
- No experiment launched.
