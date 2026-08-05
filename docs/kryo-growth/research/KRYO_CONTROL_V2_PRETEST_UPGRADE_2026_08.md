# KRYO Control v2 — High-Confidence Pre-Test Upgrade — August 2026

**Status:** execution source of truth for the next baseline upgrade to `/products/kryo2` before any major landing-page split test.

**Goal:** improve the commercial quality of the proven control using changes with strong research support and low downside, while preserving the buying mechanics that produced the historical ~10% LPV→ATC control benchmark.

## 1. Principle

Do not spend weeks A/B testing obvious hygiene improvements.

**Ship high-confidence baseline improvements. Test only high-uncertainty, high-upside commercial hypotheses.**

The failed `/products/kryo2_` challenger is evidence that KRYO should not simultaneously change choice architecture, purchase flow, urgency, social proof, media, assisted sales and fulfilment timing.

Control v2 therefore upgrades trust/tangibility/reassurance while preserving the proven direct-buy architecture.

## 2. Live commerce truth at time of research

- winning product: `/products/kryo2`
- one sellable variant
- winning variant ID: `49131658805556`
- current Shopify inventory observed: **7 units**
- inventory policy: DENY
- product currently available for sale

Any stock-count copy must be reread from Shopify immediately before deployment and updated after sales so scarcity remains truthful.

## 3. Keep unchanged

Do **not** change:

- one-model architecture;
- AED 3,990 Dubai selling price / current offer unless separately approved;
- direct hero Add to Cart → cart;
- direct sticky Add to Cart → cart;
- Purchase CTA hierarchy;
- Downpay 50% deposit path;
- 30-day risk-free trial;
- Performance Flow Upgrade;
- free-upgrade cart popup;
- cart/checkout flow;
- core lower-page KRYO education;
- Meta Purchase optimisation.

## 4. High-confidence live changes

### Change A — truthful allocation scarcity

Remove recurring generic urgency such as:

- `OFFER ENDS FRIDAY`

Replace with current operational truth.

At research time Shopify shows 7 sellable units, therefore a truthful example is:

> **7 OF 10 AUGUST DUBAI ALLOCATIONS REMAIN**

If the dispatch date is operationally confirmed, display it separately as an explicit date.

Do not use a date or stock count simply because it existed on `kryo2_`.

**Reason:** availability scarcity is more defensible and more credible than permanently resetting deadline language. Research/case evidence also suggests generic urgency can hurt while availability scarcity can help.

### Change B — stronger product gallery

Bring the existing challenger assets into the winner's main product media/gallery:

- `kryo-whats-in-the-box.webp`
- `kryo-front-view.webp`
- `kryo-side-view.webp`

Do not add a separate long gallery section purely to repeat the same information.

**Reason:** users need immediate tangible evidence of what the AED 3,990 system physically includes. Baymard treats included-accessory imagery as decision-relevant when accessories are a meaningful part of value.

### Change C — tester/customer proof

Bring the existing `kryo2_` testimonial block into the winner:

- source block: `ai_gen_block_5edb068_GqHjBY`
- source template: `templates/product.kryo2_.json`

Preferred placement:

> directly after `What makes KRYO different?` and before the comparison / deeper evaluation sections.

Requirements:

- keep quotes specific;
- do not imply the founder is an independent customer;
- label people transparently as customer / tester / founder where applicable;
- use real imagery when available.

**Reason:** KRYO is a novel high-ticket product with limited existing social proof. On-site DTC testimonials are not enough to create full trust, but specific authentic user proof is a clear improvement over none.

### Change D — purchase reassurance next to ATC

Near the main purchase controls, add one concise line:

> **30-day risk-free trial · Free Dubai delivery & returns**

Do not create another large trust section.

Only include warranty language if the exact warranty is operationally confirmed.

**Reason:** Eight Sleep and Plunge repeat trial/delivery/returns/warranty at the buy decision; Baymard specifically finds shipping information is more likely to be seen when placed near the Buy section.

### Change E — assisted-sale WhatsApp, subordinate to purchase

Replace/refine the generic lower expert-chat path into a single persistent WhatsApp specialist route.

Preferred buy-area wording:

> **Questions about fit, setup or delivery? WhatsApp a KRYO specialist.**

Hierarchy:

- Add to Cart remains the dominant button.
- WhatsApp is a tertiary text link, not an equal-weight button.

Optional one lower-page repeat after setup/FAQ:

