# KRYO Control v2 — High-Confidence Pre-Test Upgrade — August 2026

**Status:** research source of truth for the immediate non-experiment baseline upgrade to `/products/kryo2`.

**Execution source of truth:** `marketing/baseline-changes/KRYO-BASELINE-20260806-01-CONTROL-V2.md`

**Operating protocol:** `docs/kryo-growth/operations/KRYO_BASELINE_CHANGE_PROTOCOL.md`

## 1. Decision

The first Control v2 release contains only four high-confidence changes:

1. truthful current-allocation / next-dispatch scarcity;
2. stronger product tangibility using the existing what's-in-the-box / front / side assets;
3. the existing specific tester testimonial block;
4. 30-day trial + free Dubai delivery/returns repeated at the purchase decision.

This release deliberately does **not** add WhatsApp, exit intent, new ad messaging, model choice, scroll-to-buy, or any other purchase-path change.

Why: this is a regression-controlled baseline release, not an experiment. We want to improve credibility and information quality while preserving the buying architecture that historically generated approximately 10% LPV→ATC.

## 2. Live state researched for the frozen task

At freeze time:

- winning product: `/products/kryo2`
- product ID: `9334472311092`
- winning variant: `49131658805556`
- one sellable variant
- inventory observed: `7`
- product available for sale
- live template: `templates/product.kryo-2-2-track-cta2.json`
- existing recurring urgency included `OFFER ENDS FRIDAY`
- hero remained `Step in tired. Step out switched on.`
- hero/sticky CTA used direct Add to Cart to the winner variant
- Downpay remained `50% today. Balance before dispatch.`

The frozen task contains exact preconditions. If live state differs, Codex must stop; the research operator issues a revised manifest.

## 3. Preserve the proven purchase architecture

Do not change in this release:

- one-model architecture;
- AED 3,990 offer/pricing;
- hero headline/subheadline/image;
- direct hero Add to Cart;
- direct sticky Add to Cart;
- Downpay;
- 30-day trial policy;
- Performance Flow Upgrade;
- cart upgrade popup;
- checkout;
- Chatway / WhatsApp;
- Meta/tracking/attribution;
- unrelated lower-page content.

The failed `/products/kryo2_` challenger changed too many high-impact variables simultaneously. It therefore cannot tell us which positive additions were outweighed by which negative purchase-friction changes.

## 4. Change A — truthful allocation + dispatch scarcity

Remove recurring generic deadline language such as:

`OFFER ENDS FRIDAY`

For the frozen 7-unit state and planned two-week dispatch cadence, the approved research direction is to communicate:

- current August allocation remaining;
- exact next dispatch date;
- no fake resetting deadline.

The frozen task currently uses:

`AUGUST DUBAI ALLOCATION · 7 OF 10 REMAIN · NEXT DISPATCH 15 AUGUST`

and consistent shorter versions in sticky/hero locations.

The inventory `7` is a deployment precondition, not a value Codex may update itself.

**Research rationale:** truthful availability/time scarcity gives a real downside to waiting without eroding trust through permanently resetting urgency.

## 5. Change B — stronger product tangibility

Approved existing assets:

- `kryo-whats-in-the-box.webp`
- `kryo-front-view.webp`
- `kryo-side-view.webp`

The intended final gallery keeps the proven current first image, then introduces the three tangible product assets, then preserves the remaining current winner images.

This answers purchase-critical questions without adding a new decision step:

- what arrives;
- what the unit actually looks like;
- how substantial the complete system is.

Important Shopify implementation detail: product gallery media is product-scoped, not template-scoped. Therefore it is frozen for owner review but is not attached to the live winner during the alternate-template review phase. It is attached/reordered only after explicit approval.

## 6. Change C — specific tester proof

Use the existing testimonial block already built on `kryo2_`:

`ai_gen_block_5edb068_GqHjBY`

Placement:

immediately after `What makes KRYO different?`

The exact block content is embedded in the frozen task so Codex does not need to inspect or copy the challenger page.

