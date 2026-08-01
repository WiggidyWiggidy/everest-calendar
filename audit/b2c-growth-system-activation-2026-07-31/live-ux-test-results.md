---
depends-on: [constraint.binding, money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# live-ux-tester lens — results (2026-07-31)

Method: Playwright MCP against **live** `https://everestlabs.co/products/kryo2_`,
mobile 390×844 and desktop 1440×900. No checkout completed. Read-only except an
ephemeral cart add in a throwaway browser session.

## Discriminating test — H1 (variant picker breaks buy button)

| Step | Mobile | Desktop | Verdict |
|---|---|---|---|
| Add-to-cart present | Yes | Yes | PASS |
| Button `disabled` | **false** | **false** | PASS |
| Variant preselected | **Yes** — `Standard \| 12L`, id `49213767909684` | Yes | PASS |
| Variant picker blocks button | **No** — `<select>` with default value | No | PASS |
| `POST /cart/add` status | **200** | 200 | PASS |
| Real line item created | **Yes** — cart 1 → 2, `KRYO 2.0 - Standard \| 12L` | Yes | PASS |

**H1 REFUTED.** The add-to-cart is not technically broken.

> Correction to an intermediate reading: a first form-submit test showed `item_count: 0` and
> looked like a failure. That was an artifact of reading `/cart.js` during the post-submit
> navigation. A subsequent XHR add proved `cartBefore: 1` — the first add had in fact
> succeeded. Use XHR, not form submit, when asserting cart state.

## What the test found instead — buy-control reachability

| Measure | Mobile (390×844) | Desktop (1440×900) |
|---|---:|---:|
| Document height | 12,096 px | 10,548 px |
| Add-to-cart absolute Y | **11,731 px** | 9,845 px |
| **% down page** | **97.0%** | 93.3% |
| Screens to reach | **13.9** | 10.9 |
| Fixed/sticky buy controls | **0** | 0 |
| Above-fold buy affordance | **none** | none |

Above the fold on mobile the **only** interactive elements are a `Close` button (y=20) and
`Show/Hide Chatway Messenger` (y=764). No price, no CTA, no buy control.

Section render order: custom content block **10,814 px tall**, then `main-product`
(1,283 px) containing the only Add-to-cart — i.e. the product form renders *last*.

## Broken affordances

- **`#ProductForm` does not exist** on the rendered page, and no `a[href="#ProductForm"]`
  is present — yet `product.kryo-premium.json` configures the hero CTA as
  `"cta_href": "#ProductForm"`. The hero section (`kryo-hero-video`) is **not rendering**
  on the live page; only two sections render.
- **Clarity pixel fails to start** — `Clarity pixel failed to start... TypeError: Failed to fetch`.
  Clarity evidence for this page is unreliable.
- **Chatway app proxy 422** — `/apps/chatway-app-proxy/logged-in-customer-id` ×4 per load.

## Corrections to previously trusted context

| Stated | Measured |
|---|---|
| "Theme fires no Meta browser pixel (`fbq` absent)" | **`typeof window.fbq === "function"`.** But `POST facebook.com/tr` → `net::ERR_ABORTED` on form-submit navigation. The pixel exists; the beacon is killed by navigation. Different defect, different fix. |
| Old page available to revert to | **`/products/kryo2` → 404.** Only `kryo2_` is published; `kryo-2-0`, `kryo_2-0`, `kryo2-1`, `kryo_2`, `kryo` all 404. **Reverting requires republishing first.** |

## Market/currency observation (UNVERIFIED for UAE)

From this test location the store serves **JPY** (¥178,800) under a `shopify_AU` product
context. Whether UAE visitors are correctly served AED 3,990 could not be verified from here.
Worth a check from a UAE IP before drawing conclusions about pricing.

## Test-instrument findings (important)

### The original spec would have produced a FALSE positive for H1
`tests/kryo-atc-tracking.spec.ts` as originally written reported
`finalCartItemCount: 0`, `cartAddResponses: []`, `metaPixelPresent: false` — which reads as
"add-to-cart is broken and no pixel exists". All three were **test defects**:

1. It checked `typeof fbq` at `domcontentloaded`, before the pixel loads → false negative.
2. It clicked a fuzzy-matched button **without scrolling**. The only Add-to-cart sits at ~97%
   page depth, so nothing was clicked and **no `/cart/add` was ever sent**.
3. It read `/cart.js` during post-submit navigation → stale empty cart.

Acting on that output would have confirmed H1 and sent the fix down the wrong path.
The spec has been rewritten to wait for `load`, measure buy-control geometry, add via XHR
(no navigation), and assert `cartAfter > cartBefore`.

### Live-site rate limiting blocks headless re-runs
After repeated automated requests the storefront returns **HTTP 429 `local_rate_limited`**
with an 18-byte body, for both headless and headed Chromium. Symptom: `documentHeight`
exactly equals viewport height and no add-to-cart is found.

**This is caused by test volume, not by the site and not by bot detection.** Re-run the spec
after a cool-off, and space runs out. The MCP-browser measurements in this document were
taken before the limit was hit and are unaffected.

### Environment gaps fixed
- `@playwright/test` was not installed (the spec referenced it) — added as a devDependency.
  Without it, `npm run build` **failed**.
- No `playwright.config.ts` existed, so the documented `--project` flags could not work.
  Added, with a Chromium-based `mobile` project so mobile runs need no WebKit download.
- `npx playwright install webkit` is still required for true iOS testing.
