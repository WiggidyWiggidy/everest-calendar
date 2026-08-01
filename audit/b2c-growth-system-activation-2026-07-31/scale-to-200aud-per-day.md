# Scaling to AUD $200/day — analysis  (2026-07-31)

Basis: **live days only** (33 days, $532.53, 679 LPV, 3 orders).
cost/LPV **$0.784** · conv **0.442%/LPV** · CPA **$178** · winner-ad ATC **10.0% of LPV**.
FX assumed **AUD→USD 0.66** — confirm the ad account's billing currency; every USD figure
below shifts if the account already bills in AUD.

---

## 1. "We still wouldn't leave the learning phase" — half right, and the half that's wrong matters

Correct **for purchases**. It is **wrong for add-to-cart**, and that is the whole point.

| AUD/day | US$/wk | LPV/wk | **ATC/wk** | Exits on ATC? | Purch/wk | Exits on purchases? |
|---:|---:|---:|---:|:--|---:|:--|
| 50 | 231 | 295 | 29.5 | no | 1.3 | no |
| **85** | 393 | 501 | **50.1** | **YES** | 2.2 | no |
| 100 | 462 | 589 | 58.9 | YES | 2.6 | no |
| 150 | 693 | 884 | 88.4 | YES | 3.9 | no |
| **200** | **924** | **1,179** | **117.9** | **YES** | 5.2 | no |
| 300 | 1,386 | 1,768 | 176.8 | YES | 7.8 | no |

**Purchase optimisation is unreachable at any spend you'd plausibly run** — 50 purchases/week
needs roughly US$35k/month. Stop planning around it.

**Add-to-cart optimisation is reachable, and AUD $200/day clears it by 2.4x.**

