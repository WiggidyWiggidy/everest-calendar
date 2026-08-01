---
depends-on: [constraint.binding, constraint.mobile_atc, delivery.cost_per_lpv, delivery.july_collapse, delivery.uptime, money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# CORRECTION 2 — real order counts, and the collapse that never happened

2026-07-31. Supersedes `CORRECTION-real-baseline.md` and every earlier order figure.

## The data defect

**`shopify_funnel_daily.checkouts_completed` double-counts cart upsells as separate orders.**
It is not a customer count and must never be used as one.

Owner-supplied true customer counts:

| Month | Spend | LPV | **Customers** | CPA | Conv/LPV |
|---|---:|---:|---:|---:|---:|
| Feb | $308.45 | 127 | 1 | $308 | 0.79% |
| Mar | $0.93 | 0 | 1 | (organic) | — |
| May | $181.92 | 258 | 0 | — | 0.00% |
| Jun | $201.55 | 276 | **2** | $101 | 0.72% |
| Jul | $330.98 | 403 | 1 | $331 | 0.25% |
| **Total** | **$1,023.83** | **1,064** | **5** | **$205** | **0.47%** |

- **AOV $2,000** · **ROAS 9.8x** · **contribution per order $1,795**

## There was no June cluster and no July collapse

I previously reported "5 orders in 14 days, then 1 in 47" and "spend +64%, orders −80%".
**Both were artifacts of the inflated checkout count.**

True sequence: **1, 1, 0, 2, 1** — mean **1.0 order/month**.

Poisson test at λ=1.0:
- P(0 orders in a month) = **0.368**
- P(1) = 0.368 · P(2) = 0.184
- Joint probability of the observed sequence = **0.0034**
- Joint probability of the flattest possible sequence (1,1,1,1,1) = **0.0067**

The observed data is only **2× less likely** than the most uniform outcome possible.
**This is a constant-rate process. There is no regime change to explain.**

## What this means for the owner's actual question

Tom's goal is CPA *consistency* so he can scale spend. The finding:

**At 1 order/month, consistency is mathematically unattainable.** A zero-order month is
expected 37% of the time. No landing-page fix, creative test, or tracking repair changes that
— it is the arithmetic of small numbers.

**Consistency is a volume problem, not a conversion problem.** The only route to readable,
stable month-on-month numbers is more orders per month, which means more spend.

And the economics permit it: contribution is **$1,795 per order against a $205 CPA**. CPA
could rise ~8x before the unit stops being worth selling. **The business is very likely
under-spending, not under-converting.**

## Revised view of every earlier recommendation

| Earlier claim | Status now |
|---|---|
| "Dominant loss is mobile add-to-cart" | Real UX defects, but the same page converted while these defects existed. Not the binding constraint. |
| "July collapse / mid-June regime change" | **Withdrawn.** Artifact of double-counted upsells. |
| "0.5% target is not defensible" (red-team) | **Withdrawn.** Blended conversion is already 0.47%; the target is essentially met. |
| "You don't know the store can take money" | **Answered.** Five customers, $10k. |
| "Fix WhatsApp click tracking" | Still correct and now deployed — leads were genuinely invisible. |
| "`shopify_orders` empty" | **More important than ever.** No order can be attributed to any ad, and no Purchase event reaches Meta via CAPI. This is the direct blocker on scaling confidently. |
| Fabricated testimonials | Still off the table — but note the business now has **5 real customers** who could be asked for genuine reviews. |

## The one number that should drive everything next

**5 orders is the entire dataset.** Nothing about page layout, copy, creative or audience can
be concluded from it — not by me, not by an A/B test, not by any amount of further analysis.
The binding constraint is sample size, and the only way to buy sample size is spend.