Reason: KRYO is a novel high-ticket physical product. Specific usage testimony is a clear trust improvement over effectively no useful social proof, although on-site testimonials do not replace future independent review/creator proof.

## 7. Change D — purchase reassurance near ATC

Repeat the already-valid operational promises directly in the buy area:

`30 Day Risk-free Trial · Free Dubai Delivery & Returns`

Do not add a second large trust section.

Reason: the information already exists on the page, but category leaders and product-page UX research support surfacing delivery/risk information where the purchase decision occurs.

## 8. Why WhatsApp is not Release 1

Assisted WhatsApp sales remains strategically valuable for KRYO because buyers take multiple sessions and high-ticket products often need human reassurance.

However WhatsApp creates an alternate conversion path. It can lower same-session ATC while increasing assisted revenue. That makes it qualitatively different from the four trust/information upgrades above.

Therefore:

- do not add or alter WhatsApp in the first Control v2 baseline release;
- keep the existing Chatway untouched;
- evaluate a subordinate WhatsApp specialist release separately after the baseline is stable and WhatsApp attribution can be measured;
- exit intent remains a later experiment.

See `KRYO_ASSISTED_CONVERSION_WHATSAPP_AND_EXIT_INTENT_2026_08.md`.

## 9. Planning expectation

External research cannot prove an exact KRYO uplift in advance. These are planning priors, not guarantees.

Historical winner:

- LPV→ATC ≈ `10%`
- LPV→purchase ≈ `0.64%` in the historical dataset

For the combined four-change baseline package, a reasonable directional planning range remains:

- LPV→ATC approximately `11.5–12.5%`, central ~`12%`;
- mature LPV→purchase approximately `0.7–0.9%`, central ~`0.8%`, if traffic quality is comparable.

Do not sum individual hypothetical uplifts and do not attribute post-release improvement to one component.

## 10. Release and monitoring model

This is **not** an A/B test.

Workflow:

research live state → freeze exact manifest → Codex builds alternate-template review → owner visually approves → exact approved artifact deploys → product media attaches → live reread → timestamp → regression monitoring → keep/revert.

Use only post-deployment traffic from the recorded UTC timestamp.

Typical monitoring gates frozen into the task:

- ~25 clean paid LPVs: technical/regression checkpoint;
- ~50 clean LPVs: directional intent checkpoint;
- ~100 clean LPVs or 3–5 days: keep/investigate/revert checkpoint.

Historical ~10% LPV→ATC is the anchor. A persistent `<6%` around 100 clean LPVs, with no compensating downstream outcome and traffic-side causes ruled out, is the current rollback trigger.

Do not use Meta cost metrics unless same-day Meta data is directly readable or proven fresh.

## 11. Next actions after Control v2 stabilises

These are separate experiments/releases, not part of this task:

1. same-ad-set pre-frame discovery, led by Morning Grogginess / Morning Purpose;
2. truthful next-dispatch deadline creative near real cutoffs;
3. mechanism/education creative and real demonstration proof;
4. subordinate WhatsApp specialist path with assisted-revenue measurement;
5. exit-intent → WhatsApp only after baseline assistance is measurable;
6. matched landing-page split test only after a pre-frame earns commercial signal.

## 12. Sources

Companion research notes:

- `KRYO_META_CREATIVE_TESTING_AND_MULTIVISIT_FUNNEL_2026_08.md`
- `KRYO_PREFRAME_EXPERIMENT_MATRIX_AND_KILL_RULES_2026_08.md`
- `KRYO_FORTNIGHTLY_DISPATCH_URGENCY_SYSTEM_2026_08.md`
- `KRYO_FUNNEL_DIAGNOSIS_AND_EXPERIMENT_PRIORITY_2026_08.md`
- `KRYO_PREMIUM_PDP_BENCHMARK_EIGHTSLEEP_PLUNGE_2026_08.md`
- `KRYO_ASSISTED_CONVERSION_WHATSAPP_AND_EXIT_INTENT_2026_08.md`

Implementation is governed by the baseline protocol and frozen task, not by Codex interpretation of this research note.
