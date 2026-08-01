# Owner Decisions — updated 2026-07-31 after the live-ux-tester lens

## Decisions only Tom can make

| # | Decision | Why it needs Tom | Note |
|---|---|---|---|
| 1 | **Revert ads to the old page?** | Campaign change | ⚠️ **`/products/kryo2` returns 404.** It is unpublished. There is nothing to revert to — it must be **republished first**. This changes the option Tom was offered. |
| 2 | **Approve deploying the sticky add-to-cart** (`theme-assets/snippets/kryo-sticky-atc.liquid`) | Live Shopify theme change | Prepared, not deployed. Highest-leverage change; also the discriminating test for H5 vs H2. |
| 3 | **Confirm the kryo2_ launch date (~2026-07-26)** | Decision-critical fact | Data-consistent (~0 sessions/day before, 21–45 after) but not owner-confirmed. |
| 4 | **Confirm the cart-tracking-broken window** (Tom said May–early June) | Decision-critical fact | Needed to bound which historical comparisons are valid. |
| 5 | **Is `shopify_orders` empty a sync failure or genuinely zero sales?** | Cannot be resolved from data | Still open from the previous session. Reorders every priority. |
| 6 | Restore or retire the meta-breakdowns route | Product decision | Deletion remains uncommitted and fully recoverable. |
| 7 | **Fix the hero section** — `product.kryo-premium.json` sets `cta_href:"#ProductForm"` but neither the anchor nor the hero renders live | Live theme change | The page has **no above-fold buy affordance at all**. |
| 8 | Investigate market/currency routing | Live store config | A non-UAE visitor is served **JPY** under a `shopify_AU` context. UAE behaviour unverified. |
| 9 | Approve pushing the branch | Push denied 4× by the permission layer | See below. |

## Actions Claude can execute after approval

| # | Action | Needs |
|---|---|---|
| 1 | Deploy sticky ATC to a theme preview and re-run the Playwright reachability assertion | Decision 2 |
| 2 | Republish `kryo2` if Tom wants the revert option | Decision 1 |
| 3 | Wire `meta-capi.ts` into the storefront-event route for AddToCart/InitiateCheckout/Purchase | Approval |
| 4 | Implement internal-traffic exclusion as a reusable SQL view | — |
| 5 | Instrument WhatsApp lead capture into `kryo_leads` + CAPI Lead | Approval |
| 6 | Restore the meta-breakdowns route | Decision 6 |
| 7 | Re-run the full diagnosis post-fix to measure recovery | Fix deployed |

## Standing constraints observed
- `main` not merged, not modified (`633b6cd`).
- No production system modified. No deploy, no theme change, no campaign edit, no migration applied.
- Existing add-to-cart tracking untouched — the sticky bar reuses the proven `/cart/add`
  contract and emits a **separate** `sticky_atc_click` event so its effect stays separable.
- No checkout completed during live testing.
