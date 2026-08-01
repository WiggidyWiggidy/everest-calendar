---
depends-on: [constraint.binding, delivery.cost_per_lpv, delivery.uptime, money.cpa, money.sales_lifetime, site.tracking_capi]
---

# KRYO — what it takes to scale spend  (corrected data, 2026-07-31)

Baseline: **5 customers · 1,064 LPV · $1,023.83 spend · AOV $2,000 · ROAS 9.8x**
Blended conv **0.470%/LPV** · cost/LPV **$0.762** (May–Jul) · CPA **$205**

> An agent produced a scaling analysis using the pre-correction counts (6 orders, June=5).
> Its §1 conclusion — "June is a genuine regime, reject variance" — rested on a 5-orders-in-
> 14-days cluster that **does not exist**. That conclusion is void. Findings independent of
> order counts are retained below and marked.

## 1. Consistency is bought with volume — nothing else

Poisson CV = 1/√λ. This is arithmetic, not strategy:

| Orders/mo | CV | P(zero-order month) | Spend needed |
|---:|---:|---:|---:|
| **1 (today)** | **100%** | **37%** | $162 |
| 2 | 71% | 13.5% | $325 |
| 5 | 45% | 0.7% | $811 |
| 10 | 32% | ~0 | $1,623 |
| 14 | 27% | ~0 | $2,272 |
| 25 | 20% | ~0 | $4,056 |

**At 1 order/month a 37% chance of a zero-order month is unavoidable.** No page fix, creative
test or tracking repair changes it. To make months *feel* consistent (CV ≈ 30%) you need
~10 orders/month ≈ **$1,600/month spend** — roughly **5x current**.

## 2. Meta will not optimize on purchases. Stop planning around it.

50 events/adset/week = 217/month:

| Optimization event | LPV/mo needed | Spend/mo | vs today |
|---|---:|---:|---:|
| Purchase | 46,178 | **$35,210** | 106x |
| AddToCart @3x purchase rate | 15,393 | $11,737 | 36x |
| AddToCart @6x | 7,696 | $5,868 | 18x |
| WhatsApp lead @5% of LPV | 4,340 | $3,309 | 10x |
| **WhatsApp lead @9% of LPV** | 2,411 | **$1,838** | **5.6x** |
| **Landing page view** | 217 | **$165** | **0.5x — already exceeded** |

Two consequences:
- **LPV already exits learning** (July: 403/mo = 93/week). That is exactly why cost/LPV is
  so stable (CV 8.1%) — Meta is optimizing that metric well. You are getting what you asked for.
- **The only realistically reachable higher-intent event is a qualified WhatsApp lead**, and
  only if the lead rate is **≥9% of LPV**. That number is currently unknown because
  `whatsapp_click` never fired until today's fix. **Measuring it over the next 30 days decides
  the optimization architecture.**

**No mid-funnel exists:** InitiateCheckout (7) ≈ Purchases (5–6). The usual "optimize on
InitiateCheckout" escape hatch is unavailable. *(Independent of the order-count correction.)*

**Practical implications now:** one campaign, one adset (fragmenting divides insufficient
signal); freeze edits (every edit resets learning and you can never re-accumulate);
accept that Meta's optimizer will not be the source of CPA consistency.

## 3. The downside of scaling is small; the economics are wide open

AOV $2,000. COGS unknown — sensitivity:

| Gross margin | Contribution | Break-even CPA | Break-even conv/LPV |
|---|---:|---:|---:|
| 40% | $800 | $800 | 0.095% |
| 50% | $1,000 | $1,000 | 0.076% |
| 60% | $1,200 | $1,200 | 0.064% |

Current CPA **$205**. **CPA can rise ~4–6x before a marginal order loses money.**
95% CI on the true rate is 0.153%–1.097%, i.e. CPA **$70–$500** — the pessimistic end is
still profitable at any plausible margin.

**This is the strongest argument in the whole analysis: the business is far more likely
under-spending than under-converting.**

## 4. Slow ladders are a trap at this volume

Distinguishing a 2x CPA change needs ~33 orders (~16 per period):

| Spend/mo | Orders/mo | Months to read a 2x change |
|---:|---:|---:|
| $331 (today) | 2.0 | **8.0** |
| $750 | 4.6 | 3.5 |
| $1,350 | 8.3 | 2.0 |
| $2,000 | 12.3 | **1.3** |

Below ~$2,000/month you cannot detect a 2x regression inside a quarter. Since learning phase
is unreachable at every one of these levels anyway, a "+20% every 4 days" ladder buys no
protection and costs months. **Move in few, large steps and hold them still.**

