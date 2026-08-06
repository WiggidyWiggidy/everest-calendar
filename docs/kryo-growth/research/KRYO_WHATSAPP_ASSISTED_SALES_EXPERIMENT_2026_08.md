# KRYO WhatsApp Assisted-Sales Experiment — Research and Implementation Spec

**Status:** research-backed proposal, recommended as next small timestamped live patch after tracking is confirmed.

**Created:** 2026-08-06

**Proposal ID:** `8af543fb-fd57-4174-a40f-510c4e55aae4`

**Related protocol:** `docs/kryo-growth/operations/KRYO_EXPERIMENT_VALIDATION_RESEARCH_PROTOCOL.md`

**Target page:** `/products/kryo2`

## 1. Executive verdict

Adding a contextual WhatsApp CTA below the Complete System / What's Included section is a high-leverage KRYO experiment because it can turn anonymous high-intent visitors into named assisted-sales conversations.

This is not mainly a same-session add-to-cart optimisation. It is a trust, reassurance, lead-capture and follow-up mechanism for a high-ticket, unfamiliar physical product in a WhatsApp-native market.

Recommended first move:

```text
Add one subordinate WhatsApp CTA below the Complete System / What's Included area, near the final purchase decision.
```

Do not do these first:

```text
Do not replace Chatway globally yet.
Do not put WhatsApp beside the hero Add to Cart.
Do not launch exit intent first.
Do not make WhatsApp visually equal to the primary purchase CTA.
```

## 2. Tom proposal

Tom's hypothesis:

- Dubai customers are WhatsApp-native.
- A WhatsApp CTA can act as a trust signal because it shows there is a real person available.
- KRYO conversations are valuable because many buyers do not buy on the first visit.
- Approximately half of buyers appear to use chat before buying, based on founder observation.
- WhatsApp allows follow-up before the August 15 dispatch/stock deadline.
- A named WhatsApp lead is more valuable than an anonymous visitor or anonymous add-to-cart.
- The CTA should possibly sit below What's Included / Complete System, and later could inform a global WhatsApp replacement or exit-intent popup.

## 3. Research assessment

Research supports the direction but not an aggressive implementation.

The strongest interpretation is:

```text
WhatsApp should be tested as an assisted-sales capture layer, not a main CTA replacement.
```

The correct first test is a contextual, user-initiated WhatsApp CTA placed after the visitor has understood the product and seen what is included.

The main risk is direct conversion cannibalisation: some high-intent buyers who would have added to cart may ask questions instead. This is acceptable only if assisted lead quality and assisted revenue compensate.

## 4. KRYO live context

Current KRYO context at the time of this research:

- KRYO is a new category and premium product.
- Live product page is `/products/kryo2`.
- Current page changes already timestamped on 2026-08-06:
  - 13:46 UTC+8: truthful allocation/dispatch scarcity + what-is-in-the-box/product media update.
  - 14:26 UTC+8: testimonial carousel added after `What makes KRYO different?`.
- Shopify-only readout had current `/products/kryo2` movement of 30 sessions, 2 add-to-cart sessions, and 1 checkout-reached session on the partial 2026-08-06 day.
- Today is partial and the page had multiple timestamped changes, so the WhatsApp CTA should not be deployed without a new timestamp and tracking.

The current bottleneck appears to be fear/uncertainty around purchase rather than zero interest.

## 5. Customer psychology

The relevant visitor is not simply asking:

```text
Is this product interesting?
```

They are more likely asking:

```text
Is this real?
Will this work in my bathroom?
What exactly arrives?
Is it worth AED 3,990?
Will I actually use it?
What happens if I do not like it?
Is someone actually behind this product?
Should I buy now or wait?
```

WhatsApp addresses the `Safety` stage of the KRYO page journey:

```text
Curiosity
↓
Understanding
↓
Belief
↓
Safety
↓
Action
```

The causal mechanism:

```text
High-ticket purchase uncertainty
↓
Visible human WhatsApp support at the right point in the page
↓
Visitor asks before leaving
↓
Founder/team answers fit, delivery, stock and trial concerns
↓
Follow-up becomes possible before dispatch deadline
↓
Assisted purchase rate improves
```

## 6. External evidence

### WhatsApp and business messaging

WhatsApp Business / Kantar's State of Business Messaging report surveyed 11,056 consumers across 22 markets including the UAE. It reports that 73.3% of consumers prefer messaging when communicating with a business, 72.4% are more likely to buy from brands that offer messaging, and 75.1% want to message businesses the way they message friends and family.

Source:
https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/

This is vendor-published research, so it supports direction but should not be treated as guaranteed KRYO uplift.

### UAE mobile commerce fit

The UAE is highly mobile-first. WAM/Visa reported in July 2025 that 67% of UAE consumers used their phones as part of their latest retail purchase, and that the UAE had the highest rate of online shopping with mobile devices among the surveyed markets.

