# KRYO Experiment Validation Research Protocol

**Purpose:** turn Tom's proposed marketing experiments into a research-backed ICE decision, an implementation schedule, and a measurable funnel readout.

**Created:** 2026-08-06

This protocol exists because KRYO has low traffic, an unfamiliar high-ticket product, and a live page where stacking unresearched changes can destroy attribution. A proposal is not ready for Codex until the research layer has reduced uncertainty enough to decide whether the change should be a live patch, A/B test, technical fix, asset project, hold, or reject.

## 1. Operating principle

Every experiment must answer five questions before implementation:

1. **What exact customer fear, objection, or behaviour does this address?**
2. **Which exact funnel metric should move if the hypothesis is true?**
3. **What secondary metrics and guardrails prove whether the change helped or hurt?**
4. **What evidence supports or disproves Tom's hypothesis?**
5. **Is this a small timestamped live patch, a major A/B test, an asset project, a technical fix, or a hold?**

Do not treat a high ICE score as permission to implement if tracking is missing.

## 2. Required workflow

```text
Tom idea / observed problem
        ↓
Proposal logged in Supabase marketing_proposals
        ↓
Research validation sprint
        ↓
Tom proposal separated from research assessment
        ↓
Funnel metric and guardrails attached
        ↓
ICE score updated with evidence basis
        ↓
Decision: live patch / A-B test / technical fix / asset project / hold / reject
        ↓
Codex receives exact implementation prompt only after decision is clear
        ↓
Live timestamp into marketing_change_log when deployed
        ↓
Metric readout and learning stored
```

## 3. Proposal database requirements

Every serious proposal should populate or update these fields in `public.marketing_proposals`:

- `tom_proposal`
- `research_assessment`
- `funnel_stage`
- `primary_metric_key`
- `secondary_metric_keys`
- `guardrail_metric_keys`
- `expected_metric_direction`
- `baseline_window`
- `post_change_window`
- `measurement_plan`
- `implementation_status`
- `implementation_schedule`
- `implemented_change_ids`
- `change_started_at`
- `tom_claim_confidence`
- `research_confidence`
- `data_confidence`
- `confidence_basis`
- `ease_basis`
- `ice_impact`
- `ice_confidence`
- `ice_ease`
- `ice_score`
- `recommended_decision`
- `risk_to_current_cvr`
- `next_action`

The readout queue is `public.vw_marketing_proposal_ice_matrix`.

## 4. Research layers

Each validation sprint should check six layers.

### A. KRYO live data layer

Use Shopify and Supabase first.

Required checks:

- current sessions on `/products/kryo2`
- add-to-cart sessions
- PDP add-to-cart rate
- checkout starts
- cart-to-checkout rate
- completed checkout rate
- purchase conversion rate
- WhatsApp/chat/conversation signals if available
- current live change timestamps
- whether today's data is partial
- whether another live change would contaminate attribution

Source of truth order:

1. Shopify live/Admin Analytics for commerce and Shopify funnel metrics
2. Supabase for KRYO events, historical performance, change logs, and readout views
3. Meta/live ad tools only if fresh and verified
4. GitHub for implementation context and human-readable operating docs

### B. Customer psychology layer

Define the actual buyer state.

Examples:

- curiosity but low trust
- understands product but fears setup complexity
- wants product but needs human reassurance
- adds to cart but cart is slow or unclear
- understands offer but delays due high price
- needs proof that the product is real and works

Write the mechanism as a causal chain:

```text
Customer fear / uncertainty
↓
Page change
↓
Behaviour changed
↓
Metric moved
```

### C. Category-leader layer

Analyse businesses that sell expensive or unfamiliar products, especially:

- Eight Sleep
- Plunge
- Oura
- Whoop
- Tonal
- Therabody

Look for how they solve:

- product comprehension
- price justification
- risk reversal
- setup reassurance
- support / human reassurance
- reviews and proof
- video/demo usage
- financing/payment friction
- post-purchase risk

Do not copy their surface design blindly. Translate their buyer psychology to KRYO.

### D. Market/channel layer

For Dubai/UAE, check whether the proposed channel or behaviour fits the local market.

Examples:

- mobile commerce behaviour
- WhatsApp/business messaging preference
- payment/checkout expectations
- high-ticket purchase behaviour
- local trust norms
- delivery/returns expectations

