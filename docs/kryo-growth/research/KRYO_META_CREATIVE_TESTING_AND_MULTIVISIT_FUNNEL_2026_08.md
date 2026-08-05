# KRYO Meta Creative Testing & Multi-Visit Funnel — August 2026

**Status:** source-of-truth research note for KRYO paid-social experimentation.

**Purpose:** define how KRYO should test new Meta pre-frames and creatives without unnecessarily fragmenting the winning ad set or confusing performance discovery with causal A/B testing.

## 1. Executive decision

At KRYO's current spend and conversion volume, **do not default to creating a second ad set solely to test a new pre-frame.**

Use two distinct modes:

1. **Performance discovery:** keep the winning Purchase-optimised Dubai ad set consolidated and add a small number of genuinely distinct ads/pre-frames inside it. Let Meta allocate delivery. Judge business economics at ad level.
2. **Causal validation:** use Meta Experiments / A/B testing only when a finalist hypothesis is important enough to justify non-overlapping audience splits and potentially less efficient delivery.

This supersedes any prior assumption that the first Morning Purpose test must automatically be a separate $25/day ad set.

## 2. Why the default should be same-ad-set discovery

Meta's current Performance 5 guidance says to simplify account structure, combine similar ad sets, minimise changes during learning, and diversify creative so the system can deliver the most relevant message to the right person. Meta separately states that similar simultaneous ad sets receive fewer learning opportunities and may produce fewer results.

For KRYO, a separate ad set with the same Dubai audience, Purchase goal, placements and product would be structurally similar to the control ad set. At low spend, splitting budget reduces the conversion signal available to each ad set.

**Therefore:** new proposition/creative discovery should generally happen inside the proven ad set unless we specifically need a controlled causal answer.

## 3. Important correction: multiple ads are not a deterministic funnel sequence

The user intuition that different ads may influence the same buyer across multiple sessions is directionally useful, but it should not be overstated.

Meta does **not** automatically run Ad A as awareness, then Ad B as consideration, then Ad C as conversion merely because all three sit in the same ad set. Each impression enters an auction and Meta chooses what it predicts will generate the desired result for that user at that moment.

However, because KRYO buyers can require multiple sessions before purchase, the same eligible person may encounter more than one creative over time. Creative diversity can therefore:

- surface different reasons to care;
- reinforce the product from another angle;
- reduce dependence on a single hook;
- let Meta match message to person / auction opportunity.

This is **performance orchestration**, not deterministic sequencing.

## 4. What KRYO's own evidence implies

The canonical KRYO growth analysis found three historical buyers from the winning control with purchase lag of approximately **1, 3 and 6 days**, with roughly three sessions on average. The sample is small, but it is directionally strong enough that KRYO should not design acquisition as if every buyer converts on first click.

Implications:

- preserve Meta's ability to re-reach and optimise within the same Purchase ad set;
- do not judge ads only on same-session purchase;
- measure ATC and checkout as leading signals, then allow purchase lag to mature;
- value persistent assisted-sale channels such as WhatsApp because they can bridge sessions.

## 5. Recommended discovery structure

### Existing winning ad set

Keep:

- campaign: KRYO | Dubai
- ad set: historical winning Dubai Purchase ad set
- objective: Sales / Purchase
- broad / Advantage audience structure already proven
- existing winning control ad untouched

### Creative count

At approximately $15–$25/day total ad-set spend:

- **2 active proposition ads is ideal for discovery**: the historical winner + one challenger.
- Avoid loading 5–10 low-spend ads into the set. There is not enough signal.

At higher stable spend, add a third meaningfully different creative only when it answers a different high-value commercial hypothesis.

### First challenger

**Morning Purpose pre-frame**

Preserve the winner's proven visual assets initially. Change the copy territory so all text assets are coherent around:

- mornings that cannot start slow;
- Step in tired. Step out switched on;
- controlled 1°C cold immersion;
- KRYO as a complete engineered system ready inside the existing bathroom routine.

Do not mix anti-plunge and morning-purpose copy within the same challenger creative if the goal is to learn whether the morning pre-frame is commercially useful.

### Destination