Source:
https://www.wam.ae/en/article/bkhbk0o-uae-leads-world-mobile-shopping-visa

This supports a mobile messaging CTA more than a desktop-style webchat-only approach.

### Live chat and assisted sales theory

A Production and Operations Management study argues that live chat can increase online sales conversion by informing and persuading, making it relevant for products where buyers need reassurance or explanation.

Source:
https://onlinelibrary.wiley.com/doi/10.1111/poms.13320

KRYO maps well because it is unfamiliar, high-ticket, and mechanism-driven.

### UX risk warning

Baymard's live-chat usability research warns that overlays, popups and sticky chat elements can disrupt users, especially on mobile, and recommends avoiding intrusive site-initiated chat. It supports making chat accessible to users who need it without obstructing users who are already moving through the purchase journey.

Source:
https://baymard.com/blog/live-chat-usability-issues

This is why the first test should be a contextual CTA, not a global WhatsApp replacement or exit-intent popup.

### Category-leader pattern

Eight Sleep sells an unfamiliar premium temperature-control product using proof, mechanism explanation, setup/install clarity, reviews, trial, warranty, financing and support. This shows that premium category-creating products require layered reassurance, not only a direct Add to Cart path.

Source:
https://www.eightsleep.com/product/pod-cover/

KRYO currently lacks Eight Sleep's review volume and brand maturity, so a human-assisted channel may help bridge the trust gap while proof assets mature.

## 7. Funnel metrics

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

The core readout question:

```text
Did WhatsApp create more total buying intent and assisted revenue than it cannibalised from direct checkout?
```

## 8. Expected metric movement

Expected positive movement:

- WhatsApp click rate increases from current baseline / zero if no tracked CTA exists.
- Qualified WhatsApp leads per 100 PDP sessions increases.
- Assisted purchase rate over 7-14 days should become measurable.
- Assisted revenue per PDP session may increase.

Possible neutral/mixed movement:

- Same-session ATC may be flat or slightly down if visitors choose to ask first.
- Same-session conversion may not immediately improve because the value is delayed follow-up.

Failure signal:

- WhatsApp clicks occur, but conversations are low quality.
- Direct ATC rate drops materially.
- Checkout starts drop.
- No assisted purchases appear within 14 days.

## 9. Success and failure criteria

Success if either condition is met:

```text
qualified WhatsApp leads >= 2-5 per 100 PDP sessions
AND direct ATC rate does not fall materially
```

or:

```text
assisted revenue over 14 days offsets any direct ATC cannibalisation
```

Failure if:

```text
WhatsApp click volume rises
AND direct ATC / checkout-start rates fall materially
AND conversations are low quality
AND no assisted revenue appears within 14 days
```

Provisional direct ATC guardrail:

```text
Direct ATC rate should not fall more than 10-15% without compensating assisted revenue.
```

## 10. Recommended first implementation

Placement:

```text
Below the Complete System / What's Included section, close to the final buy area.
```

Visual hierarchy:

- secondary to Add to Cart
- not sticky
- not modal
- not equal weight to main purchase CTA
- should use WhatsApp icon/visual cue if it does not feel cheap
- should preserve premium KRYO style

Recommended copy:

```text
Questions before ordering?
Message a KRYO expert on WhatsApp.
Check fit, delivery and August allocation before the next dispatch.
```

Button:

```text
Message KRYO on WhatsApp
```

Alternative:

```text
Not sure if KRYO is right for your setup?
Message us on WhatsApp before the 15 August dispatch.
```

Prefilled WhatsApp message:

```text
Hi, I'm interested in KRYO from the website. I want to check fit and availability before the next Dubai dispatch.
```

## 11. What not to implement first

### Do not place beside hero ATC

Reason: this can tell ready buyers to ask questions instead of ordering.

### Do not replace Chatway globally yet

Reason: this changes the entire support architecture and creates harder attribution. Hold until the contextual CTA has signal or Chatway data proves poor conversion/trust.

### Do not use exit intent first

Reason: Baymard's chat/pop-up findings warn against intrusive site-initiated prompts. Exit intent should only be considered later, targeted to high-intent non-buyers.

Potential later exit-intent triggers:

```text
scrolled past 60%
viewed What's Included
spent 45+ seconds
return visitor
no ATC
exit intent detected
```

Potential later exit-intent copy:

```text
Still deciding?
Message KRYO on WhatsApp before the next Dubai dispatch.
We can help with fit, delivery and whether one of the remaining units is right for you.
```

## 12. Tracking requirement before launch

Minimum event:

```text
event_name: whatsapp_cta_click
location: complete_system_bottom
page_path: /products/kryo2
session_id
anonymous_id
utm_source
utm_campaign
timestamp
```

Preferred lead fields:

```text
conversation_started
lead_quality: qualified / unqualified
question_type: delivery / fit / price / installation / trial / other
follow_up_sent
purchase_assisted
assisted_revenue
```

