# KRYO Canonical Metric Dictionary

**This is the single source of truth for metric definitions.**
Superseded: `marketing/analytics/metric-definitions.md` and `.claude/meta/metric-dictionary.md`
(both retained for Meta-platform field mapping only — neither may define funnel rates).

No skill, command, report or query may silently redefine any metric below.
Changing a definition requires editing this file and noting the change in
`marketing/data-contracts/known-limitations.md`.

---

## 0. Session eligibility (applies to every metric below)

A row in `attribution_touches` counts toward an **eligible session** only when **all** hold:

| Filter | Rule | Why |
|---|---|---|
| Internal | `is_internal = false` | Excludes tagged QA |
| Bot | `coalesce(traffic_class,'x') <> 'bot'` | Excludes crawler traffic |
| Host | `event_metadata->>'page_url' ILIKE '%everestlabs.co%'` | **Mandatory.** Excludes Shopify theme-editor preview traffic on `*.myshopify.com`, which `is_internal` does **not** catch |

> **The host filter is not optional.** Theme-preview sessions
> (`?source=visualPreviewInitialLoad`, `?oseid=…` on `everestcoldwater.myshopify.com`)
> fire hundreds of duplicate cart events per session. Over the 60 days to 2026-07-31 they
> were 57 sessions but supplied **8 of 34** total add-to-cart sessions — a 24% overstatement
> of add-to-cart, and a far larger distortion of any event-level count.

**Grain: all funnel metrics are computed at `count(distinct session_id)`.**
Event-level counts are prohibited as funnel numerators — `add_to_cart` fires up to
~16× per session on affected templates. Event counts may be used only for debugging.

---

## 1. Stage definitions

| Term | Definition | Source event(s) |
|---|---|---|
| Eligible session | Any `session_id` passing §0 | `attribution_touches` |
| Eligible product-page session | Eligible session with `event_type='product_view'` | `product_view` |
| New visitor | First `anonymous_id` occurrence in window | `anonymous_id` |
| Returning visitor | `anonymous_id` seen in a prior session | `anonymous_id` |
| Engaged session | Eligible session reaching `scroll_depth_50` | `scroll_depth_50` |
| Deep-engaged session | Eligible session reaching `scroll_depth_90` | `scroll_depth_90` |
| CTA click | Eligible session firing `hero_cta_click` or `sticky_cta_click` | — |
| Cart request | Eligible session firing `cart_add_request` | — |
| Add to cart | Eligible session firing `add_to_cart` | — |
| WhatsApp click | Eligible session firing `whatsapp_click` | — |
| Qualified WhatsApp lead | **NOT MEASURABLE — see §4** | — |
| Checkout start | Eligible session firing `checkout_start` or `cart_checkout_click` | — |
| Purchase | **NOT MEASURABLE from first-party — see §4** | — |

`pricing-section view` and `model interaction` from the brief have **no corresponding
event** in the current taxonomy. They are listed in §4 as unmeasurable, not silently
mapped onto a near-neighbour event.

---

## 2. Canonical rates

Denominator is stated explicitly in every case. Never substitute.

```
product_page_add_to_cart_rate
  = distinct eligible sessions with add_to_cart
  / distinct eligible product-page sessions

cta_to_cart_request_rate                      [KRYO-specific, diagnostic]
  = distinct eligible sessions with cart_add_request
  / distinct eligible sessions with a CTA click

cart_to_checkout_rate
  = distinct eligible sessions with checkout start
  / distinct eligible sessions with add_to_cart

checkout_completion_rate
  = distinct completed checkouts / distinct checkout starts     [Shopify source]

checkout_abandonment_rate
  = 1 - checkout_completion_rate

engaged_session_rate
  = distinct sessions with scroll_depth_50
  / distinct eligible product-page sessions
```

**`cta_to_cart_request_rate` is the diagnostic metric this system was missing.**
It isolates "user asked to buy" from "cart accepted the request", which is where the
current failure sits. Report it on every funnel readout, split by device.

### Metrics defined but currently uncomputable

