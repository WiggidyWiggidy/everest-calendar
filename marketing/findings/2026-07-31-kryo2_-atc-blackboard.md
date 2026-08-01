---
depends-on: [constraint.binding, delivery.cost_per_lpv, delivery.july_collapse, delivery.uptime, money.checkouts_as_sales, money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

> ## ⚠️ SUPERSEDED IN PART — read this first (added 2026-07-31, later same day)
>
> Two facts on this board were later **disproved by Tom**, and one open fork was closed:
>
> 1. **"old page kryo2 — 6 completed checkouts" is FALSE.** `shopify_funnel_daily.checkouts_completed`
>    double-counts cart upsells. True customer counts: Feb 1 · Mar 1 · May 0 · Jun 2 · Jul 1 = **5 total**.
>    Every old-vs-new page comparison built on "6 checkouts" is invalid.
> 2. **The ads were dark 28 of 61 days** (Jun 15–Jul 2, Jul 17–25) — deliberately, while Tom finalised
>    the product. The "July collapse" was downtime, not conversion decay. Orders track live days at
>    ~1 per 14 live days in both comparable windows.
> 3. **Attribution is settled:** Meta is the only channel; all 5 customers came from ads.
> 4. **H2 vs H5 is largely moot at this sample size.** The business runs ~1 order/month on ~A$113/wk.
>    The binding constraint is volume, not page layout. See `../../audit/b2c-growth-system-activation-2026-07-31/`
>    (`CORRECTION-2-real-order-counts.md`, `uptime-and-winner-ad-finding.md`, `scale-to-200aud-per-day.md`).
>
> **What on this board still stands (direct measurements, unaffected):**
> H1 REFUTED (cart works — 200 + real line); H5 CONFIRMED as a defect (buy control at 97% depth);
> `fbq` present but `facebook.com/tr` aborting; Clarity pixel failing; Chatway 422; `/products/kryo2` is 404.

# Blackboard — kryo2_ add-to-cart failure (live investigation)

Driven by `../agents/conversion-diagnosis-loop.md`. Updated 2026-07-31 after the
**live-ux-tester lens ran** (Playwright against the live storefront).

## Funnel (kryo2_ live window Jul 26–31, internal/test traffic excluded)

Filters: `is_internal=false`, not bot, host `everestlabs.co`, `page_path=/products/kryo2_`,
excludes anon_ids `elv_1779869995748*` / `elv_1779806210806*` and myshopify/admin referrers.

| Step | Source(s) | Value (n) | Status |
|---|---|---|---|
| impression → click | Meta | ~$0.33/landing | FACT — healthy |
| click → land/engage | first-party | mobile 204 PDP, 59% scroll ≥25% | FACT — healthy |
| **engage → add-to-cart** | first-party + Meta + Shopify | **mobile 1/204 (0.49%)**, desktop 2/44 (4.5%) | **CONFIRMED dominant loss** |
| add-to-cart → checkout | Shopify server-side | 0 started | CONFIRMED |
| checkout → purchase | Shopify | 0 | CONFIRMED |
| (contrast) old page kryo2 | Shopify | 6 completed checkouts | FACT — **but page is now 404** |

Scroll reach, kryo2_ live window:

| Segment | PDP | reach 90% | % | ATC |
|---|---:|---:|---:|---:|
| mobile · paid_meta | 182 | 54 | 29.7% | 1 |
| mobile · direct | 21 | 17 | **81.0%** | **0** |
| desktop · direct | 41 | 22 | 53.7% | 2 |

## Hypotheses

| # | Lens | Hypothesis | Test | Status | Evidence |
|---|---|---|---|---|---|
| H1 | code + research | Variant-picker breaks/disables Add-to-Cart | Live browser add-to-cart | **REFUTED** | Button `disabled:false`; default variant preselected (`Standard \| 12L`, id 49213767909684); `POST /cart/add.js` → **200**, real line created, cart 1→2. Works on desktop and mobile viewport. |
| H2 | data | Cold Meta traffic won't add at AED 3,990 | Fix H5, re-measure | **OPEN** | Cannot exclude — device and traffic-warmth are confounded (182/204 mobile are paid; 41/44 desktop are direct) |
| H3 | data | Adds happen but untracked | Shopify server-side | **REFUTED** | Shopify checkouts = 0 |
| H4 | data | Intent diverted to WhatsApp | WA from Meta | **REFUTED (mostly)** | WA from Meta ~0–1 |
| **H5** | **live-ux** | **Buy control is effectively unreachable — sits at 97% page depth with no sticky CTA** | **Browser geometry + scroll telemetry** | **CONFIRMED as a defect; causal share UNRESOLVED** | Mobile: button at y=11,731 of 12,096 doc (**97%**, **13.9 screens**), ~~**zero** fixed/sticky buy controls~~ — **THIS IS WRONG.** A sticky bar exists reading "Choose Model"; the original scan filtered on buy-words and excluded it. Telemetry confirms: `sticky_cta_click` fired in **15 of 206** mobile sessions, continuously 07-26→07-31. H5's central evidence is overturned — mobile users DO click a buy control; the step *after* the click fails. Desktop: y=9,845 of 10,548 (**93.3%**, 10.9 screens). Only 29.7% of mobile paid sessions reach even the 90% marker — and 90% ≠ 97%. |

## Red-team (verifier lens) — attempted falsification

| Attack | Result |
|---|---|
| Small-n / Poisson | **Survives.** Mobile paid 182 PDP, 1 ATC. At desktop-direct's 4.88% rate, expected ≈8.9. P(X≤1 \| λ=8.9) ≈ 0.0014. ~~The gap is not chance.~~ **SUPERSEDED — see the data-analyst entry below: this borrowed desktop's rate from a 60-day pooled segment as a fixed constant, ignoring its own uncertainty. Correct within-window Fisher exact gives p ≈ 0.081, NOT significant.** |
| Traffic-mix confound | **BREAKS the strong causal claim.** Device and warmth are near-perfectly confounded. H5 and H2 cannot be separated observationally. |
| Deep-scrollers should convert if H5 is the whole story | **Partially breaks H5.** Mobile direct: 17/21 reached 90% scroll, **0 ATC**. However n=17 expects only ~0.8 ATC at desktop rate, so 0 is unremarkable — weak evidence, not disproof. And 90% ≠ the 97% button position. |
| Window (5 days) | Narrow. Directional for cohort splits. |

**Verdict: the red-team did NOT break "H1 is refuted" or "the buy control sits at 97% with no
sticky CTA" — both are direct measurements. It DID break any claim that H5 alone explains the
loss.** H2 remains a live co-factor.

## Corrections to previously "trusted" context

| Previously stated | Measured 2026-07-31 |
|---|---|
| "Theme fires no Meta browser pixel (`fbq` absent)" | **False** — `typeof window.fbq === "function"`. But `POST facebook.com/tr` → `net::ERR_ABORTED`, so the event does not land. Different defect, different fix. |
| "Revert ads to old page" is available | **`/products/kryo2` returns 404** — unpublished. Only `kryo2_` is live. Reverting requires republishing first. |
| H1 was the leading candidate | Refuted by direct browser test. |

## New defects found (not previously on the board)

- **Clarity pixel fails to start** — `Clarity pixel failed to start... TypeError: Failed to fetch`.
  Clarity evidence for this page is therefore unreliable.
- **Chatway app proxy 422** — `/apps/chatway-app-proxy/logged-in-customer-id` returns 422 ×4 per load.
- **Market/currency routing** — a non-UAE visitor is served **JPY** (¥178,800) under a
  `shopify_AU` product context. Whether UAE visitors are correctly served AED is UNVERIFIED
  from this test location.

## Definition of Done — status
- [x] Every funnel step quantified from a canonical source.
- [x] Dominant loss corroborated by ≥2 independent sources (first-party, Meta, Shopify).
- [x] **Cause: H1 REFUTED by direct test; H5 CONFIRMED as a structural defect.**
- [x] Red-team attempted — broke the *strong* causal claim, not the measurements.
- [x] Top changes named with measurement plans.
- [ ] **H2 vs H5 causal share — UNRESOLVED.** Not resolvable observationally; the fix is the test.

## ⛔ Loop state: PARTIALLY RESOLVED — escalate the remaining fork to Tom
The blocking question (H1) is answered: **the cart is not broken.** The remaining fork
(H5 reachability vs H2 price/demand) cannot be settled by more analysis at this sample size.
The cheapest discriminating move is to ship the sticky-CTA fix and re-measure — it is low-risk,
independently justified, and converts an unresolvable observational question into a clean test.

---

## data-analyst append — 2026-08-01 (window Jul 26–31, kryo2_, device split)

**PREREQUISITE RED — primary deliverable withheld.**
`marketing_touches_clean` (the source my contract mandates, and which bars raw
`attribution_touches`) **does not exist** — no table, view or matview, in any schema.
Verified with a positive control (14 `%touch%` relations found, so the search was not blind).
`marketing_session_journeys`, cited in `metric-definitions.md` §3 as the basis of the
"verified reference values", **also does not exist**. §3 is therefore not currently
reproducible from any named source.

**The paid device split is not answerable at all.** `meta_ad_breakdowns_daily` is the only
device-grain paid source; it is empty in-window (last row **2026-05-17**, 75 days stale), and
all 33 of its lifetime ATCs sit inside the KNOWN-BAD Feb–May cart-tracking window.
`meta_ad_metrics_daily` (canonical paid ATC) has **no 2026-07-31 row** → window is
**5 of 6 days visible**: spend 61.63, LPV 79, **ATC 1**, purchases 0.

### First-party audit (UNVALIDATED-SOURCE — raw `attribution_touches`, barred as a verdict basis)
§0 applied incl. mandatory host filter; test fingerprints + myshopify/admin referrers excluded.

| Device | PDP | s50 | s90 | CTA sess | cart_req | **ATC sess** | ATC *events* |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mobile | 206 | 101 | 71 | 16 | 1 | **1** | 1 |
| Desktop | 44 | 28 | 23 | 5 | 2 | **2** | **12** |
| Tablet | 2 | 2 | 2 | 0 | 0 | 0 | 0 |

Desktop fired **12 add_to_cart events across 2 sessions** (6×) — event counts are unusable.
Host filter is load-bearing: 12 `myshopify.com` preview sessions produced **707 events**, 31%
of all events on the page.

### AGREE with the board
- Desktop **44 PDP / 2 ATC** reproduces exactly.
- The confound is total, and worse than stated: **desktop paid = 1 PDP session**
  (mobile 184/206 paid; desktop 43/44 non-paid). H5 and H2 are not observationally separable.
- ATC → checkout = 0. Purchases = 0.

### DISAGREE with the board
1. **"Survives small-n / Poisson … p ≈ 0.0014" is wrong for this window.** That test fixed
   desktop's rate as a known constant borrowed from the 60-day pooled segment, ignoring its own
   uncertainty. The correct within-window test is Fisher exact on 1/206 vs 2/44:
   P(k=2)=0.07574, P(k=3)=0.00515 → **two-tailed p ≈ 0.081. NOT significant at 0.05.**
   The 6-day window does **not**, on its own, establish a mobile-vs-desktop gap.
2. **Mobile PDP is 206, not 204** (minor; likely a window-boundary difference).
3. **"Zero fixed/sticky buy controls on mobile" is contradicted by telemetry.**
   `sticky_cta_click` fired in **15 of 206 mobile sessions** (21 events), continuously from
   Jul 26 13:46 to Jul 31 09:04. Mobile CTA clicks are almost entirely *sticky* (15 sticky vs
   1 hero); desktop is the reverse (5 hero, 1 sticky). Either a sticky control was present all
   window and the Playwright run measured a different state, or the event is misnamed.
   **H5's central evidence needs re-verification before it is acted on.**

### What this reweights
`cta_to_cart_request_rate` — mobile **1/16 (6%)** vs desktop **2/5 (40%)**. Mobile users *are*
reaching and clicking a buy control at 7.3% of sessions; what fails is the step *after* the
click. That points at a **click→cart-request break on mobile (new H6)** rather than pure
unreachability. Directional only — numerators are 1 and 2.

**No verdict issued. Numerators of 1 and 2 fall under the n≤2 no-rate rule.**
Handoff: red-team-verifier.