If full automation is not ready, use a manual lead log for the first test. Do not skip the click event.

## 13. ICE score

Updated Supabase proposal score:

```text
Impact: 8
Confidence: 7
Ease: 8
ICE: 44.8
```

### Impact basis

High because it can create a recoverable lead asset from paid traffic and support delayed high-ticket sales.

### Confidence basis

Moderately high because evidence supports messaging preference, live-chat persuasion, mobile-first UAE commerce, and category-leader reassurance patterns. Confidence is not higher because KRYO-specific WhatsApp conversion data is not yet available and direct ATC cannibalisation is a real risk.

### Ease basis

High if implemented as a small contextual CTA with basic tracking. Lower if replacing chat architecture or building automated WhatsApp CRM immediately.

## 14. Codex-ready implementation prompt

```text
You are implementing a single KRYO Shopify product-page experiment. Do not change strategy or broaden scope.

Repo: WiggidyWiggidy/everest-calendar
Live product page: https://everestlabs.co/products/kryo2
Product handle: kryo2
Proposal ID: 8af543fb-fd57-4174-a40f-510c4e55aae4
Research spec: docs/kryo-growth/research/KRYO_WHATSAPP_ASSISTED_SALES_EXPERIMENT_2026_08.md
Protocol: docs/kryo-growth/operations/KRYO_EXPERIMENT_VALIDATION_RESEARCH_PROTOCOL.md

Objective:
Add one subordinate WhatsApp assisted-sales CTA below the Complete System / What's Included section on /products/kryo2, near the final purchase area.

Purpose:
Capture qualified WhatsApp leads from high-intent visitors who need reassurance before ordering. Do not replace the primary Add to Cart flow.

Required placement:
Below the Complete System / What's Included section and before/near the final buy area.
Do not place beside the hero Add to Cart.
Do not place in the sticky CTA.
Do not replace Chatway globally.
Do not add exit intent.

Required copy:
Heading: Questions before ordering?
Body: Message a KRYO expert on WhatsApp. Check fit, delivery and August allocation before the next dispatch.
Button: Message KRYO on WhatsApp

WhatsApp prefilled message:
Hi, I'm interested in KRYO from the website. I want to check fit and availability before the next Dubai dispatch.

Tracking requirement:
Add click tracking for the button before deployment.
Event name: whatsapp_cta_click
Event properties:
- location: complete_system_bottom
- page_path: /products/kryo2
- product_handle: kryo2
- experiment_key: whatsapp_assisted_sales_complete_system_bottom_2026_08
- proposal_id: 8af543fb-fd57-4174-a40f-510c4e55aae4
- timestamp
- session_id / anonymous_id if available
- UTM/source fields if available

Design constraints:
- Keep KRYO premium dark/neutral style.
- The CTA must be visually secondary to Add to Cart.
- Do not add gradients, cyan styling, fake urgency, new product claims, or medical claims.
- Do not slow the product page materially.
- Preserve all existing hero, Add to Cart, product form, pricing, scarcity, testimonial carousel, what-is-in-the-box/media, Downpay, cart, checkout and tracking behaviour.

Read-before requirements:
1. Confirm the live product/template being edited is /products/kryo2.
2. Confirm current page contains the recently added testimonial carousel and Complete System / What's Included section.
3. Confirm where the final buy area begins.
4. Confirm existing tracking helpers/events before adding the new event.

Write:
Implement only the CTA and its click tracking.

Read-after verification:
1. Confirm CTA appears only in the intended lower-page location.
2. Confirm button opens the correct WhatsApp link with prefilled message.
3. Confirm click tracking fires as whatsapp_cta_click.
4. Confirm no hero/sticky/ATC/cart/checkout/Chatway behaviour changed.
5. Confirm page still loads correctly on mobile.

After deployment:
Insert a row into public.marketing_change_log with:
- surface: shopify_page
- object_type: product_page
- object_name: KRYO 2 live traffic page
- market: AE
- product_handle: kryo2
- change_type: whatsapp_assisted_sales_cta_added
- experiment/proposal reference: 8af543fb-fd57-4174-a40f-510c4e55aae4
- exact timestamp
- note: Added subordinate WhatsApp assisted-sales CTA below Complete System / What's Included section. Measure qualified WhatsApp leads per 100 PDP sessions, assisted revenue, PDP ATC rate, checkout-start rate and direct ATC cannibalisation.

Stop and report instead of deploying if:
- the section location cannot be identified safely
- click tracking cannot be implemented without disturbing existing ATC tracking
- live template/product differs from expected
- implementation would require replacing Chatway globally
- implementation would alter Add to Cart, cart, checkout, pricing, product form, scarcity or testimonial behaviour
```

## 15. Current decision

```text
Decision: approve as next small live patch after tracking confirmation.
Next action: send Codex the implementation prompt above.
```
