---
depends-on: [site.buy_control_position, site.live_pdp, delivery.cost_per_lpv, site.tracking_capi]
---

# KRYO-EXP-20260731-01 — Sticky bar becomes a real add-to-cart

**Status: PREPARED, NOT LAUNCHED.** Requires Tom to approve publish.
**Blocked by prerequisite:** see §Prerequisite stamp.

## 1. Hypothesis
If the sticky bar adds the default variant to cart directly instead of scroll-linking to a model
selector, then **mobile `cta_to_cart_request_rate` improves**, because the current bar promises a
buy action and delivers a scroll — landing the user at the selector with the Add-to-cart button
still 153px below the fold. Every added step is a drop-off point, and the final step is invisible.

## 2. Primary metric — and why it is the highest-value lever now
**`cta_to_cart_request_rate`, mobile only.**

It is the only funnel metric that (a) isolates the defect being changed, and (b) can reach
significance inside a decision horizon. See §5 — add-to-cart rate needs 76 days and purchase rate
needs 327. **Choosing purchase here would guarantee an inconclusive test.**

## 3. Guardrail metrics — must not worsen
- Desktop add-to-cart rate (the bar renders on desktop too)
- Engaged-session rate / scroll depth — a persistent bar eats ~60–70px of an 844px viewport
- WhatsApp lead count — the page's only other converting path
- Page LCP

## 4. Baseline + MDE
| | Value |
|---|---|
| Baseline (mobile `cta_to_cart_request_rate`) | 9.7% |
| MDE | **+50% relative** (9.7% → 14.6%) |
| Power / significance | 80% / 95% two-sided |

MDE is set at +50% because a smaller effect is not worth a publish cycle at this traffic.

## 5. Sample and time-to-significance — computed, not assumed
**710 sessions per arm · 1,420 total**

| Spend | LPV/day | Time to significance |
|---|---:|---:|
| A$85/day | 108 | **13 days** |
| A$130/day | 166 | 9 days |
| A$200/day | 255 | 6 days |

Rejected primary metrics, with the honest reason:
| Metric | n/arm | Time at A$85/day | Verdict |
|---|---:|---:|---|
| add-to-cart rate | 4,116 | 76 days | too slow |
| purchase rate | 17,720 | **327 days** | impossible — do not attempt |

## 6. Decision rule — pre-registered
- **Ship** if mobile `cta_to_cart_request_rate` ≥ 14.6% at n≥710/arm **and** no guardrail breached.
- **Kill** if desktop add-to-cart falls >20% relative, or WhatsApp leads fall to zero, at any point.
- **Iterate** if the effect is positive but <+50% at full sample.
- **Inconclusive** is a permitted outcome and must be reported as such.
- **No calling it early.** Do not read the result before n=710/arm.

## 7. Rollback
`theme-assets/layout/theme.liquid.pre-*-backup` restores the prior state via
`scripts/shopify-direct-asset.mjs put --allow-live`. Loss cap during the test: the spend at the
running daily rate; the change is reversible within minutes.

## 8. QC checklist before launch (page-builder → live-ux-tester)
- [ ] Variant renders on mobile and desktop
- [ ] Sticky bar adds a real cart line — `/cart.js` `item_count` increments
- [ ] Default variant correct; "Other models" link still reaches the selector
- [ ] Price and currency correct for a UAE visitor (**AED** — currently unverified from this location)
- [ ] Dispatch date and allocation count match `CURRENT-STATE.md`
- [ ] WhatsApp CTAs unchanged (not part of this test — do not confound)
- [ ] `sticky_atc_click` fires and lands in `attribution_touches`
- [ ] No new console errors
- [ ] Variant assignment persists across return visits

## 9. Prerequisite stamp
⚠️ **`facebook.com/tr` aborts and CAPI is not deployed.** First-party `cta_to_cart_request_rate` is
measurable without it, so this test *can* run — but Meta will not see the improved ATC volume, so
**no scaling or budget conclusion may be drawn from this experiment** until tracking is green.
