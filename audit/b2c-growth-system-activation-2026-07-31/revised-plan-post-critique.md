# Revised plan after adversarial critique — 2026-07-31

Two agents attacked the plan. Both broke parts of it, including parts I authored.

## Corrections to my own earlier claims

| I said | Correction |
|---|---|
| "WhatsApp converts better than cart (1.6% vs 1.2%)" | **4 vs 3 out of 250 is noise.** 95% CI on 3/250 is ~0.25%–3.5% and overlaps 4/250 almost entirely. I over-read it. |
| "The funnel inverts, so friction isn't the binding constraint" | **Not a fair test.** WhatsApp sits at y=968 (1.15 screens); Add-to-cart at y=11,731 (13.9 screens). A ~12× placement advantage. This argues **for** reachability fixes, not against. |
| "6.4% intent covers every scenario down to 8% cart→purchase" | Point estimate presented as a range. True requirement across the intent CI is **8%–20%**; from measured carts, **41.7%**. |
| Recommended removing the y=968 WhatsApp CTA | **Do not.** It is the only commercial action in the first 6,096px of a 12,096px page. Removing it leaves half the page with no way to act. |

## The sharpest catch — the 30-day objection may be self-inflicted

Two of the three WhatsApp CTAs literally read **"Hold My Price for 30 Days"** and
**"Not ready to order? Hold today's price for 30 days."**

All four inbound messages asked to hold the price for 30 days.

**That is plausibly customers reading the button and doing what it says** — demand
characteristics, not voice-of-customer. It is also the foundation of the red-team's
"price/timing is the real constraint" verdict, so that verdict inherits the contamination.

We cannot currently tell which link each message came from, because **all three prefills are
identical**. Fixing that is the cheapest instrumentation available and nobody proposed it.

**Test before building anything:** give each link a distinct, complete, send-ready prefill,
and neutralise the price-hold wording (e.g. *"Check availability & delivery date"*).
- If people still ask to defer → the objection is real; build deposit/BNPL.
- If they stop → we wrote the objection ourselves.

Cost: one copy change, one week. Versus building a payment product on n=4 contaminated replies.

## Testimonials — withdrawn

KRYO has **zero customers**. Any testimonial would be fabricated: fraud, a Meta ads policy
violation, and UAE consumer-protection exposure. Not shippable in any form.

Honest substitutes that do the same job: named founder with a face, registered UAE entity and
address, WhatsApp Business verified badge, one continuous unedited video of the unit hitting
temperature, named compressor manufacturer, measured pull-down time at 45°C ambient, written
returns/warranty policy. For a no-review brand, verifiable specifics beat manufactured proof.

## Scarcity — "7 OF 10" is anti-scarcity

It announces that 70% of a "founding batch" is unsold — negative social proof to a visitor
already unsure about an unknown brand. A static counter is also a lie detector: it sits at 7
for two weeks and every returning visitor learns the number is decorative.

**Recommend instead:** drop the unit counter; use dispatch-date urgency —
*"Order by [date] for the 30 August dispatch."* True, self-updating, and converts the 30-day
lead time from an objection into a deadline. Kill the config contradiction (8 / 7 / 16-of-50)
today regardless.

## Revised ship order

| Step | Contents | Alone? |
|---|---|---|
| **0** | **One real end-to-end test order** (real card, then refund) + work the 4 live leads by hand | no code |
| **1** | Instrumentation only: repair `add_to_cart` event, fix Clarity `TypeError`, fix Chatway 422, **distinct prefill per wa.me link** | **ALONE — mandatory** |
| **2** | Truth + de-script: drop unit counter → dispatch cutoff, kill config contradiction, resolve the five price points, neutralise "Hold My Price" | batch safely |
| **3** | Reachability: **#2 + #4 together** (sticky ATC + above-fold price/CTA) | batch these two only |
| **4** | Payment terms (deposit / BNPL / COD) — only if the objection survives step 2 | alone |

**Never ship:** removal of the y=968 WhatsApp CTA.

**Why step 1 must ship alone:** we just fixed a one-character regex that made `whatsapp_click`
never fire. The `add_to_cart` instrument is likely lossy too (11 button clicks → 3 events).
If instrumentation and layout ship together, **a regex fix will read as a conversion lift.**
That is the most likely way this project produces a confident wrong answer.

## Why step 0 outranks everything

**838 cumulative sessions. 0 orders. `shopify_orders` empty. `checkout_start` has fired once
ever.** `POST /cart/add` returning 200 proves the *cart* works — it says nothing about payment.

We do not know the store can take money. Every proposed change assumes it can, and #2/#4 would
route *more* traffic into an unverified payment path.

Cost: ~20 minutes and a refundable AED 3,990. The 4 open leads are ~AED 15,960 of live
pipeline — more realised value than any conversion-rate change can produce at 50 sessions/day
inside the measurement horizon.

## Checked and cleared
Live Meta ads are **not** pointing at the dead `kryo2` page: 189 paid sessions since 2026-07-26
land on `/products/kryo2_`, zero on any 404 handle.

## Power reality
At ~1.2% and ~50 sessions/day, detecting a *doubling* of add-to-cart needs ~1,900 sessions per
arm ≈ 77 days per arm. **A/B testing is not an available tool at this volume.** Everything above
is judged on mechanism and downside, not on "we'll test it."
