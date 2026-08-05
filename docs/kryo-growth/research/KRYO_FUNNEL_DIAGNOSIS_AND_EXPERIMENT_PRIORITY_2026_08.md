# KRYO Funnel Diagnosis & Experiment Priority — August 2026

**Status:** source-of-truth diagnostic note for deciding what KRYO should test next as spend increases.

**Purpose:** connect actual KRYO funnel data to the experiment roadmap so changes target the highest-value drop-offs rather than generic CRO ideas.

## 1. Historical control benchmark

Historical winning ad/funnel:

- spend: 303.61
- impressions: 14,272
- clicks: 864
- LPVs: 470
- ATCs: 47
- initiate checkouts: 10
- purchases: 3
- revenue: 4,650.76

Derived funnel:

- CTR: ~6.05%
- CPC: ~0.35
- click→LPV: ~54.4%
- CPLPV: ~0.65
- LPV→ATC: 10.0%
- ATC→IC: ~21.3%
- LPV→IC: ~2.13%
- IC→purchase: 30%
- LPV→purchase: ~0.64%
- cost/ATC: 6.46
- cost/IC: 30.36
- CPA: 101.20
- ROAS: 15.32x

The historical system proved that KRYO can acquire traffic cheaply and generate meaningful cart intent.

## 2. Failed challenger benchmark

The failed `kryo2_` multivariable page produced approximately:

- spend: 74.72
- LPVs: 99
- ATCs: 1
- IC: 0
- purchases: 0
- LPV→ATC: ~1.01%
- cost/ATC: 74.72

It simultaneously changed:

- one model → three variants;
- direct ATC → scroll/select model;
- urgency architecture;
- fulfilment timing;
- testimonial proof;
- product imagery;
- WhatsApp prominence;
- cart popup behaviour;
- purchase CTA routing.

The package failed, but the positive/negative contribution of individual changes is not identifiable.

The strongest behavioural clue is that engagement increased while purchase progression collapsed. The page asked users to do more decision work before buying.

## 3. Current August measurement snapshot

As of the latest first-party query on 5 August 2026, after the historical winner restarted:

- `Winner | Plunge is Dead` had 17 fresh paid sessions to `/products/kryo2`;
- 1 explicit first-party Add to Cart was recorded;
- 2 sessions reached `/cart`;
- traffic included mostly UAE but some non-UAE IP geolocation observations;
- the sample remains too small to judge conversion.

This snapshot is intentionally dated and must not be treated as a permanent benchmark.

### Meta ingestion status

At research time:

- first-party attribution touches are fresh;
- `meta_ad_metrics_daily` freshness reports latest date 2026-08-01, updated 2026-08-02;
- `meta_ad_metrics_hourly` remains stale historically;
- the current same-day Meta delivery economics are therefore not reliably available in Supabase yet.

**Rule:** do not make budget / kill decisions that require spend, CTR, CPC or CPLPV until current Meta delivery data is readable either directly from Meta or through a proven-fresh Supabase sync.

## 4. What the funnel says the problems are

### Problem A — acquisition proposition is not fully explored

The historical anti-plunge winner proves category disruption can acquire cheap traffic.

It does **not** prove it is the best message for all stages of the customer journey.

The small historical Morning Grogginess ad recorded:

- spend 13.55;
- 5 recorded LPVs;
- 1 ATC;
- 1 IC.

That is too little to infer performance, but enough to justify a structured retest.

Highest-value question:

> Can another pre-frame attract / reactivate prospects with stronger downstream purchase intent while the proven anti-plunge hook remains available?

### Problem B — unfamiliar category / premium price requires proof and comprehension

KRYO asks an unfamiliar buyer to pay AED 3,990 for a new physical system.

Compared with Eight Sleep / Plunge, the control is weaker in:

- visible specific user proof;
- tangible complete-system imagery;
- real product demonstration;
- immediate shipping/returns reassurance;
- integrated expert assistance.

Control v2 addresses the lowest-risk gaps now.

### Problem C — cart-to-checkout progression deserves attention

Historical:

- 47 ATCs → 10 initiate checkouts = ~21.3%.

This may be partly measurement mismatch, but it is low enough to treat cart progression as a diagnostic area.

The restored Performance Flow Upgrade popup and correct cart path must therefore be monitored rather than casually redesigned.

Do not add cart distractions. Baymard research repeatedly warns that cart/checkout interruptions can draw users away from purchase.

### Problem D — customers need a reason to act now

Historical purchase timing and user experience imply consideration can last days.

A truthful fortnightly dispatch cadence creates a real reason to act:

- current batch dispatch;
- next dispatch two weeks later;
- real remaining allocation.

This should replace fake recurring urgency and be tested as both page messaging and a time-window Meta pre-frame.

### Problem E — assisted conversion is underdeveloped

High-ticket buyers may have fit, setup, delivery, trust, noise or electrical questions.

A persistent WhatsApp thread can bridge sessions better than generic web chat, but it must remain subordinate to Add to Cart.

The metric is assisted revenue, not WhatsApp clicks.

## 5. Metric tree

### Acquisition / auction

- spend
- impressions
- CPM
- CTR
- CPC
- link clicks

Purpose: diagnose attention / auction economics.

### Landing efficiency

- LPVs
- click→LPV
- cost/LPV
- immediate exit / shallow session where reliable

Purpose: diagnose page load / message mismatch / low-quality clicks.

### Purchase intent