Threshold sensitivity (the winner ad's 10% ATC may not hold):

| If ATC rate is… | Spend needed to exit learning on ATC |
|---|---|
| 10.0% (winner ad, observed) | **AUD $85/day** |
| 5% (conservative) | AUD $170/day |
| 3% (pessimistic) | AUD $283/day |

**AUD $200/day exits learning on ATC even if the rate halves.** That is the strongest single
argument for this step — it is the first spend level at which Meta's optimiser can actually
work for you rather than buying cheap pageviews.

**Prerequisite:** the campaign must be set to optimise for **AddToCart**, and ATC must be sent
**server-side via CAPI**. Today the browser beacon aborts on navigation and first-party catches
3 of 11. Optimising for an event Meta only sees a third of the time wastes the entire benefit.

---

## 2. Does WhatsApp even out the ebbs and flows?

**Two different claims — one likely yes, one unmeasured. Don't conflate them.**

**As an optimisation signal: probably yes.** At 1,179 LPV/week, even a 5% lead rate gives ~59
leads/week — above the 50 threshold. WhatsApp leads are a viable optimisation event at this
spend, and they arrive far more frequently than purchases.

**But only if leads correlate with sales — and that is completely unmeasured.** Optimising
toward a proxy that does not predict purchase actively makes CPA worse: Meta would hunt for
people who like tapping WhatsApp buttons. We have 4 leads, all asking to defer payment 30 days,
and **zero measured lead→sale conversion**.

**As demand smoothing: partially, and also unmeasured.** Leads convert on a lag, so a lead
captured in a quiet week can land revenue the next — that genuinely buffers timing. But with no
lead→sale rate, the size of that buffer is unknown.

**What to do:** `whatsapp_click` only started firing today (the one-character regex fix). Run
30 days at the new spend and measure two numbers:
1. **lead rate as % of LPV** — decides whether it can be the optimisation event (needs ≥5%)
2. **lead→sale conversion** — decides whether it *should* be

Until then, **optimise on AddToCart, not WhatsApp leads.** ATC is already proven to correlate
with purchases on this account: the ad with 10% ATC produced 3 of 5 lifetime sales; the ad with
1.27% ATC produced none.

---

## 3. Can you scale to AUD $200/day?

**The economics say yes with a wide margin. The evidence base says step, don't jump.**

At AUD $200/day (US$132/day, US$924/wk, US$3,960/mo):
- **1,179 LPV/week → 5.2 orders/week → ~22 orders/month**
- P(zero-order week) drops to **0.5%** — the consistency problem disappears
- **8.2x step** from the current run-rate

### Profit under CPA inflation (50% margin, $1,000 contribution/order)

| CPA | vs today | Orders/mo | Contribution | Spend | **Profit** |
|---:|---:|---:|---:|---:|---:|
| $178 | 1.0x | 22.2 | $22,247 | $3,960 | **$18,287** |
| $356 | 2.0x | 11.1 | $11,124 | $3,960 | **$7,164** |
| $534 | 3.0x | 7.4 | $7,416 | $3,960 | **$3,456** |
| $712 | 4.0x | 5.6 | $5,562 | $3,960 | **$1,602** |
| $890 | 5.0x | 4.4 | $4,449 | $3,960 | **$489** |

**CPA would have to inflate ~5.6x before the spend stops making money.** Even a 3x
deterioration leaves ~$3,500/month profit. The downside is genuinely bounded.

### The real risks (not CPA)

1. **The 0.442% rate rests on 3 orders.** 95% CI is 0.091%–1.291%, i.e. **1.1 to 15.2
   orders/week** at this spend. The point estimate is 5.2 — the floor is not catastrophic, but
   it is not tight either.
2. **The winner ad has been off since 15 July.** Everything assumes it performs as before when
   restarted. Unverified.
3. **An 8.2x jump forces aggressive exploration.** Expect CPA to spike for 1–2 weeks before
   settling. Do not read that spike as failure.
4. **Audience saturation in a small market.** UAE/Dubai is a limited pool and monthly
   impressions would rise ~12x. **I could not verify reach/frequency — the Supabase API errored
   on that query.** This is the one input I have not checked and it is the most plausible cause
   of CPA inflation at this scale.
5. **You still cannot measure CPA.** `shopify_orders` has no writer. At $3,960/month that
   blindness costs far more than it does at $450/month.

### Recommended ramp

| Weeks | AUD/day | US$/mo | Expected orders/mo | Gate to advance |
|---|---:|---:|---:|---|
| 1–2 | **$85** | $1,683 | 9.5 | Winner ad restarted; ATC/wk ≥50; CPA < $400 |
| 3–4 | **$130** | $2,574 | 14.5 | CPA < $450; cost/LPV < $1.20 |
| 5–8 | **$200** | $3,960 | 22.3 | CPA < $500 over ≥8 orders |

Four to six weeks to full spend rather than an immediate jump. Rationale: $85/day already
crosses the ATC learning threshold, so you capture the main structural benefit in week 1 while
limiting exposure until the winner ad's rate is re-confirmed.

**If you'd rather move faster:** go straight to $130/day. The profit table shows even a 3x CPA
deterioration stays profitable, so the downside is ~$2,600/month at worst. Skipping to $200
immediately is defensible on economics but gives you no clean read on what changed.

---

## What must be true before the step

1. **Restart `Winner | Plunge is Dead`** (`120249120433950279`) on the page it converted on.
   Do **not** scale `(2_) LP - Winner` — 1.27% ATC, 0 purchases.
2. **Set the campaign to optimise for AddToCart** — not purchases (unreachable), not link clicks.
3. **Send ATC server-side via CAPI.** Optimising on an event Meta sees a third of the time
   wastes the learning-phase benefit entirely.
4. **Continuous delivery.** No gaps.
5. **One campaign, one adset.** Freeze edits between gates.
6. **Exclude Audience Network.**
7. **Fix the order webhook** — at $3,960/month, flying blind on CPA is the expensive part.

## Decision rules
- Judge on **4-week blocks**, never a single week.
- Expected at $200/day: **18–27 orders/month**.
- Investigate below 12/month; pull back if two consecutive blocks are below 12.
- **Ignore the first 10–14 days after each step** — that is exploration, not signal.
