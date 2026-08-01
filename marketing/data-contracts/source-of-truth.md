# KRYO B2C — Source-of-Truth Data Contract

**This file is binding. No number may be used in a claim unless it comes from the source named
here, inside its valid window, with the stated exclusions applied. If a needed source is
outside its window or marked KNOWN-BAD, the analysis STOPS or the number is labelled UNVALIDATED.**

Reason this exists: on 2026-07-31 the agent produced multiple confident, wrong conclusions by
(a) using first-party pixel counts for paid add-to-cart, (b) trusting a period whose cart
tracking was broken, and (c) inferring a launch date instead of confirming it. Each rule below
maps to one of those failures.

## Canonical source per metric
| Metric | CANONICAL source | Do NOT use | Notes / known-bad |
|---|---|---|---|
| Paid add-to-cart (verdict) | `meta_ad_metrics_daily.add_to_carts` (per ad/day) | `attribution_touches` (first-party undercounts, esp. mobile & custom themes) | **KNOWN-BAD: cart tracking suspect May–early June 2026 (Tom). Treat that window as UNVALIDATED until [confirmed-facts].** |
| Cost per add-to-cart | `sum(spend)/sum(add_to_carts)` from `meta_ad_metrics_daily`, per ad-set mapped to the live page | any first-party-derived CPATC | currency = account currency (AUD) unless confirmed |
| On-site ATC behaviour (directional only) | `attribution_touches` event_type `add_to_cart` / `cart_add_request` | absolute or cross-page counts, any paid verdict | undercounts; use only for within-page/session behaviour, never as a total |
| Checkout started | Meta `landing_page_views`→IC path + `attribution_touches` `checkout_start`; reconcile | single source alone | reconcile before use |
| Purchases / revenue | Shopify orders (authoritative) + Meta `purchases` | first-party only | **`shopify_orders` currently 0 rows — FLAG as not wired; do not claim purchases from it** |
| Landing-page views / sessions | Reconcile Meta `landing_page_views` vs first-party sessions | either alone | they diverge (mobile pixel blocking); the gap is itself a finding |
| WhatsApp click | `attribution_touches` `whatsapp_click`/`chatway_click` | as a lead count | **under-fires on new page (1 tracked vs 4 real). Directional only.** |
| WhatsApp lead / message sent | **NONE — not instrumented** | any number | `kryo_leads` = 0 rows; conversations off-site. Any WhatsApp-lead claim = **UNKNOWN** until instrumented |
| Ad → landing-page mapping | `attribution_touches.meta_ad_id` joined to `meta_ad_metrics_daily`; or ad destination URL | assuming by date alone | confirm which page each ad pointed to per period |

## Internal / test traffic — MUST exclude before any funnel claim
The `is_internal` flag is **incomplete** (only 1 of 9 known test sessions was flagged). Exclude a
session if ANY of:
- `is_internal = true`
- `anonymous_id` starts with `elv_1779869995748` or `elv_1779806210806` (known team fingerprints)
- referrer host contains `myshopify.com` or `admin.shopify.com`
- non-target-geo desktop with an anonymous_id having an implausible session count (>15)

Maintain this list in [confirmed-facts.md]. Re-derive test fingerprints periodically
(any anonymous_id with an outlier session count is a candidate — confirm with Tom, don't assume).

## Cross-source reconciliation rule
When two sources that should agree differ by more than ~20%, **the discrepancy is the finding.**
Investigate and explain the gap BEFORE stating any conclusion that depends on either number.
(2026-07-31 failure: first-party said ~0 old-page ATC, Meta said 10–40/week; the agent should
have stopped and reconciled, not picked one and run.)

## Known-bad periods register (update as discovered)
- **May–early June 2026:** cart tracking suspected wrong (Tom, 2026-07-31). Any ATC number from
  this window is UNVALIDATED pending confirmation of exact dates + failure mode.
- Pre-first-party-pixel-deploy: `attribution_touches` is blind to ATC. Confirm deploy date.

## Enforcement
Any diagnosis must cite, per number: source table, date window, denominator, sample size,
exclusions applied. Numbers without this are not admissible. See [../../.claude/rules/evidence-standards.md].
