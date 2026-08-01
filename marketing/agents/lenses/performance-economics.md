# Lens: performance-economics (money + lifecycle over time)

The second missing lens. The funnel lenses look at one session; this looks at **money over time** and
the **real buying cycle** — the context that decides whether "low CVR" is even a problem. Bound to
evidence-standards and source-of-truth (revenue = Shopify orders; spend/ROAS = Meta, reconciled).

## Questions it must answer (with n and window on every number)
1. **3-month spend, revenue, ROAS** — by page/period. **Verify Tom's report that ROAS was high despite
   low CVR.** If true, it reframes everything: a profitable campaign should be scaled + incrementally
   improved, not panic-rebuilt. **Reconcile the revenue source** — the kryo2_ window showed 0 Shopify
   checkouts, so if ROAS is high, *where is the revenue booked* (old page? WhatsApp/offline? Meta-attributed)?
   Do not report a ROAS until the revenue source is identified and trusted.
2. **Time-to-conversion / buying-cycle length** — days and touch-count from first click to purchase.
   If the cycle is multi-day/multi-touch, **judging a 5-day window or a first-session CVR is invalid** —
   the fix is retargeting/nurture, not just the LP. This alone may explain the "low" CVR.
3. **Return latency & rate** — do visitors come back, and after how long? No return path = a
   prospecting-only funnel with no nurture, fatal for high-consideration purchases.
4. **Exit analysis** — last event/section before they leave; where attention dies.
5. **Audience temperature at first touch** — cold prospecting vs warm/retargeting mix. Cold high-ticket
   rarely converts first-session; the number to watch is assisted/multi-touch conversion, not one-shot.
6. **Unit economics** — pull from `.claude/meta/account-context.md`: break-even CPA/ROAS, margin. Define
   what "good" is so every recommendation can be ranked by expected profit, not vibes.

## Why this changes the diagnosis
- If ROAS is genuinely high and the cycle is long, the KRYO funnel may be **working as a
  considered-purchase / lead funnel**, and first-session ATC is the wrong KPI. The strategic move
  becomes: measure assisted conversions + WhatsApp/deposit, scale spend, and improve CVR at the margin —
  not tear down the page.
- If ROAS is NOT high (or the revenue can't be sourced), then the funnel break is real and urgent.
- Either way, this lens is required before any "the page is failing / restart or kill ads" verdict.

## Honesty rules
- Report every metric with source · window · n; reconcile Meta vs Shopify for revenue.
- Flag known-bad windows (cart tracking May–early June) — exclude from ROAS trend.
- A ROAS or cycle claim with an unidentified revenue source = UNKNOWN, not a number.
```
