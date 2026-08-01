# KRYO — economic thresholds

> ## ⛔ PROVISIONAL — NOT USABLE FOR ANY SPEND DECISION
> Blocked on two prerequisites (operating law 6):
> 1. **AOV is UNKNOWN.** `shopify_orders` is empty; `kryo_funnel_daily` has 1 row. True AOV and
>    order count must come from **Shopify admin**, not this repo.
> 2. **Tracking is RED.** `facebook.com/tr` aborts, so Meta does not reliably receive AddToCart.
>    Cost-per-ATC cannot be trusted as an indicator until P1 is green.
>
> Until both clear, this file states what Tom confirmed and nothing derived from it.

## CONFIRMED by Tom, 2026-07-31
| Input | Value | Status |
|---|---|---|
| Target CPA | **< A$100** | ✅ CONFIRMED |
| Break-even CPA | **A$400** | ✅ CONFIRMED ("we really don't want this") |
| Minimum acceptable ROAS | **5.0x** | ✅ CONFIRMED — floor, not a target |
| Account currency | **AUD** | ✅ CONFIRMED live 2026-07-28 |

## UNKNOWN — required before any threshold is computable
| Input | Status | How to confirm |
|---|---|---|
| **AOV** | ❓ UNKNOWN | Shopify admin → orders → average order value, all-time |
| **Order count (lifetime)** | ❓ UNKNOWN | Shopify admin. Tom says 5; the DB cannot corroborate |
| **COGS / gross margin** | ❓ UNKNOWN | Tom. **Not derivable from break-even CPA without AOV** |

### Correction — what I got wrong on 2026-07-31
I asserted **AOV = A$2,000**, and from it derived **contribution A$400/order, 20% margin,
COGS ≈ A$1,600**, plus a full green/amber/red band table and a revised ramp plan.

**Tom never stated an AOV.** I divided a rough verbal "~$10k in sales" by an unconfirmed order
count, in an unconfirmed currency, and wrote the result into config as if it were established.
Every figure downstream of it — the margin, the COGS, the cost-per-ATC bands, the profit tables,
the "2.25x headroom" — was unfounded. All of it is withdrawn.

## Observed operating figures — directional only
Live-delivery days only (28 dark days excluded). **n=3 orders. Do not quote to cent precision.**

| Figure | Value | n | Provenance |
|---|---|---|---|
| Spend | A$533 | 33 live days | `meta_ad_metrics_daily` |
| Landing page views | 679 | 33 live days | `meta_ad_metrics_daily` |
| Add-to-carts | 47 | 33 live days | `meta_ad_metrics_daily` (Meta-attributed) |
| Orders | 3 | 33 live days | `shopify_funnel_daily`, upsell-inflated — **suspect** |
| Cost per LPV | ≈ A$0.78 | n=679 | adequate n; the one figure here worth trusting |
| Cost per ATC | ≈ A$11 | n=47 | directional; **and ATC tracking is red** |
| CPA | ≈ A$180 | **n=3** | **directional only — no verdict at n=3** |

Cost per LPV (≈A$0.78) is the only indicator with adequate n. Everything resting on orders is n=3
and supports no rate, no verdict, and no threshold.

## What becomes computable once AOV is confirmed
- contribution per order = AOV − COGS
- target cost-per-ATC = target CPA ÷ ATC-per-order  *(ATC-per-order is currently 47/3, n=3 — needs volume)*
- green/amber/red bands, staging rule, daily loss cap

**Do not populate these by inference. Ask Tom, or read Shopify admin.**