## 5. Sequence

**Before any spend increase — one week, and one 10-minute task first:**

| # | Action | Why it blocks |
|---|---|---|
| **0** | **Open the 5 orders in Shopify admin, read Conversion Details** (referrer, first/last click, UTM, landing page) | 10 minutes, no code. **The only thing that can invalidate this whole plan.** If most orders show direct/none or a non-Meta referrer, the 9.8x ROAS is not causal and Meta is not the channel. |
| 1 | `orders/create` + `orders/paid` webhook → `shopify_orders` | Table is empty. No order is attributable to any ad. Everything else is unmeasurable without it. |
| 2 | CAPI Purchase (with `event_id` dedup, value, currency, hashed contact) | Will **not** unlock purchase optimization at 5 events — say so plainly. It makes ads comparable and builds history for later. |
| 3 | CAPI AddToCart + InitiateCheckout server-side | Fixes the aborting browser beacon and the 3-of-11 first-party loss structurally. |
| 4 | Finish WhatsApp qualified-lead event; **measure lead-rate/LPV for 30 days** | Decides whether any optimization event above LPV is viable (needs ≥9%). |
| 5 | Restore placement/creative breakdown feed (dead since 05-17) | Without it, placement hygiene cannot be verified. |

**Not blocking:** GA4, GSC, session_quality, journey_events. Do not let them delay the ramp.

**Then:** consolidate to 1 campaign / 1 adset, broad UAE, **exclude Audience Network**, step to
**~$750/mo**, freeze for 6 weeks. Gate to $1,350, then ~$2,000.

### Exclude Audience Network — evidence
*(Independent of the order-count correction.)*

| Month | Clicks | LPV | Click→LPV | CPC | Orders |
|---|---:|---:|---:|---:|---:|
| **Feb** | 1,700 | 127 | **7.5%** | $0.18 | **1** |
| May | 418 | 258 | 61.7% | $0.44 | 0 |
| Jun | 518 | 276 | 53.3% | $0.39 | 2 |
| Jul | 784 | 403 | 51.4% | $0.42 | 1 |

February bought 1,700 clicks at $0.18 of which **92.5% never became a landing page view**.
That is the signature of Audience Network / misclick inventory. When this account is scored on
cheap clicks, it buys junk.

### Pre-commit these pull-back triggers

| Trigger | Threshold | Action |
|---|---|---|
| Rolling 30-day CPA | > $600 | Hold spend flat, investigate |
| Rolling CPA on ≥8 orders | > $800 | Cut back |
| Cost per LPV | > $1.50 | Creative/placement problem |
| Click → LPV | < 40% | Junk traffic — audit placements |
| Checkout completion | < 70% (now 86%) | Checkout/payment issue |
| **Any decision on <5 orders** | — | **Forbidden.** This is the discipline that would have stopped July being read as a crisis. |

## 6. Biggest risk — not CPA, but unverified attribution

At $2,000/mo and July's worst observed 0.25% conv: 2,623 LPV → 6.6 orders → CPA $305,
contribution 6.6 × $1,000 = $6,600 vs $2,000 spend. **Still strongly profitable.**
Conversion would have to fall below ~0.08% to lose money — below the 95% lower bound.

**The real exposure:** no order has ever been tied to an ad. If most of the 5 came from an
off-platform source (a gym, a WhatsApp group, a founder post), the true ad CPA is far higher
and Meta may not be the channel at all. **Task 0 above resolves this in 10 minutes and should
happen before a line of webhook code is written.**

Secondary, unquantifiable today: 30-day dispatch + higher volume raises cancellation and
chargeback exposure, and cancellations are currently invisible — another consequence of the
empty orders table.

## Bottom line

| Rank | Constraint | Confidence |
|---|---|---|
| 1 | **Order-level measurement blindness** — `shopify_orders` empty, ad causality never verified | High (verified fact) |
| 2 | **Insufficient volume** — 1 order/month can never look consistent; the cure is spend, not tuning | High |
| 3 | **Meta signal** — real, worth fixing, but oversold as a near-term CPA lever (purchase optimization needs $35k/mo) | High on diagnosis, moderate on benefit |
| 4 | **Landing page** — not the variance driver; may still be a *level* constraint once volume exists to measure it | High |

**One sentence:** this is not a landing-page problem or a Meta problem — it is a
*five-orders-and-no-attribution* problem, and the fix is one week of instrumentation followed
by a step to ~$1,600–2,000/month held perfectly still.
