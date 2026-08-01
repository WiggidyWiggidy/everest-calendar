---
depends-on: [site.buy_control_position, site.live_pdp]
---

# Canonical Funnel Definition — pointer

Defined once in [../../marketing/data-contracts/metric-definitions.md](../../marketing/data-contracts/metric-definitions.md).

Stages: eligible session -> product page -> engaged (s50) -> deep engaged (s90) ->
CTA click -> cart request -> add to cart -> [checkout start] -> [purchase].
Bracketed stages are not reliably measurable today.

Eligibility (§0): `is_internal=false`, `traffic_class<>'bot'`,
**`page_url ILIKE '%everestlabs.co%'`**. Grain: distinct `session_id`.

The diagnostic metric this system was missing is **`cta_to_cart_request_rate`** —
it separates "user asked to buy" from "cart accepted the request", which is where the
current failure sits.