```
qualified_whatsapp_rate
  = distinct eligible sessions producing a qualified WhatsApp lead
  / distinct eligible product-page sessions
        -> BLOCKED: kryo_leads has 0 rows

total_qualified_intent_rate
  = distinct eligible sessions with (add_to_cart OR qualified WhatsApp lead)
  / distinct eligible product-page sessions
        -> BLOCKED: degrades to add_to_cart rate; do NOT publish under this name

purchase_conversion_rate = purchases / eligible sessions
revenue_per_visitor      = revenue / eligible sessions
days_to_conversion       = purchase_ts - first_touch_ts
        -> BLOCKED: shopify_orders has 0 rows
```

**Do not combine `whatsapp_click` with qualified leads.** A click is not a lead.
Report `whatsapp_click` under its own name only.

---

## 3. Verified reference values — 60 days to 2026-07-31

Computed under §0 rules. Use as the baseline any experiment is measured against.

| Segment | PDP sessions | Engaged (s50) | CTA clicks | Cart requests | Add to cart | ATC rate |
|---|---:|---:|---:|---:|---:|---:|
| Mobile — paid_meta | 674 | 248 (37%) | 30 | 1 | 1 | **0.15%** |
| Mobile — direct | 75 | 45 (60%) | 0 | 1 | 1 | 1.33% |
| Mobile — referral | 45 | 46 | 1 | 1 | 1 | 2.22% |
| Desktop — direct | 164 | 73 (45%) | 22 | 18 | 20 | **12.20%** |
| Desktop — referral | 12 | 9 | 1 | 3 | 3 | 25.00% |

Same-template comparison (rules out page/audience confounds):

| Page | Device | Sessions | CTA | Cart req | ATC | ATC rate |
|---|---|---:|---:|---:|---:|---:|
| `/products/kryo2` | desktop | 77 | 9 | 5 | 8 | **10.4%** |
| `/products/kryo2` | mobile | 545 | 15 | 1 | 1 | **0.18%** |
| `/products/kryo2_` | desktop | 81 | 10 | 4 | 4 | **4.9%** |
| `/products/kryo2_` | mobile | 213 | 16 | 1 | 1 | **0.47%** |

`cta_to_cart_request_rate`, paid-Meta-mobile vs direct-desktop: **desktop 82% (18/22) vs mobile 3% (1/30)**.

Device totals (all sources, verified via `marketing_session_journeys` logic, 60 d to 2026-07-31):

| Device | PDP sessions | Engaged | CTA clicks | Cart requests | Add to cart | ATC rate | cta→cart |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mobile | 833 | 358 | 31 | 3 | 3 | **0.36%** | **9.7%** |
| Desktop | 190 | 91 | 24 | 21 | 23 | **12.11%** | **87.5%** |
| Tablet | 12 | 4 | 0 | 0 | 0 | 0.00% | n/a |

Quote the device-total row for headline figures and the segment row when attributing cause.
Both are correct at their own grain; do not mix them in one comparison.

---

## 4. Explicitly unmeasurable today

Stating these as UNKNOWN is mandatory. Do not proxy them.

| Concept | Blocker |
|---|---|
| Qualified WhatsApp lead | `kryo_leads` = 0 rows |
| WhatsApp conversation started | `kryo_whatsapp_conversations` = 0 rows |
| Purchase / revenue / RPV | `shopify_orders` = 0 rows |
| Days to conversion | no purchase timestamps |
| Pricing-section view | no such event in taxonomy |
| Model interaction | no such event in taxonomy |
| Deposit initiated/completed | `kryo_deposit_events` unpopulated |
| New vs returning (reliable) | `anonymous_id` persistence unverified across sessions |

---

## 5. Reporting rules

1. Every figure states: source table, date window, session grain, and eligibility filter.
2. Every funnel readout is **split by device**. A blended mobile+desktop rate is
   misleading given the 35× gap and is not permitted as a headline number.
3. Classify every statement as FACT / PATTERN / HYPOTHESIS / UNKNOWN / RECOMMENDATION
   per `.claude/rules/evidence-standards.md`.
4. Sample sizes below 30 sessions in a cell are directional only — label them.
5. Meta-reported conversions and first-party conversions may disagree; present both,
   never reconcile by picking the flattering one.
