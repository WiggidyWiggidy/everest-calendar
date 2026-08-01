---
depends-on: [constraint.binding, delivery.cost_per_lpv, delivery.uptime, delivery.winner_ad, money.cpa, money.sales_lifetime]
---

# Can $350/week reliably produce 1–2 sales? — 2026-07-31

Two facts from Tom close the open questions:
- **Meta is the only channel.** All 5 customers came from ads. The ~9.8x ROAS is causal.
  The "maybe it was a WhatsApp group" hypothesis is dead.
- **The 28 dark days were deliberate** (product being finalised), not a delivery fault.

That means the only valid baseline is **live days only**.

## Live-only baseline (28 dark days excluded)

| Window | Days | Spend | LPV | Orders |
|---|---:|---:|---:|---:|
| Jun 1–14 | 14 | $201.55 | 276 | 2 |
| Jul 3–16 | 14 | $269.35 | 324 | 1 |
| Jul 26–30 | 5 | $61.63 | 79 | 0 |
| **Total** | **33** | **$532.53** | **679** | **3** |

- cost per LPV **$0.784** · conv **0.442%/LPV** · **CPA $177.51**
- run-rate: **$113/week → 0.64 orders/week**

## The answer

| Scenario | Expected orders/wk | Zero-week risk | P(≥4 in a 4-week block) |
|---|---:|---:|---:|
| **$350/wk** (if account currency) | **1.97** | 13.9% | **95.4%** |
| **$350 AUD ≈ US$231/wk** | **1.30** | 27.2% | 76.3% |
| Current $113/wk | 0.64 | 52.9% | 25.3% |

**Yes — $350/week lands squarely on 1–2 sales per week.** It is a ~3x step from the current
run-rate and the arithmetic supports the target directly.

⚠ **Currency must be confirmed.** If the ad account bills in USD, $350/wk gives ~2 orders/wk.
If Tom means AUD 350 (≈ US$231), it gives ~1.3 orders/wk — still meeting "1–2", with a higher
chance of quiet weeks. Everything below assumes the USD figure; scale down ~35% for AUD.

## The honest confidence statement

**Weekly: no. Monthly: yes.**

At ~2 orders/week there is a **13.9% chance of a zero-order week** — roughly one week in seven
will show nothing, purely by chance, with nothing wrong. Reacting to that is the single most
likely way to destroy this.

Over a **4-week block** the picture is solid: **95.4% chance of ≥4 orders**, 99.7% of ≥2.

**Judge on 4-week blocks. Never on a single week.**

### What the data cannot yet promise
The rate rests on **3 orders**. 95% CI on the underlying rate is 0.091%–1.291% per LPV, i.e.
**0.41 to 5.76 orders/week at $350**. The point estimate is 1.97, but the true value could be
meaningfully lower.

**Knowing the rate to ±40% needs ~24 orders ≈ 12 weeks at this spend.** That is the real
timeline to confidence. Until then, run it and judge in blocks.

### Why the downside is small
At AOV $2,000: even on a 40% margin, contribution is $800/order against a $178 CPA —
**$622 profit per order**. A 4-week block at $350/wk costs $1,400 and is expected to return
~7.9 orders ≈ $7,900 contribution at 50% margin. Conversion would have to fall ~5x below the
observed rate before the spend loses money.

## What has to happen first

**1. Restart `Winner | Plunge is Dead` (`120249120433950279`) on the page it converted on.**
$303.61 · 470 LPV · **10.00% ATC** · **3 of the 5 lifetime purchases**. Off since 2026-07-15.
**Do not** scale the current ad `(2_) LP - Winner | Plunge is Dead` — 79 LPV, 1 ATC (1.27%),
0 purchases. 8x worse on Meta's own consistent measurement (Fisher p≈0.002).
*Spending $350/wk on the 1.27% ad is the most expensive mistake available right now.*

**2. Run continuously.** Uptime is the whole game. Every restart re-enters learning, and at
this volume the account cannot re-accumulate signal before the next gap. Continuous delivery
at $350/wk also puts LPV volume well past Meta's learning threshold for that event.

**3. One campaign, one adset.** Splitting across adsets divides already-thin signal. Freeze
edits — each change resets learning.

**4. Exclude Audience Network.** February bought 1,700 clicks at $0.18 of which **92.5% never
became a landing page view**, for zero orders.

**5. Fix the order webhook.** `shopify_orders` has **no writer** and the webhook returns HTTP
200 on every failure, so Shopify never retries. Until order rows exist you cannot compute real
CPA, feed Purchase events to Meta, or see cancellations. This does not block the spend increase
— but it blocks *knowing whether it worked*.

## Decision rules — pre-commit these

| Rule | Threshold |
|---|---|
| Decision unit | **4-week blocks. Never a single week.** |
| Expected per 4-week block | 6–10 orders at $350/wk USD |
| Investigate | < 4 orders in a 4-week block |
| Pull back | < 4 orders in **two consecutive** blocks |
| Cost per LPV alarm | > $1.20 (baseline $0.78) |
| Click→LPV alarm | < 40% (junk placements) |
| **Never** | act on any single week, or on fewer than 5 orders of evidence |

## Bottom line
$350/week is a reasonable, well-supported step. Expect **~2 orders/week averaged over a month**,
with **one quiet week in seven** that means nothing. The main risk is not the spend level — it
is spending it on the wrong ad, or judging it too early.
