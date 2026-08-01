# KRYO2 August 30 Founding Access WhatsApp + Deposit Funnel

Experiment ID: 6f2c4e6e-8632-4bea-9b8f-f34a8a27f134
Experiment key: kryo2_aug30_access_20260725
Status: proposed_not_live
Angle/hook: anti_tub_replacement / founding_access_aug30
Mutation performed: no

## Constraint
High-intent hesitation between cart and checkout, plus insufficient low-friction capture for buyers who need reassurance.

## Evidence
- 40 cart-view sessions produced 2 checkout-click sessions, 5% cart-to-checkout click rate.
- 3 WhatsApp clicks and 11 chat clicks from 569 tracked KRYO sessions.
- 257 Clarity dead clicks and 688 script errors indicate trust/friction noise.
- Historical Meta revenue concentrated in Winner | Plunge is Dead.

## Hypothesis
If the page separates hyper-buyer purchase from warm-buyer WhatsApp access, while matching the winning anti-plunge ad promise with real August 30 scarcity and trust proof, more high-intent visitors will either buy, start WhatsApp, or pay a refundable deposit instead of exiting at cart.

## Treatment message map
- Above fold promise: Cold exposure without a plunge, with August 30 dispatch access.
- Buy-now lane: Reserve KRYO now.
- Warm-buyer lane: Get WhatsApp access to confirm availability and hold the AED 3,990 price.
- Cart anxiety answer: Dispatch date, refundable deposit path, WhatsApp concierge, and exact next step after payment.

## WhatsApp lead offer
- CTA: Get August access
- Prefill: Hi, I want August 30 access to KRYO. Please confirm current Dubai availability and send the refundable deposit option.
- Reason: Secure access to the August 30 dispatch batch and get the refundable deposit link by WhatsApp.

## Deposit funnel
- Status: schema_ready_payment_flow_needed
- WhatsApp access request
- Concierge confirms fit and batch availability
- Deposit link sent
- Deposit completed
- Lead status updates
- Full purchase or refund path

## Paused ad variation plan
- Source ad: 120249120433950279
- Discipline: Keep campaign, ad set, creative angle and core anti-plunge promise. Change destination URL and copy slightly to match August 30 access.
- Primary text: Ice baths are too much friction for daily Dubai life. KRYO gives you a real cold-exposure ritual from your shower, with August 30 dispatch access now open.
- Headline: Cold exposure without a plunge
- Description: Reserve now or get August access by WhatsApp.

## Expected metric movement
- whatsapp_or_chat_interest_rate_pct: 2.5 -> 4.0 to 8.0. Dedicated access CTA should capture warm buyers who currently leave or open chat inconsistently.
- cart_to_checkout_click_rate_pct: 5 -> 10.0 to 15.0. Trust and exact next-step proof should reduce cart hesitation.
- checkout_started_per_kryo_session_pct: 0.5 -> 0.9 to 1.5. More high-intent users should either start checkout or enter deposit/WhatsApp lane.
- purchase_or_deposit_count: 2 -> 3 to 6 over similar traffic, if paid traffic quality is comparable. Small baseline. Treat as directional until paid delivery restarts.

## Decision rules
- Success: Call successful if after at least 500 KRYO sessions or 10 days with fresh tracking, qualified_action_rate is at least 2x baseline and either cart-to-checkout click rate is at least 10% or WhatsApp lead submit rate is at least 4%, with no guardrail failure.
- Failure: Call failed if after the same threshold, qualified_action_rate does not improve by at least 25%, WhatsApp lead submit rate stays below 2%, and cart-to-checkout remains below 7%, assuming tracking is healthy.
- Inconclusive: Continue collecting data if sessions are under 500, paid traffic quality changed materially, Meta delivery is off, lead/deposit tracking is blocked, or source-health is stale.

## Source health
- Paid current verdicts usable: no
- Measurement spine: ok

## Approval gates before live changes
- Copy gate PENDING.
- Website preflight PENDING.
- Measurement spine lead capture ready or explicitly accepted as blocked.
- Tom approves named Shopify patch.
- Tom approves paused Meta clone or dry-run validated creative/ad creation.
