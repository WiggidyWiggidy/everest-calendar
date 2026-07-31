# kryo2_ add-to-cart — mechanism confirmed (Tom's hypothesis)

Supersedes the "no sticky CTA" claim in `2026-07-31-kryo2_-atc-blackboard.md`.
Measured live 2026-07-31.

## Correction to my earlier finding

I reported **"0 fixed/sticky buy controls"**. That was **wrong**. My scan filtered element text
on `/add to cart|buy|reserve/i`, and the sticky bar says **"Choose Model"** — so it was
excluded by my own filter. The bar exists and is tracked (`sticky_cta_click`, 16 sessions).

Acting on my version would have meant building a sticky add-to-cart that already exists.
Tom's account was correct.

## H6 — CONFIRMED: the sticky bar was downgraded from an action to a navigation

The sticky bar was not removed when models were added. It was **changed from a buy action
into a scroll link**.

Live markup: `<a href="#shopify-section-template--22800045769012__main">Choose Model</a>`

Measured click-through from mid-page (scrollY 4,415):

| Step | Result |
|---|---|
| Click "Choose Model" | scrolls **+6,299px** |
| Model `<select>` in viewport | **yes** |
| **Add-to-cart in viewport** | **NO — 153px below the fold** (btn y=997, viewport h=844) |

So the mobile buy path is **three actions**, not one:
`tap Choose Model → select model → scroll again → Add to cart`.

On the single-model control the same bar could add to cart in one tap.

**Mechanism: each added step is a drop-off point, and the final step is invisible — the user
who obeys the CTA still does not see a buy button when they land.**

## What the data does and does not support

| Claim | Verdict |
|---|---|
| Sticky bar is now "Choose Model", not a buy action | **FACT** — live markup + click test |
| Landing from the sticky CTA leaves Add-to-cart below the fold | **FACT** — measured |
| The multi-model change *caused* a measurable ATC drop | **NOT SUPPORTED at this n** — see below |

### The control page was not converting better on rate

| Page | Window | PDP sessions | Add-to-cart | ATC rate |
|---|---|---:|---:|---:|
| `/products/kryo2` (control) | before 2026-07-26 | 588 | 9 | **1.53%** |
| `/products/kryo2_` (new) | from 2026-07-26 | 250 | 3 | **1.20%** |

1.53% vs 1.20% is **not a meaningful difference** (expected 3.8 at the control rate, observed 3).

The control's advantage was **volume and time**, not rate: 588 sessions over a long window
produced 6 checkouts; the new page has had 250 sessions over 5 days. At the control's checkout
rate (6/588 = 1.02%), 250 sessions would expect ~2.6 checkouts; observing 0 gives p ≈ 0.08 —
suggestive, **not** significant.

**Both pages convert at ~1.2–1.5% add-to-cart. The friction Tom identified is real and worth
removing, but it is not yet proven to be the cause of a regression — because a regression is
not yet proven.**

## Tom's other two hypotheses

**"WhatsApp reserve is diluting the decision" — REFUTED.**
There is **no WhatsApp or Reserve control on the live page**. The only chat affordance is the
Chatway launcher at y=11,478 (97% down). Data agrees: of 250 PDP sessions, `whatsapp_click`=1
and `chatway_click`=2. It cannot be diluting a decision it is not present for.

**"Longer dispatch timeframe deterring" — PLAUSIBLE, UNTESTED.**
Announcement bar reads: `DUBAI FOUNDING BATCH · 8 OF 10 ALLOCATIONS REMAIN · DISPATCHES 30 AUGUST`
— 30 days out from today. No way to test this observationally without a variant. It is a
legitimate candidate and belongs in the experiment queue, not in the confirmed column.

## Two further defects found while checking this

1. **Inconsistent scarcity.** Live bar says **"8 OF 10 ALLOCATIONS REMAIN"**;
   `product.kryo-premium.json` configures the hero as **"16 / 50 left"**. Two different
   scarcity claims in the same system. `marketing/source-of-truth/offer-and-pricing.md`
   permits scarcity **only with a real unit count**.
2. **Five price points on one page:** `AED 2,000` (×3), `AED 3,990`, `AED 18,000`.
   On a page that now also asks the user to choose between three models, this compounds
   exactly the choice-load Tom described.

## Recommended change (revised)

**Do not build a new sticky add-to-cart — fix the existing bar.**

Preferred: make the sticky bar add the default model directly ("Add to cart — Standard | 12L"),
with model choice as a secondary link. This restores the control page's one-tap path while
keeping the range.

Fallback if a choice must be forced: keep "Choose Model" but ensure the scroll target lands the
**Add-to-cart button** in the viewport, not just the selector.

Primary metric: `cta_to_cart_request_rate` on mobile. Guardrail: desktop ATC must not fall.
