---
depends-on: [delivery.winner_ad, delivery.cost_per_lpv, delivery.uptime, money.cpa, site.tracking_capi]
---

# KRYO-EXP-20260731-02 — Restart the winner ad on ATC objective

**Status: PREPARED, NOT LAUNCHED.** Requires Tom: go-live + budget. `campaign-operator` builds PAUSED.

## 0. This is not an A/B test — say so plainly
It is a **restore and monitor**. There is no control arm: the winner is simply off, and the ad
currently running converts far worse. Framing it as an experiment would imply a comparison that
does not exist. Pre-registering the monitoring thresholds is what makes it disciplined.

## 1. Hypothesis
Restarting `Winner | Plunge is Dead` (`120249120433950279`) on an **AddToCart** objective restores
the previously observed ATC rate, because it is the only ad with a purchase history and it was
switched off on 2026-07-15 for reasons unrelated to performance.

## 2. Primary metric
**Cost per add-to-cart.** Chosen because ATC accumulates fast enough to be readable in days, while
purchases at this volume are not. Purchase count is a **guardrail**, not the primary.

## 3. Guardrail metrics
- CPA per KRYO unit — must not exceed break-even (`CURRENT-STATE.md`)
- MER ≥ the confirmed floor
- Click→LPV ≥ 40% (junk-placement detector; February bought 1,700 clicks of which 92.5% never landed)
- Cost per LPV — alarm above the current baseline ×2

## 4. Structure
Scaling campaign (majority of budget) + Testing campaign. **Exclude Audience Network.**
One ad set. **Freeze edits between gates** — every change re-enters learning.

## 5. Time to first readable signal — computed
Winner ATC rate: 10.0% of LPV. Learning phase needs ~50 conversions/week.

| Spend | LPV/day | ATC/day | ATC/week | 50 ATC reached in |
|---|---:|---:|---:|---:|
| **A$85/day** | 108 | 10.8 | 76 | **4.6 days** |
| A$130/day | 166 | 16.6 | 116 | 3.0 days |

A$85/day clears the ATC learning threshold — the first spend level at which Meta's optimiser can
work on a real conversion event rather than cheap pageviews.

**Purchase-level confidence is a different timescale:** at ~1 order/month, judge on 4-week blocks.
A zero-order week has ~14% probability at 2 orders/week and means nothing.

## 6. Decision rule — pre-registered
- **Continue / step up** if cost-per-ATC holds within its green band for 4 days **and** click→LPV ≥ 40%.
- **Hold** if cost-per-ATC enters amber and does not recover within 4 days.
- **Kill** if CPA exceeds break-even on ≥8 orders of evidence, or MER < floor.
- **Never act on a single week, or on fewer than 5 orders.** At ~1 order/month a quiet week is noise.
- **Ignore the first 10–14 days after any budget step** — that is exploration, not signal.

## 7. Rollback
Pause the ad set. Immediate, no residual cost beyond spend already incurred.

## 8. QC before go-live (campaign-operator)
- [ ] Token carries `ads_management`
- [ ] Objective = **AddToCart**, not Purchase (volume cannot exit learning on Purchase)
- [ ] Audience Network excluded
- [ ] Destination URL resolves — `/products/kryo2` is **404**; must point at the live PDP
- [ ] Naming convention applied
- [ ] Built **PAUSED**; go-live packet includes budget, kill rule, daily loss cap
- [ ] Objects logged to the change log

## 9. Prerequisite stamp
⚠️ **Blocking for the objective.** ATC optimisation requires Meta to reliably receive AddToCart.
`facebook.com/tr` aborts and CAPI is not deployed (`META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` unset).
**Running an ATC-optimised campaign while Meta cannot see ATC wastes the entire benefit.**
Either deploy CAPI first, or launch on a lower-funnel objective and accept it is not optimised.
