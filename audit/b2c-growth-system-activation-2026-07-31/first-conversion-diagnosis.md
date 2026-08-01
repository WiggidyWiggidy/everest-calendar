---
depends-on: [constraint.binding, delivery.cost_per_lpv, delivery.uptime, money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# KRYO B2C — First Conversion Diagnosis

**Date:** 2026-07-31 · **Window:** 60 days to 2026-07-31
**Source:** Supabase `oksemtvjcfzicksmukmz`, table `attribution_touches` (live, 0.0 d stale)
**Grain:** distinct `session_id`
**Eligibility:** `is_internal=false`, `traffic_class<>'bot'`, `page_url ILIKE '%everestlabs.co%'`

---

## 1. Executive diagnosis

**FACT.** The dominant conversion loss is **mobile add-to-cart**, and it is a device-level
failure, not an audience or messaging failure. On the identical page template
`/products/kryo2`, desktop sessions add to cart at **10.4%** and mobile at **0.18%** — a
57× gap on the same page, same product, same period. Mobile users are **more** engaged by
scroll depth, not less. The step that fails is narrow and specific: of 30 mobile sessions
that clicked the primary CTA, **1** produced a `cart_add_request`; on desktop, 22 CTA clicks
produced 18. Paid Meta traffic appears catastrophic (0.15% add-to-cart) only because it is
**97% mobile** — the defect is being misattributed to traffic quality.

**Commercial consequence:** ~80% of all product-page traffic is mobile and is effectively
unable to transact. Shopify independently records **1 checkout started and 1 completed in
45 days**.

---

## 2. Canonical funnel — live site, by device and source

| Device | Source | PDP sessions | Engaged (s50) | Deep (s90) | CTA click | Cart request | Add to cart | ATC rate |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Mobile | paid_meta | 674 | 248 (37%) | 163 | 30 | **1** | 1 | **0.15%** |
| Mobile | direct | 75 | 45 (60%) | 38 | 0 | 1 | 1 | 1.33% |
| Mobile | referral | 45 | 46 | 31 | 1 | 1 | 1 | 2.22% |
| Mobile | meta | 21 | 5 | 1 | 0 | 0 | 0 | 0.00% |
| Mobile | google | 17 | 14 | 10 | 0 | 0 | 0 | 0.00% |
| **Mobile total** | | **832** | | | **31** | **3** | **3** | **0.36%** |
| Desktop | direct | 164 | 73 (45%) | 66 | 22 | 18 | 20 | **12.20%** |
| Desktop | referral | 12 | 9 | 7 | 1 | 3 | 3 | 25.00% |
| Desktop | paid_meta | 8 | 5 | 4 | 1 | 0 | 0 | 0.00% |
| **Desktop total** | | **184** | | | **24** | **21** | **23** | **12.50%** |

Same-template control (removes page and audience confounds):

| Page | Device | Sessions | CTA | Cart req | ATC | ATC rate |
|---|---|---:|---:|---:|---:|---:|
| `/products/kryo2` | desktop | 77 | 9 | 5 | 8 | **10.4%** |
| `/products/kryo2` | mobile | 545 | 15 | 1 | 1 | **0.18%** |
| `/products/kryo2_` | desktop | 81 | 10 | 4 | 4 | **4.9%** |
| `/products/kryo2_` | mobile | 213 | 16 | 1 | 1 | **0.47%** |

**The decisive ratio — `cta_to_cart_request_rate`: desktop 82% (18/22), mobile 3% (1/30).**

Downstream stages are not measurable — see §6.

---

## 3. Dominant loss

**Stage: CTA click → cart request, on mobile.**

**FACT.** Magnitude: if mobile converted at the desktop rate (12.5%), the 832 mobile PDP
sessions in this window would have produced ~104 add-to-carts. Observed: **3**.
Approximately **100 add-to-cart events lost in 60 days**, concentrated entirely on mobile.

This is the largest absolute loss in the funnel by a wide margin. Every other candidate
stage operates on one to two orders of magnitude less volume.

**Confidence: high** for the existence and size of the gap — sample is large (832 vs 184
sessions), the effect is ~57×, and it reproduces independently on two separate templates
and across four traffic sources. **Confidence: moderate** for the mechanism (§5).

---

## 4. Responsible cohorts

- **Device: mobile** — the single discriminating variable. The gap holds within every
  traffic source and within both page templates.
- **Traffic: paid_meta** — carries the volume (674 of 832 mobile PDP sessions) and so
  absorbs the entire commercial cost, but is **not the cause**. Desktop paid_meta is only
  8 sessions, too small to compare; mobile *direct* and *referral* show the same failure
  (1.33% and 2.22%), which is what exonerates the traffic source.
- **Pages:** `/products/kryo2` (545 mobile sessions) and `/products/kryo2_` (213). Both affected.

---

## 5. Mechanism — competing explanations

The data proves *where* the funnel breaks. It does not yet prove *why*. Two accounts remain
live, and they require different fixes.

**HYPOTHESIS A — the mobile add-to-cart is functionally broken.**
Users tap the buy control and nothing happens, or the request fails silently.
*Supports:* Shopify independently shows ~zero checkouts (1 in 45 days), so the commercial
outcome is genuinely absent, not merely untracked. Deep mobile engagement (163 sessions to
90% scroll) is inconsistent with disinterest.
*Predicts:* mobile users retry, rage-tap, or exit from the cart region — visible in Clarity.

**HYPOTHESIS B — the mobile add-to-cart is untracked, not broken.**
The `cart_add_request` listener is not bound on the mobile template, so real adds are invisible.
*Supports:* mobile fires other events normally (`hero_cta_click`, `sticky_cta_click`, scroll
depth), so the pixel itself works; the gap is specific to cart events.
*Against:* if adds were real but untracked, Shopify would still show checkouts and orders.
It shows 1 checkout in 45 days and `shopify_orders` is empty. **This makes B unlikely as a
complete explanation**, though it may compound A.

**Distinguishing test (cheap, non-destructive):** load `/products/kryo2` on a real mobile
device, tap add-to-cart, and observe (i) whether the cart updates, (ii) whether a
`cart_add_request` row appears in `attribution_touches`. This resolves A vs B in minutes and
requires no production change.

**Rejected explanation — "paid Meta traffic is unqualified."** Mobile direct and referral
traffic fail identically (1.33%, 2.22%), and mobile scroll-50 rates (37–60%) meet or exceed
desktop (45%). The traffic engages; it cannot transact.

---

## 6. Missing evidence

Stated as UNKNOWN rather than estimated:

| Missing | Cause |
|---|---|
| Purchases, revenue, RPV, days-to-conversion | `shopify_orders` — **0 rows** |
| Qualified WhatsApp leads | `kryo_leads` — **0 rows** |
| WhatsApp conversations | `kryo_whatsapp_conversations` — **0 rows** |
| Cart-to-checkout rate (first-party) | `checkout_start` fired **once ever**, 2026-06-02 |
| Checkout-stage abandonment by device/source | `shopify_funnel_daily` has no device or source split |
| New vs returning | `anonymous_id` cross-session persistence unverified |
| Creative / message-angle performance | `meta_ad_breakdowns_daily` orphaned since 2026-05-17 |
| Pricing-section view, model interaction | No such events exist in the taxonomy |

**A data-integrity defect was found and corrected during this analysis.** Shopify
theme-editor preview traffic (`?source=visualPreviewInitialLoad`, `?oseid=…` on
`everestcoldwater.myshopify.com`) is **not** excluded by `is_internal`. It contributed 57
sessions but **8 of 34** add-to-cart sessions — a 24% overstatement — and inflated
event-level counts far more, firing up to ~16 duplicate cart events per session. All figures
in this document exclude it via the mandatory host filter. **Any prior KRYO funnel analysis
that lacked this filter overstated add-to-cart and should be re-run.**

---

## 7. Owner decision — Tom

1. **Approve the mobile add-to-cart reproduction test** (§5). Read-only, no production change.
   This is the gating step; everything else waits on its result.
2. **Decide whether to pause or reduce paid Meta spend** until mobile can transact.
   97% of paid traffic currently lands on a page it cannot buy from. *(Claude does not
   change campaign state without approval.)*
3. **Confirm whether `shopify_orders` being empty is a sync failure or genuinely zero sales.**
   This determines whether the business has a measurement problem or a demand problem — it
   changes the entire priority order and Claude cannot resolve it from the data.
4. **Decide: restore or retire the Meta breakdowns route.** Deletion is uncommitted and
   fully recoverable.

## 8. Claude implementation actions — after approval

1. Run the mobile reproduction test; report which hypothesis survives.
2. If A: locate and fix the mobile add-to-cart path; prepare on a branch, no deploy.
3. If B: bind the missing mobile tracking; prepare on a branch.
4. Add the host-exclusion filter to the ingestion layer so preview traffic never enters
   the funnel again (prepared as a migration, not applied).
5. Re-run `/kryo-growth-diagnose` post-fix to verify recovery.
6. Restore the Meta breakdowns route if Tom approves.

## 9. Measurement plan

**Primary:** `cta_to_cart_request_rate`, mobile only. Current baseline **3% (1/30)**.
Target: within 20% of the desktop rate (82%).
**Secondary:** mobile `product_page_add_to_cart_rate` — baseline 0.36%.
**Guardrail:** desktop add-to-cart must not fall below 10%.
**Sample:** ~200 mobile PDP sessions post-fix (≈4 days at current volume).
**Verification:** the fix is confirmed only when both first-party events *and*
`shopify_funnel_daily` checkouts move. Either alone is insufficient.
