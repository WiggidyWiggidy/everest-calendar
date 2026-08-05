# KRYO Pre-Frame Experiment Matrix & Kill Rules — August 2026

**Status:** source-of-truth research note for Meta creative/pre-frame discovery in the winning KRYO Purchase ad set.

**Purpose:** define which pre-frame angles KRYO should test, why they matter for a multi-session purchase journey, how quickly to cut weak ads, and which metrics are required before making decisions.

## 1. Core decision

KRYO should use the existing proven Purchase ad set as the default **performance-discovery environment** for new pre-frames.

Do not create a new ad set for every message angle at current spend. Meta's current Performance 5 guidance recommends consolidating similar ad sets and diversifying creative so the delivery system can show relevant messages to the people most likely to respond.

This means:

- preserve the historical `Winner | Plunge is Dead` ad as the control;
- add a small number of meaningfully different pre-frame ads inside the same winning ad set;
- allow Meta to allocate delivery;
- judge business economics by ad ID;
- use a controlled Meta Experiment only after a challenger proves commercially interesting and the causal answer is worth the efficiency cost.

This is not a deterministic funnel sequence. Ads in one ad set are not automatically shown in a fixed order. However, KRYO's multi-session purchase behaviour means the same prospect may encounter more than one eligible creative over time, and different messages can contribute at different moments of the decision process.

## 2. Why multi-session creative matters

KRYO is high-consideration and historically required multiple visits before purchase.

The canonical KRYO analysis found purchase lags of approximately 1, 3 and 6 days across the three historical winning buyers, with multiple sessions per buyer.

This is consistent with broader advertising research:

- Xu, Duan & Whinston (Management Science, 2014) model online advertising paths where one ad click may not immediately convert but can stimulate later clicks that lead to purchase. Their analysis shows direct conversion metrics can understate the value of some display interactions.
- Sahni, Narayanan & Kalyanam's randomized retargeting field experiment found retargeting caused 14.6% more users to return to the advertiser's website over four weeks; effect strength declined as time from the initial visit increased.
- Johnson, Lewis & Nubbemeyer found display retargeting lifted website visits by 17.2% and purchases by 10.5% in their field application.
- Li et al. found immediate cart retargeting can backfire, while retargeting 1–3 days later had a positive incremental purchase effect. This is not a direct prescription for Meta broad delivery, but it reinforces that **timing matters** in a multi-session decision.
- Large-scale research on repeated advertising exposures finds the effect is nonlinear and heterogeneous across consumers. More exposure is not automatically better; relevance and timing matter.

Implication for KRYO:

> Creative diversity should answer different purchase questions across the journey, but we should not force artificial frequency or assume more impressions always help.

## 3. Historical KRYO ad evidence

### Proven control

Ad: `120249120433950279`
Name: `Winner | Plunge is Dead`

Historical recorded result:

- spend: 303.61
- impressions: 14,272
- clicks: 864
- LPVs: 470
- ATCs: 47
- initiate checkouts: 10
- purchases: 3
- revenue: 4,650.76
- CTR: ~6.05%
- CPC: ~0.35
- CPLPV: ~0.65
- LPV→ATC: 10.0%
- cost/ATC: 6.46
- LPV→IC: 2.13%
- cost/IC: 30.36
- CPA: 101.20
- ROAS: 15.32x

This is the benchmark to protect.

### Morning Grogginess challenger

Ad: `120249120433960279`
Name: `Winner | Morning Grogginess`

Historical recorded result before the current restart:

- spend: 13.55
- impressions: 503
- clicks: 19
- recorded LPVs: 5
- ATCs: 1
- initiate checkouts: 1
- purchases: 0

This sample is far too small for a result. It also had much worse traffic economics than the winner in the limited historical data, but the 1 ATC + 1 IC from 5 recorded LPVs is a useful **signal worth retesting**, not proof.

Important: the LPV count may be noisy/incomplete in older Meta ingestion. Do not calculate a confident 20% conversion rate from five LPVs.

### Other old ads

Several old KRYO ads had too little spend or ambiguous tracking to justify decisions. One old Anti-Tub ad recorded unusually high ATCs but no initiate checkouts or purchases, making it a likely instrumentation / intent-quality warning rather than a clean winner.

Rule: do not revive historical ads solely because an old ATC count looks high. Require current traffic economics + checkout quality.

## 4. Pre-frame priority matrix

### P1 — Category disruption / anti-plunge

**Status:** proven control.

Customer question:
> Why is this category/product different from the cold exposure systems I already know?