### E. UX/CRO risk layer

Look for evidence that the same tactic can hurt conversion.

Examples:

- WhatsApp may cannibalise direct add-to-cart
- popups can interrupt task flow
- sticky chat can block mobile content
- video can slow page load
- too much information can increase decision work
- extra product options can create choice complexity

A good experiment proposal must include guardrails.

### F. Implementation and measurement layer

Check whether the experiment can be measured before it is implemented.

Minimum requirement:

- one primary metric
- at least two secondary metrics
- at least two guardrails
- baseline window
- post-change window
- event name if custom tracking is required
- implementation timestamp plan
- rollback/fail condition

## 5. ICE scoring rules

Formula:

```text
ICE score = Impact × Confidence × Ease / 10
```

### Impact score

Impact means expected commercial upside if the hypothesis is true.

Guide:

- 10: could materially change KRYO sales economics or unlock a reusable asset/channel
- 8-9: likely to move a primary funnel metric materially
- 6-7: meaningful but narrower effect
- 4-5: small optimisation or diagnostic improvement
- 1-3: low ceiling, cosmetic, or not connected to a revenue metric

Impact must name the metric expected to move.

### Confidence score

Confidence must not be made up. It should combine:

- KRYO data and current funnel context
- external research and benchmarks
- category-leader analogues
- consumer psychology fit
- implementation risk and cannibalisation risk
- measurement quality

Confidence guide:

- 9-10: KRYO data + strong external evidence + low downside
- 7-8: strong directional evidence but limited KRYO-specific proof
- 5-6: plausible, supported by theory, but with clear uncertainty
- 3-4: weak evidence or high risk of downside
- 1-2: mostly guesswork or contradicted by data

### Ease score

Ease is based on KRYO's actual resources, not generic effort.

Guide:

- 9-10: copy/layout change Codex can implement quickly with low risk
- 7-8: small theme change plus tracking/readback
- 5-6: requires technical investigation or moderate implementation
- 3-4: requires asset production, physical product readiness, or multi-day work
- 1-2: major dependency, large build, or unclear implementation

## 6. Decision taxonomy

### Small timestamped live patch

Use when:

- one variable is changed
- traffic is too low for clean A/B testing
- downside risk is limited
- measurement exists
- change can be reverted

### Major A/B test

Use when:

- change alters the purchase architecture
- change could strongly cannibalise current conversion
- enough traffic is available
- variants can be cleanly separated

### Technical conversion fix

Use when:

- issue is not a marketing hypothesis
- the current funnel is objectively broken or slow
- the correct action is measure → isolate cause → fix → reread

Do not A/B test obvious defects.

### Asset project

Use when:

- impact is high but implementation requires product completion, photo/video shoot, creative editing, or external dependency

### Hold

Use when:

- risk is high
- measurement is missing
- another cleaner experiment should run first
- current live changes need a readout window

### Reject

Use when:

- hypothesis is contradicted by live data or external evidence
- change conflicts with KRYO positioning
- change creates a tracking/checkout risk

## 7. Codex handoff requirements

Codex should only receive implementation work after the research sprint defines:

- exact page/template/resource
- exact location
- exact copy
- exact event tracking
- exact forbidden scope
- exact success criteria
- exact rollback condition
- read-before / write / read-after checks
- marketing_change_log timestamp instruction

Codex should not rediscover strategy or make marketing judgement calls.

## 8. Standard validation output format

Every serious research validation should produce:

1. Executive verdict
2. Tom proposal
3. Research assessment
4. KRYO live context
5. Customer psychology
6. Category leader parallels
7. Market/channel evidence
8. UX/CRO risk evidence
9. Metrics and measurement plan
10. ICE score and basis
11. Implementation recommendation
12. Codex-ready prompt
13. Database updates performed
14. Required follow-up readout

## 9. Current model example

The first full model example is:

`docs/kryo-growth/research/KRYO_WHATSAPP_ASSISTED_SALES_EXPERIMENT_2026_08.md`

Use it as the standard for future requests such as:

- validate this experiment
- disprove this experiment
- research whether this should be live patched or A/B tested
- update the ICE score with evidence
- prepare Codex implementation prompt
