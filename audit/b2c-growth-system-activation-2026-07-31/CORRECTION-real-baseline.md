# CORRECTION — the business is profitable; my baseline was wrong

Date: 2026-07-31. This supersedes the "zero purchases / broken funnel" framing in
`first-conversion-diagnosis.md` and the two adversarial critiques.

## What I got wrong

I diagnosed a **5-day window** (250 sessions, 0 purchases) and treated it as the funnel's
steady state. Tom supplied the missing context: **~$10k revenue on ~$1k ad spend over 4 months.**

The data confirms it. Both agents and I repeated a claim that was **false**:

> "The old page's 6 completed checkouts produced zero rows in `shopify_orders` — that is an
> instrumentation artifact or test traffic, not six sales."

**Those six checkouts were real sales.** `shopify_orders` is empty because the order sync is
broken, not because there are no orders. I inverted the meaning of a missing table.

## The real baseline (verified)

`meta_ad_metrics_daily` total spend = **$1,023.83** — matches Tom's "$1000" exactly.
`shopify_funnel_daily` completed checkouts = **6**, between 2026-04-21 and 2026-07-30.

| Month | Spend | LPV | Orders | CPA | Conv/LPV |
|---|---:|---:|---:|---:|---:|
| Feb | $308.45 | 127 | 0 | — | 0% |
| Mar | $0.93 | 0 | 0 | — | — |
| May | $181.92 | 258 | 0 | — | 0% |
| **Jun** | **$201.55** | **276** | **5** | **$40** | **1.81%** |
| **Jul** | **$330.98** | **403** | **1** | **$331** | **0.25%** |

- Blended: **6 orders / 1,064 LPV = 0.56%**, CPA **$171**, AOV ~$1,667, **ROAS ~9.8x**
- **Tom's 0.5% target is already met on average.** The problem is variance, exactly as he said.
- Checkout completion is **6 of 7 started = 86%**. That stage is healthy.
- Cost per LPV is stable ($0.71 → $0.73 → $0.82). Acquisition is cheap and consistent.

## The actual problem, restated

**July spend was 64% higher than June and produced 80% fewer orders.**
Conversion fell 1.81% → 0.25%, a 7.2x collapse, with traffic cost unchanged.

Order timing: 06-01, 06-02, 06-07, 06-07, 06-14, then **07-06**, then nothing for 25 days.
Five of six orders fell inside a 14-day window.

Two readings, both live:
1. **Regime change mid-June** — something broke. Multiple feeds went stale in the same window.
2. **Poisson noise at n=6** — five orders in 14 days then one in 47 may simply be luck.

These have not been separated yet. An investigation agent is running on it.

## What this changes about the recommendations

- **The landing page is no longer the presumed constraint.** The old page converted at 1.81%
  in June. The page is not obviously broken.
- **"You don't know the store can take money" is answered** — it can, six times.
- **The measurement work is still critical, but for a different reason:** with ~1.5 orders/month,
  Meta receives far too few conversion events to exit learning phase (~50/adset/week). It is
  therefore optimising on clicks/LPV rather than value. That is a strong candidate for the CPA
  inconsistency Tom wants to fix — and it is a signal problem, not a page problem.
- **`shopify_orders` being empty now matters much more:** with no order-level data, no order can
  be attributed to an ad, creative, or audience, and no Purchase event can be fed back to Meta
  via CAPI. That is the direct blocker on scaling spend confidently.

## Still true and still worth doing
- The `whatsapp_click` regex fix (deployed today) — leads were genuinely invisible.
- Distinct prefills per WhatsApp link — the "30-day deferral" finding is still plausibly an
  artifact of CTA copy that says "Hold My Price for 30 Days".
- Killing the scarcity contradiction (8 / 7 / 16-of-50).
- Fabricated testimonials remain off the table — zero reviewable customers.