Core territory:
- `The cold plunge is dead`
- a cold plunge no longer needs to be a tub
- compact engineered cold immersion without a dedicated plunge footprint

Purpose:
- strong attention / category disruption;
- creates initial curiosity;
- historically proven acquisition economics.

Action:
- keep unchanged as control.

### P2 — Morning Purpose / slow-start problem

**Status:** highest-priority challenger; historical tiny positive downstream signal.

Customer question:
> Why is this relevant to my life every day?

Core territory:
- `Some mornings cannot start slow.`
- `Step in tired. Step out switched on.`
- `Built for sharper mornings.`
- 1°C controlled cold inside the bathroom routine.

Purpose:
- qualify a high-value repeated-use buyer;
- reduce the leap between novel product and personal use case;
- potentially work both for cold acquisition and for prospects returning after already understanding the product.

First test:
- use the historical Morning ad if its live creative is accurate and compliant;
- keep the visual system close to the proven winner so the main difference is proposition;
- initially point to Control v2.

### P3 — Dispatch deadline / truthful urgency

**Status:** high-value time-window creative, not evergreen fake pressure.

Customer question:
> Why should I buy now instead of thinking about it for another week?

Core territory when operationally true:
- `Next Dubai dispatch: 15 August.`
- `7 of 10 August allocations remain.`
- `Miss this dispatch and the next batch leaves 29 August.`

Purpose:
- give returning / high-intent prospects a real cost of delay;
- convert operational batching into truthful urgency;
- preserve premium positioning without additional discounting.

Timing:
- availability message can run through the cycle while true;
- stronger deadline language is most useful in the final ~3–5 days before the dispatch cutoff;
- immediately roll to the next truthful date after cutoff.

Do not use a fake countdown or `offer ends Friday` unless the offer genuinely ends.

### P4 — Mechanism / product education

**Status:** high-priority after the first two propositions are understood.

Customer question:
> What is KRYO actually doing, and why is it worth AED 3,990?

Core territory:
- chills and holds its own water;
- does not depend on Dubai tap temperature;
- controlled temperature down to 1°C;
- KRYO Halo / high-coverage controlled flow;
- complete engineered system, not a shower accessory.

Purpose:
- reduce category confusion;
- justify premium price;
- serve prospects who have seen the product but still do not understand the mechanism.

Best creative format:
- real product demonstration / product-in-use video when available;
- until then, use strongest existing real product imagery.

### P5 — Proof / real user experience

**Status:** high-value once customer assets are credible enough.

Customer question:
> Does this actually work for people like me?

Core territory:
- tester/customer 5°C / 45-sec usage;
- actual bathroom installation;
- real user reaction;
- authentic comparison with cold-plunge experience.

Do not use generic praise or imply founder testimony is independent customer proof.

### P6 — Sauna / contrast user

**Status:** strategic market-discovery angle after core morning/category ads are stable.

Customer question:
> I already value heat/cold exposure. Is KRYO a better fit for my routine?

Purpose:
- test a market with higher category awareness and potentially higher willingness to pay;
- should eventually use a matched landing-page treatment if the ad shows promise.

## 5. Active-ad count at current spend

At approximately **$30/day total ad-set spend**, default to:

- historical control;
- one meaningful challenger.

Two active proposition ads is enough to learn without starving each ad of delivery.

Do not load five or six experimental ads into a $30/day ad set.

A third ad is justified temporarily when it is **time-sensitive** and commercially important, e.g. a dispatch-deadline creative in the final days of a genuine batch window.

## 6. Fast cut / keep framework

### Data requirement before any decision

Do **not** cut or scale an ad from onsite data alone.

Fresh same-day Meta data must be visible for:

- spend;
- impressions;
- link clicks;
- CTR;
- CPC;
- LPVs;
- Meta ATC / IC if available.

Join that to fresh first-party Supabase / Shopify data for:

- correct landing destination;
- cart progression;
- checkout;
- orders / revenue;
- session number / return behaviour where available.

If Meta→Supabase metrics are stale, the experiment is **observable but not fully decisionable**. Fix/read Meta before changing budgets based on economics.

### 10 LPVs

Diagnostic only.

Inspect:
- correct destination;
- CTR / CPC / CPLPV vs live control;
- obvious ATC / checkout signal;
- no tracking failure.

Do not kill a challenger just because it has zero purchases.

### 20–30 LPVs

Early commercial filter.

Pause / investigate if:
- zero ATCs after ~30 valid LPVs;
- AND traffic economics are materially worse than live control;
- AND there is no compensating checkout / assisted-sales signal.

