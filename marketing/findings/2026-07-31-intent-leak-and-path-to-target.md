# KRYO — the intent leak, and the path to a healthy add-to-cart rate

Window: kryo2_ live, 2026-07-26 → 07-31. 250 eligible mobile+desktop PDP sessions.
Sources: `clarity_section_events` (section-level clicks), `attribution_touches` (funnel events),
live browser measurement. Internal/test traffic excluded.

## The headline: intent is 5x higher than realised add-to-cart

| Signal | Sessions | % of 250 PDP |
|---|---:|---:|
| Clicked the Add-to-cart button (`productsubmitbutton`) | 11 | 4.4% |
| Clicked the WhatsApp buybox (`kryo-wa-buybox`) | 7 | 2.8% |
| **Any buy intent (distinct)** | **16** | **6.4%** |
| Clicked *both* | 2 | 0.8% |
| **`add_to_cart` events that actually landed** | **3** | **1.2%** |
| Rage-clicked | 7 | 2.8% |

**6.4% of sessions show buy intent. 1.2% produce a cart line.**

This is the single most important number in the investigation. The traffic is not cold and the
price is not obviously the blocker — **one in sixteen visitors tries to buy.** The loss is
between wanting to buy and being able to.

> Caveat: `clarity_section_events` and `attribution_touches` do not share a clean session-id
> space, so "clicked but no cart" cannot be computed exactly. The intent counts and the
> add-to-cart count are each reliable; their per-session join is not.

## Where the intent goes

**44% of buy intent (7 of 16 sessions) goes to WhatsApp, not the cart.**

Three `wa.me/447724709585` links, all prefilled *"Hi, I want to lock in the AED 3,990"*:

| y | Label | Screen | Position vs buy button |
|---:|---|---:|---|
| 968 | **"Check Fit & Availability"** | 2 | **~11,000px BEFORE it** |
| 6,096 | "Hold My Price for 30 Days" | 7 | before it |
| 11,795 | "Not ready to order? Hold today's price for 30 days" | 14 | **64px AFTER it** |

The first commercial action on the page is a WhatsApp link. The last thing under the buy
button is an invitation not to buy. Two sessions clicked both paths — decision confusion, not
preference.

**`whatsapp_click` does not fire.** Verified by intercepting the pixel: clicking
"Check Fit & Availability" emits only the generic `click`, never `whatsapp_click`. So this
entire leak has been **invisible in the funnel**, and any prior conclusion that "WhatsApp isn't
diluting" (including mine) rested on a broken metric.

## Why the cart still fails when they do reach it

- Sticky bar says **"Choose Model"** and is a scroll link (`href="#...__main"`), not a buy action.
- Clicking it jumps +6,299px, lands the model selector in view — and leaves **Add-to-cart 153px
  below the fold**. The user who obeys the CTA still sees no buy button.
- 7 sessions rage-clicked, concentrated in the long content block.

## The arithmetic to a 0.5% purchase rate

Target: **0.5% purchase / session** (profitable at current CPC).

Currently: 250 sessions → 3 add-to-carts → **0 purchases**.

Required add-to-cart rate, by cart→purchase conversion:

| If cart→purchase is… | Required ATC rate | vs today (1.2%) | vs measured intent (6.4%) |
|---|---:|---:|---|
| 25% (strong, high-ticket, warm) | 2.0% | 1.7× | comfortably within |
| 15% | 3.3% | 2.8× | within |
| 10% | 5.0% | 4.2× | within |
| 8% | 6.3% | 5.3× | **at the ceiling** |

**The measured intent ceiling of 6.4% already covers every scenario down to ~8% cart→purchase.**
KRYO does not need more traffic, cheaper clicks, or a new angle to hit 0.5%. It needs to stop
losing the intent it already captures.

Unknown: cart→purchase is **unmeasurable today** — `shopify_orders` is empty and
`checkout_start` has fired once ever. That number must be instrumented before the target can be
tracked, not just hit.

## Ranked actions — by measured intent recovered

**1. Make the sticky bar add to cart directly.** *(recovers the largest share)*
"Add to cart — Standard | 12L", model choice demoted to a secondary link. Restores the control
page's one-tap path. Addresses the 11 sessions that clicked buy and the users who obey
"Choose Model" and still find no button.
*Metric:* mobile `cta_to_cart_request_rate`. *Guardrail:* desktop ATC must not fall.

**2. Remove the two pre-cart WhatsApp CTAs; keep one, below the buy button.** *(recovers ~44% of intent)*
Delete "Check Fit & Availability" (y=968) — it is the first commercial action on the page and
sends buyers off-site before they ever see a price control. Delete "Hold My Price for 30 Days"
(y=6,096). Keep a single assisted-sales link *after* the buy control for genuine hesitators.
*Expected:* if half the 7 WhatsApp-intent sessions redirect to cart, ATC roughly doubles on
that path alone.

**3. Fix `whatsapp_click` tracking before changing anything else.** *(makes #2 measurable)*
Without it you cannot tell whether removing the links recovered intent or destroyed it. This is
a prerequisite, not a parallel task.

**4. Reconsider "Hold today's price for 30 days" + "DISPATCHES 30 AUGUST" together.**
The page tells a ready buyer twice that waiting is safe, while dispatch is already 30 days out.
Tom's dispatch hypothesis is plausible and untested — but the *price-hold* copy is a direct
add-to-cart suppressor and is removable today.

**5. Fix contradictory scarcity.** Live bar: "8 OF 10 ALLOCATIONS REMAIN".
Template config: "16 / 50 left". `source-of-truth/offer-and-pricing.md` permits scarcity only
with a real unit count.

## What I would not do yet
- No landing-page copy A/B test. With ATC at 1.2% and intent at 6.4%, the instrumentation
  cannot resolve a copy effect — it would return "no difference" regardless of quality.
- No new traffic spend until intent capture is fixed. More clicks into the same leak is waste.