**Primary leading metrics:**

- LPV→ATC
- cost/ATC

Supporting:

- product CTA clicks
- cart arrival

### Checkout quality

- ATC→IC
- LPV→IC
- cost/IC
- cart exit without checkout
- gift-popup interaction where measurable

### Mature commerce

- purchases
- CPA
- revenue
- ROAS
- revenue/LPV
- conversion by 1 / 3 / 7 / 30 days from first paid touch

### Multi-session / assisted

- first-touch ad
- last paid ad before purchase
- number of known sessions before purchase
- days from first touch
- WhatsApp-assisted purchase / revenue
- purchase relative to dispatch cutoff

## 6. Experiment priority doctrine

Rank experiments by:

**expected commercial upside × confidence × speed of learning ÷ implementation / traffic cost**.

Do not optimise for scientific purity at the expense of sales when the change is obvious baseline hygiene.

### BASELINE NOW — Control v2

Ship high-confidence upgrades:

1. truthful current allocation / dispatch;
2. stronger front/side/what-is-included gallery assets;
3. transparent tester/customer proof;
4. 30-day trial + free Dubai delivery/returns beside purchase;
5. one subordinate WhatsApp specialist pathway;
6. preserve one model, direct ATC, Downpay, cart popup and checkout.

### EXPERIMENT P1 — Morning Purpose pre-frame

Environment:
- same winning Purchase ad set;
- winner remains live;
- Morning challenger active alongside it;
- initial destination: Control v2.

Question:
> Can a personally relevant morning problem pre-frame improve downstream intent / economics?

Metrics:
- cost/LPV;
- LPV→ATC;
- cost/ATC;
- checkout;
- mature purchase.

### EXPERIMENT P2 — Fortnightly dispatch urgency

Run near true dispatch cutoff.

Question:
> Does the real downside of waiting convert high-consideration / returning prospects?

Use:
- current dispatch date;
- next scheduled dispatch;
- live allocation count.

### EXPERIMENT P3 — Mechanism / education creative

Question:
> Do prospects need clearer explanation of what KRYO is before they can justify AED 3,990?

Creative:
- own chilled water;
- 1°C control;
- Halo;
- no dependence on warm Dubai tap water;
- complete engineered system.

Best future asset: real product demo.

### EXPERIMENT P4 — Real proof package

Question:
> Does authentic demonstration / real user experience remove trust uncertainty?

Use:
- real setup;
- real user;
- physical reaction;
- actual KRYO footage;
- installation / bathroom context.

### EXPERIMENT P5 — Assisted conversion / exit recovery

First baseline:
- subordinate WhatsApp specialist link.

Later experiment:
- targeted exit-intent → WhatsApp after meaningful engagement;
- no default extra discount;
- never on checkout;
- suppress after ATC / WhatsApp action.

### EXPERIMENT P6 — Sauna / contrast market

Strategic market-discovery test after core creative system is stable.

## 7. Fast prioritisation rules as spend scales

At approximately $30/day:

- 2 evergreen ads active in the winning ad set is a good default;
- temporary third deadline ad near a dispatch cutoff is acceptable;
- do not spread $30/day across a large creative library.

As spend increases:

- increase creative diversity only when each new ad answers a distinct commercial question;
- do not duplicate near-identical ads merely to generate volume;
- maintain one named control at all times.

## 8. Decision cadence

### Daily health

Check:
- Meta data freshness;
- spend / CTR / CPC / LPV;
- correct destination;
- current ATC / cart / IC;
- errors / checkout blockers.

### Every ~30–50 LPVs per challenger

Make early keep/pause decisions using the pre-frame kill rules.

### Every 7 days / mature cohort

Review:
- purchases;
- CPA;
- ROAS;
- session lag;
- first vs later touches;
- assisted revenue;
- dispatch-cutoff timing.

Do not let a one-day metric override multi-day purchase evidence.

## 9. Research references

See companion notes:

- `KRYO_META_CREATIVE_TESTING_AND_MULTIVISIT_FUNNEL_2026_08.md`
- `KRYO_PREFRAME_EXPERIMENT_MATRIX_AND_KILL_RULES_2026_08.md`
- `KRYO_FORTNIGHTLY_DISPATCH_URGENCY_SYSTEM_2026_08.md`
- `KRYO_PREMIUM_PDP_BENCHMARK_EIGHTSLEEP_PLUNGE_2026_08.md`
- `KRYO_ASSISTED_CONVERSION_WHATSAPP_AND_EXIT_INTENT_2026_08.md`
- `KRYO_CONTROL_V2_PRETEST_UPGRADE_2026_08.md`

External:

- Baymard Ecommerce UX Research: https://baymard.com/
- Meta Performance 5: https://www.facebook.com/business/ads/performance-marketing
- Meta Simplified Ad Sets: https://www.facebook.com/business/ads/ad-set-structure
- Management Science, Path to Purchase: https://pubsonline.informs.org/doi/10.1287/mnsc.2014.1952
- Retargeting frequency/timing field experiment: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2852484

## 10. Final operating principle

KRYO should optimise a **multi-session decision system**, not only a first-click landing page.

That system contains:

- ads that create curiosity, relevance, education and urgency;
- a PDP that explains / proves / reassures without adding decision friction;
- a direct purchase path;
- persistent assisted help for hesitant prospects;
- truthful operational deadlines;
- measurement that follows customers over days rather than judging only same-session purchases.