If a challenger has at least one ATC / IC and acceptable traffic economics, keep collecting data.

### ~50 LPVs

Meaningful early decision point.

Strong keep signal:
- LPV→ATC roughly >=8%; OR
- cost/ATC close to / better than live control;
- checkout quality not obviously worse.

Strong pause signal:
- LPV→ATC <4%;
- AND cost/ATC >~2x live control;
- AND no initiate checkout / assisted conversion compensation.

### 100+ LPVs

Now compare:
- cost/LPV;
- cost/ATC;
- LPV→ATC;
- cost/IC;
- LPV→IC;
- mature purchases after lag;
- assisted WhatsApp revenue.

If a challenger is materially weaker on both traffic and downstream intent, pause it.

If it is more expensive at LPV but materially cheaper at ATC / checkout, it can still be a winner.

## 7. Important same-ad-set interpretation rule

Same-ad-set performance is not randomized.

Meta chooses delivery based on predicted outcome, so:

- different ads may receive different audiences / auction opportunities;
- spend allocation itself is information about Meta's estimated opportunity;
- raw conversion rates cannot be treated as unbiased causal effects.

This is acceptable during performance discovery because the business question is:

> Which eligible creative produces the best economics when Meta is allowed to optimize?

Use Meta Experiments only when we need a causal answer after a candidate proves commercial value.

## 8. Return-session measurement

Because KRYO is multi-session, future reporting should segment outcomes where data permits:

- first known paid session;
- session 2;
- session 3+;
- days from first paid touch;
- first-touch ad;
- most recent paid ad;
- final pre-purchase ad / session;
- WhatsApp-assisted vs direct purchase.

This is not a request for new infrastructure if the existing attribution tables can calculate it. Query the data first; only engineer if the current schema genuinely cannot answer it.

The purpose is to learn whether certain angles disproportionately appear:

- early in discovery;
- during education;
- immediately before conversion.

Do not assume this sequencing exists until the data demonstrates it.

## 9. Recommended immediate sequence

1. Keep `Winner | Plunge is Dead` live.
2. Retest `Winner | Morning Grogginess` in the same winning Purchase ad set.
3. Increase ad-set budget only when live Meta economics are visible and healthy.
4. Deploy Control v2 baseline improvements.
5. In the final 3–5 days before the next genuine dispatch cutoff, test a truthful Dispatch Deadline creative in the same ad set if budget permits.
6. Next evergreen challenger after Morning: mechanism / product education.
7. Later: real-user proof, sauna/contrast.

## 10. Sources

### Meta

- Meta, Simplify Your Ad Set Structure: https://www.facebook.com/business/ads/ad-set-structure
- Meta, Performance Marketing / Performance 5: https://www.facebook.com/business/ads/performance-marketing
- Meta, Expand Your Ad Creative Strategy: https://www.facebook.com/business/ads/ad-creative

### Multi-session / retargeting / repeated exposure research

- Xu, Duan & Whinston (2014), *Path to Purchase: A Mutually Exciting Point Process Model for Online Advertising and Conversion*, Management Science: https://pubsonline.informs.org/doi/10.1287/mnsc.2014.1952
- Sahni, Narayanan & Kalyanam, *An Experimental Investigation of the Effects of Retargeted Advertising: The Role of Frequency and Timing*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2852484
- Johnson, Lewis & Nubbemeyer (2017), *Ghost Ads: Improving the Economics of Measuring Online Ad Effectiveness*: https://papers.ssrn.com/sol3/Papers.cfm?abstract_id=2620078
- Li, Luo, Lu & Moriguchi, *The Double-Edged Effects of E-Commerce Cart Retargeting: Does Too Early Retargeting Backfire?*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3703691
- *Evaluating multimedia advertising campaign effectiveness* (Decision Support Systems, 2024): https://www.sciencedirect.com/science/article/pii/S0167923624001817

## 11. Confidence grading

- Preserve consolidated winning ad set: **high**.
- Morning Purpose is the first challenger to retest: **high**, because it has strategic fit plus a small historical downstream signal.
- Dispatch-deadline pre-frame can matter for returning buyers: **medium-high**, supported by truthful urgency logic and multi-session evidence, but must be tested in KRYO.
- Different ads automatically serve deterministic funnel stages: **rejected**.
- Different creatives can influence different moments across a multi-session path: **medium-high**.
- Fast kill rules based on current live control economics: **high**, provided Meta data is fresh.