> **Still unsure whether KRYO fits your bathroom? Check fit and current Dubai availability on WhatsApp.**

Do not reproduce the challenger pattern of hero + midpage + buybox + cart WhatsApp CTAs.

**Reason:** high-ticket competitors provide sales specialists, academic ecommerce evidence supports live assistance, and WhatsApp gives KRYO a persistent multi-session conversation thread. The risk is not the channel; the risk is letting the channel compete with checkout.

## 5. Do not ship yet

### Exit-intent popup

Do not include in Control v2.

Create later as a dedicated assisted-conversion experiment once baseline WhatsApp tracking exists.

Suggested future treatment:

> `Not ready to order? Check fit and current August availability with a KRYO specialist.`

Trigger only after meaningful engagement and exit behaviour; suppress after ATC/WhatsApp; never show on checkout.

### Three models

Do not import Standard / Pro / Studio choice architecture.

### Scroll-to-buy

Do not replace direct Add to Cart with `Select Model & Order` / scroll-to-selector.

### Multiple WhatsApp CTAs

Do not import the challenger's multiple price-lock / availability calls to action.

### Longer fulfilment promise

Use the shortest truthful operational dispatch date. Do not deliberately extend it as a CRO test.

## 6. Research-informed planning expectation

No external research can prove an exact KRYO uplift before deployment. The figures below are planning priors, not guaranteed effects.

Historical winner benchmark:

- LPV→ATC ≈ 10%
- LPV→purchase ≈ 0.64% in the historical winning dataset

For the Control v2 package (scarcity + stronger gallery + authentic proof + buy-area reassurance + subordinate expert support), a reasonable planning prior is:

- **LPV→ATC:** approximately 11.5–12.5%
- central planning case: ~12%
- **LPV→purchase:** approximately 0.7–0.9% after purchase lag matures
- central planning case: ~0.8%

The additions overlap, so individual uplift estimates must not be summed.

The WhatsApp path may reduce pure ATC rate for a small subset while increasing eventual assisted revenue. Therefore final evaluation must include assisted sales, not only same-session ATC.

## 7. Ad changes before a major split test

Do not split the historical winning ad set solely to test copy.

After Meta/Supabase measurement is healthy:

1. keep the historical winning `Winner | Plunge is Dead` ad active and unchanged;
2. add **one** Morning Purpose challenger inside the same Purchase-optimised winning ad set;
3. preserve proven visual assets initially;
4. make all challenger copy coherent around the morning problem / `Step in tired. Step out switched on`;
5. point it initially to Control v2, whose hero already matches the morning outcome reasonably well;
6. compare ad-level cost/LPV, cost/ATC, LPV→ATC, checkout and mature purchase economics;
7. only build a dedicated matched Morning landing-page treatment once the pre-frame earns enough delivery / promising intent economics to justify it.

This is **performance discovery**, not a randomized split test.

## 8. Major split-test candidate after pre-frame discovery

If Morning Purpose performs well inside the winning ad set, the next major landing-page treatment should change only the first ~20–25% of Control v2:

- explicit eyebrow: `THE COLD IMMERSION SYSTEM BUILT FOR SHARPER MORNINGS`
- keep: `Step in tired. Step out switched on.`
- explicitly explain mechanism: KRYO chills its own water and delivers controlled cold through the Halo
- three-step mechanism summary
- short `Your day starts before your body feels ready` relevance section
- then rejoin the identical Control v2 page

Control and treatment would share:

- testimonials;
- gallery;
- price;
- allocation;
- trial / shipping / returns;
- WhatsApp support hierarchy;
- direct ATC;
- cart popup;
- checkout.

That isolates a much larger question: **does a matched morning-purpose acquisition + first-page comprehension package materially outperform the anti-plunge/category-disruption funnel?**

## 9. Sources

See companion research notes:

- `KRYO_META_CREATIVE_TESTING_AND_MULTIVISIT_FUNNEL_2026_08.md`
- `KRYO_PREMIUM_PDP_BENCHMARK_EIGHTSLEEP_PLUNGE_2026_08.md`
- `KRYO_ASSISTED_CONVERSION_WHATSAPP_AND_EXIT_INTENT_2026_08.md`

## 10. Approval / implementation rule

This file specifies the intended commercial changes. Codex should only implement after the exact live theme values/assets/placement are re-read and the named change set is approved.

Execution remains:

**read live → exact bounded write → live reread → PASS/FAIL**.
