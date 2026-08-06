# KRYO WhatsApp Assisted-Sales CTA — Codex Implementation Task

**Task ID:** `KRYO-WHATSAPP-ASSISTED-SALES-CTA-20260806`

**Status:** ready for Codex scoping / implementation after tracking feasibility check.

**Proposal ID:** `8af543fb-fd57-4174-a40f-510c4e55aae4`

**Research spec:** `docs/kryo-growth/research/KRYO_WHATSAPP_ASSISTED_SALES_EXPERIMENT_2026_08.md`

**Validation protocol:** `docs/kryo-growth/operations/KRYO_EXPERIMENT_VALIDATION_RESEARCH_PROTOCOL.md`

## Objective

Add one subordinate WhatsApp assisted-sales CTA below the Complete System / What's Included section on `/products/kryo2`, near the final purchase area.

This is a small timestamped live patch, not a redesign and not a global chat replacement.

## Purpose

Capture qualified WhatsApp leads from high-intent visitors who need reassurance before ordering.

Primary metric:

```text
qualified_whatsapp_leads_per_100_pdp_sessions
```

Secondary metrics:

```text
whatsapp_click_rate
conversation_started_rate
lead_to_atc_rate
lead_to_purchase_rate_14d
assisted_revenue_per_pdp_session
pdp_atc_rate
checkout_start_rate
cost_per_whatsapp_lead
```

Guardrails:

```text
direct_atc_rate
same_session_checkout_start_rate
page_load_speed
low_quality_whatsapp_clicks
support_response_time
scarcity_message_compliance
```

## Required placement

Place the CTA:

```text
Below the Complete System / What's Included section and before/near the final buy area.
```

Do not place it:

```text
beside the hero Add to Cart
inside the sticky CTA
as an exit intent popup
as a global Chatway replacement
```

## Copy

Heading:

```text
Questions before ordering?
```

Body:

```text
Message a KRYO expert on WhatsApp. Check fit, delivery and August allocation before the next dispatch.
```

Button:

```text
Message KRYO on WhatsApp
```

Prefilled WhatsApp message:

```text
Hi, I'm interested in KRYO from the website. I want to check fit and availability before the next Dubai dispatch.
```

## Tracking requirement

Add click tracking before deployment.

Event name:

```text
whatsapp_cta_click
```

Required event properties:

```text
location: complete_system_bottom
page_path: /products/kryo2
product_handle: kryo2
experiment_key: whatsapp_assisted_sales_complete_system_bottom_2026_08
proposal_id: 8af543fb-fd57-4174-a40f-510c4e55aae4
timestamp
session_id / anonymous_id if available
UTM/source fields if available
```

Stop if tracking cannot be added without disturbing existing Add to Cart tracking.

## Design constraints

- Keep KRYO premium dark/neutral style.
- CTA must be visually secondary to Add to Cart.
- Do not add gradients, cyan styling, fake urgency, new product claims or medical claims.
- Do not materially slow the product page.
- Do not change hero copy, pricing, scarcity, testimonials, product media, Downpay, cart, checkout, Chatway, product form or Add to Cart behaviour.

## Read-before checks

1. Confirm live product/template being edited is `/products/kryo2`.
2. Confirm current page contains the testimonial carousel and Complete System / What's Included section.
3. Confirm where the final buy area begins.
4. Confirm current tracking helpers/events before adding the new event.
5. Confirm existing ATC tracking is untouched.

## Write

Implement only:

1. the single lower-page WhatsApp CTA; and
2. its click tracking event.

## Read-after checks

1. CTA appears only in intended lower-page location.
2. Button opens WhatsApp with the prefilled message.
3. `whatsapp_cta_click` fires with the required properties.
4. Hero/sticky/ATC/cart/checkout/Chatway behaviour is unchanged.
5. Page loads correctly on mobile.

## Change log requirement

After deployment, insert one row into `public.marketing_change_log`:

```text
surface: shopify_page
object_type: product_page
object_name: KRYO 2 live traffic page
market: AE
product_handle: kryo2
change_type: whatsapp_assisted_sales_cta_added
proposal_id / experiment reference: 8af543fb-fd57-4174-a40f-510c4e55aae4
note: Added subordinate WhatsApp assisted-sales CTA below Complete System / What's Included section. Measure qualified WhatsApp leads per 100 PDP sessions, assisted revenue, PDP ATC rate, checkout-start rate and direct ATC cannibalisation.
```

Use the exact deployment timestamp.

## Stop conditions

Stop and report instead of deploying if:

- the target section cannot be identified safely;
- click tracking cannot be added safely;
- live product/template differs from expected;
- implementation requires replacing Chatway globally;
- implementation would alter Add to Cart, cart, checkout, pricing, product form, scarcity, testimonials or product media.

## Prompt to paste into a new Codex chat

```text
Use this task file as the full implementation source of truth:
marketing/experiments/KRYO-WHATSAPP-ASSISTED-SALES-CTA-20260806.md

Implement the KRYO WhatsApp assisted-sales CTA exactly as specified.

Do not research strategy. Do not redesign the page. Do not change Shopify purchase architecture. Do not touch hero/sticky ATC, pricing, product form, cart, checkout, Chatway, testimonial carousel, product media or Downpay.

First perform the read-before checks. If any stop condition is triggered, stop and report. If checks pass, add the single lower-page WhatsApp CTA and the `whatsapp_cta_click` tracking event. Then perform all read-after checks and insert the marketing_change_log timestamp row.
```
