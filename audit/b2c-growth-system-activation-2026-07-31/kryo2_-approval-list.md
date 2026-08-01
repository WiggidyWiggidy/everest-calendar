---
depends-on: [constraint.binding, money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# kryo2_ — concrete changes for approval (2026-07-31)

Nothing below is deployed. Approve by number; I execute only what you name.
Every change is on `/products/kryo2_` (template `product.kryo-premium`) unless stated.

**Deploy order matters: #1 must go first.** Without it, #3 and #4 are unmeasurable — you
won't be able to tell whether removing a CTA recovered intent or destroyed it.

---

## 1. Fix WhatsApp click tracking  ·  PREREQUISITE  ·  risk: none

**File:** new snippet `kryo-whatsapp-tracking.liquid`, rendered after the existing pixel.
**Change:** capture-phase listener on `a[href*="wa.me"]` → `sendBeacon` (survives the
navigation to WhatsApp; the current `fetch` does not).

Also appends a short ref to the prefilled message: `[ref K7F2QX]`, so an inbound WhatsApp
message can be joined back to the session, the ad, and the CTA that produced it.

**Why:** `whatsapp_click` provably never fires today. Your 4 real leads were invisible.
**Measures:** `whatsapp_click` by placement (before_cart / after_cart), lead ref for attribution.

---

## 2. Sticky bar: "Choose Model" → real Add to cart  ·  highest leverage  ·  risk: low

**Today:** `<a href="#...__main">Choose Model</a>` — scrolls +6,299px and *still* leaves the
Add-to-cart button 153px below the fold.
**Change:** sticky bar becomes a real add-to-cart form for the default variant:

> **KRYO 2.0 — Standard | 12L · AED 3,990**  →  **[ Add to cart ]**   *Other models*

- Posts to the same `/cart/add` contract already proven working (200 + real line).
- "Other models" is a secondary text link to the selector for the ~minority who want Pro/Studio.
- Mirrors the page form's variant, so if they do choose a model, the bar follows.
- Emits a distinct `sticky_atc_click` so its contribution stays separable.

**Why:** 11 sessions clicked buy, 3 carts landed. This restores the one-tap path the
single-model control page had.

---

## 3. WhatsApp CTAs — reposition, don't delete  ·  risk: medium (see the trade-off)

Three `wa.me` links today:

| y | Label | Action |
|---:|---|---|
| 968 | "Check Fit & Availability" | **REMOVE** — first commercial action on the page, ~11,000px before any buy control |
| 6,096 | "Hold My Price for 30 Days" | **REWORD** (see below) |
| 11,795 | "Not ready to order? Hold today's price for 30 days" | **KEEP, reword** — correctly placed after the cart |

**The trade-off you should decide, not me:** WhatsApp is currently your *best* converting
path — 4 leads / 250 sessions = **1.6%**, versus 1.2% add-to-cart. Removing it entirely would
likely cost more than it gains.

But note *what* the copy is doing: **all 4 inbound messages asked to reserve the price for
30 days** — which is precisely what the button told them to ask for. The CTA is training
deferral, not purchase.

**Recommended reword** (both remaining links):
- from: *"Hold My Price for 30 Days"* / *"Not ready to order?"*
- to: **"Not sure which model? Ask us"** → prefill: *"Hi — which KRYO fits a [size] bathroom?"*

This keeps the assisted-sales channel and the lead volume, but converts it from a
payment-deferral request into a **model-selection** conversation — which ends in a cart,
and which also relieves the choice-friction you identified.

**Option 3b if you'd rather not touch copy yet:** remove only the y=968 link, leave the other
two as-is. Smaller, cleaner read on the placement effect alone.

---

## 4. Above-the-fold price + buy CTA  ·  risk: low

**Today:** the only interactive elements in the first mobile screen are a "Close" button and
the Chatway chat launcher. No price, no CTA, no buy control anywhere above the fold.
**Change:** add price + primary Add-to-cart to the hero block (the `ai-hero-split` area,
which already has the button row at y≈968 where the WhatsApp CTA currently sits).

**Why:** the page renders 10,814px of content before the product form. Every visitor
currently has to take it on faith that a buy control exists.

---

## 5. Fix contradictory scarcity  ·  risk: none

- Live announcement bar: **"8 OF 10 ALLOCATIONS REMAIN"**
- `product.kryo-premium.json` hero config: **"16 / 50 left"**

Two different claims in one system. `source-of-truth/offer-and-pricing.md` permits scarcity
only with a real unit count. **Tell me the true number** and I'll make both match.

---

## Not recommended yet

- **Testimonials / social proof:** worth doing, but there is no measurement in place to
  attribute a lift to them, and they don't address the intent leak. Do after #1–#4 land.
- **Any landing-page copy A/B test:** at 1.2% ATC with n=250, the test cannot resolve a copy
  effect. It would return "no difference" regardless of quality.
- **Republishing the old `kryo2` page:** it is 404. Its add-to-cart rate was 1.53% vs the new
  page's 1.20% — **not a meaningful difference** (expected 3.8 vs observed 3). Reverting is
  not the win it looks like; the control's advantage was volume and time, not rate.

---

## What I need from you

1. Approve by number (e.g. "1, 2, 3b, 4, 5").
2. The true allocation number for #5.
3. Confirm the WhatsApp number: the links point to **+44 7724 709585** (UK) for a Dubai store.
   Intentional?

## How we check in 2 days

Re-run the funnel on `/products/kryo2_` with internal traffic excluded:

- **Primary:** mobile `cta_to_cart_request_rate` — today **9.7%** (3 of 31)
- **Secondary:** `product_page_add_to_cart_rate` — today **1.2%**
- **New, currently unmeasurable:** `whatsapp_click` by placement, and leads matched by ref
- **Guardrail:** desktop add-to-cart must not fall below 12.1%
- **Total intent capture:** cart + WhatsApp lead — today ~2.8% (3 carts + 4 leads / 250)

At current traffic (~50 sessions/day) two days ≈ 100 sessions. That is enough to see a
directional move in `cta_to_cart_request_rate`, **not** enough to confirm a purchase-rate
change. Set expectations accordingly.