Initial discovery can point to **Control v2** because its hero already carries the morning outcome. If the Morning Purpose ad earns meaningful spend and promising ATC economics, then build a more tightly matched first 20–25% landing-page treatment and validate the full matched funnel.

This avoids paying to build a full treatment before the acquisition proposition demonstrates any signal.

## 6. How to judge ads in same-ad-set discovery

Same-ad-set ad performance is **not a clean randomized experiment**. Meta is deliberately choosing which users see which creative.

That is acceptable in discovery mode because the question is:

> Which creative + audience matching behaviour produces the best real business economics when Meta is allowed to optimise?

Track by ad ID:

1. Spend
2. Impressions / CPM
3. Link CTR / CPC
4. LPV / cost per LPV
5. LPV → ATC
6. Cost per ATC
7. LPV → initiate checkout / cost per checkout
8. Purchases / CPA / ROAS after lag matures
9. Assisted WhatsApp leads and eventual assisted revenue when attributable

**Primary leading metric:** cost per ATC, supported by LPV→ATC and checkout quality.

Do not declare a creative bad just because Meta gives it less spend in the first few hours. But if the system continues to deprioritise it and its realised economics are weak, that is itself commercially useful evidence.

## 7. When to use a true split test

Use Meta Experiments / A/B testing when:

- a challenger has already shown promise;
- the decision is strategically important;
- we need to know whether a proposition or landing page causes the uplift rather than merely being favoured by Meta's delivery algorithm;
- sufficient budget/time exists for separate, non-overlapping exposure.

Examples:

- Morning Purpose matched funnel vs anti-plunge funnel after Morning creative proves viable.
- Sauna/contrast market vs morning market if both show viable acquisition economics.
- Major offer architecture changes.

Do **not** spend scarce budget on controlled tests for low-risk baseline hygiene such as adding truthful shipping reassurance or better product imagery.

## 8. Discovery vs validation

| Mode | Goal | Structure | Main advantage | Main limitation |
|---|---|---|---|---|
| Performance discovery | Find what makes money | Multiple distinct ads in winning ad set | Preserves signal and lets Meta optimise | Not causal / spend not equal |
| Controlled validation | Isolate a variable | Meta Experiments / non-overlap split | Cleaner inference | Fragments delivery and needs more budget |

KRYO should use **discovery first, validation second**.

## 9. Scaling principle

Do not create a second ad set simply because the total desired spend is $50/day.

If the existing ad set remains economically healthy, scale the **consolidated Purchase ad set** and allow the control + challenger creative to compete for delivery. Budget expansion should be driven by current economics, not a desire to create equal test cells.

A later A/B test may temporarily allocate budget evenly, but that is a research cost and should be used deliberately.

## 10. Sources

### Primary / platform sources

- Meta, **Simplify Your Ad Set Structure**: https://www.facebook.com/business/ads/ad-set-structure
- Meta, **Performance Marketing / Performance 5**: https://www.facebook.com/business/ads/performance-marketing
- Meta, **Expand Your Ad Creative Strategy**: https://www.facebook.com/business/ads/ad-creative
- Meta, **Ad auction explained**: https://www.facebook.com/business/ads/ad-auction
- Meta, **Create ad campaigns / A/B test option**: https://www.facebook.com/help/messenger-app/621956575422138/

### Experimentation context

- Jon Loomer, **How to Create an A/B Test in Meta Experiments**: https://www.jonloomer.com/how-to-create-an-a-b-test-in-meta-experiments/
- Burtch et al. (2025), **Characterizing and Minimizing Divergent Delivery in Meta Advertising Experiments**: https://arxiv.org/abs/2508.21251

## 11. Confidence grading

- Consolidate similar low-budget ad sets: **high confidence**, directly aligned with Meta guidance.
- Creative diversification inside the winning ad set: **high confidence**, directly aligned with Meta guidance.
- Multiple ads can support different moments across a multi-session journey: **medium confidence**; plausible and commercially useful, but not deterministic sequencing.
- Separate 50/50 ad-set test as the default first move: **rejected** at current KRYO scale.
- Meta Experiments for finalist causal validation: **high confidence** when the learning question justifies the budget cost.
