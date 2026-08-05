# KRYO Growth Operating System — August 2026

**Canonical growth/marketing operating reference.**

Last consolidated: 2026-08-05.

This document supersedes older KRYO marketing/page-build assumptions where they conflict with live Shopify, live Supabase, or the current strategy below.

## 1. Authority and execution rules

Source-of-truth order for current performance and commerce state:

1. **Shopify live** — product, variant, price, inventory, collection membership, theme assignment, cart/checkout state.
2. **Supabase live** — Meta ingestion, funnel events, attribution, Clarity/GA4 joins, experiment records and historical performance.
3. **Meta MCP/live Meta** — delivery/status/configuration when turning ads on or changing Meta objects.
4. **GitHub** — implementation understanding and human-readable operating references, not current commerce/performance truth.

Rules:

- Query live Shopify/Supabase before making a current-performance claim.
- Codex is implementation-only after the change is fully specified.
- Do not ask Codex to rediscover marketing strategy, capabilities, IDs, files, image libraries, inventory, or analytics if ChatGPT/connectors can resolve them first.
- Every execution follows **read → exact change → reread → PASS/FAIL**.
- A tool reporting success is not proof. Re-read the actual live resource after the write.
- Do not build new infrastructure, dashboards, agents, or experiment frameworks when existing systems already solve the problem.
- Paid experiments should produce sales and learning. Avoid low-ceiling micro-CRO while traffic is limited.

## 2. Current live KRYO control — commerce truth

### Winning product

- Product: `gid://shopify/Product/9334472311092`
- Handle: `kryo2`
- Variant: `gid://shopify/ProductVariant/49131658805556`
- Status: ACTIVE
- Base Shopify price: AUD 1,505
- Dubai market offer observed: AED 3,990
- Dubai compare-at observed: AED 5,490
- Product has one sellable variant.

### Live theme

- Theme: `EverestLabs Co v14.0.0.005_opt`
- Theme GID: `gid://shopify/OnlineStoreTheme/167131775284`
- Role: MAIN
- Product template: `templates/product.kryo-2-2-track-cta2.json`
- Cart template: `templates/cart.json`
- Homepage template: `templates/index.json`
- Cart type: page, not drawer.

### Inventory state observed 2026-08-05

- Guangzhou on hand: 3
- Committed: 2
- Available / online sellable: 1
- Variant `inventoryPolicy = DENY`
- Variant currently available for sale.

Implication: after the currently sellable unit is purchased, checkout can stop accepting further KRYO orders unless inventory/sellability is intentionally changed. This must be resolved or explicitly accepted before meaningful paid scale.

### Failed product / page

- Product: `gid://shopify/Product/9343152718132`
- Handle: `kryo2_`
- This was the multivariable challenger and is **not** the control.
- Do not use it as the normal storefront destination or as a source of inventory truth.

## 3. Control restoration state and known remaining manual fixes

As of the 2026-08-05 audit, the following live MAIN-theme items were still unresolved because the connected Shopify MCP can read the MAIN theme but cannot write theme files to the published MAIN theme:

1. Homepage hero KRYO link still points to `shopify://products/kryo2_`.
2. Lower homepage KRYO Shop Now link still points to `shopify://products/kryo2_`.
3. `templates/cart.json` section `kryo-clone-gift-clean` is still disabled.
4. Enabled Downpay form embed still contains: `You will be charged 50% today and the balance after on the 15th July.`

Recommended minimal corrections before relaunch:

- Both homepage KRYO links → `shopify://products/kryo2`.
- Enable only `kryo-clone-gift-clean`; do not enable old popup versions.
- Downpay help copy → `50% today. Balance before dispatch.`
- Resolve/accept the one-unit sellability constraint.

The winning product page dispatch line was intended to stay as close to the historical winner as possible, with only July → August date correction:

`August 15 | August Dubai batch almost full.`

Do not casually rewrite the rest of the control while revalidating it.

## 4. Cart and checkout audit

Verified architecture:

- Hero direct ATC targets the winning variant.
- Sticky ATC paths target the winning variant.
- Complete-system CTA targets the winning variant.
- Standard Shopify product form uses the current winning variant.
- Cart checkout button is standard Shopify checkout.
- Singapore-specific checkout override does not apply to UAE traffic.
- Performance Flow Upgrade exists and has an active Shopify Buy-X-Get-Y configuration that includes the winning KRYO product.
- `kryo-clone-gift-clean` is the current relevant cart helper for inserting the upgrade before checkout; historical popup variants are obsolete.
- Cart includes KRYO support/WhatsApp pathways; avoid introducing new competing hero support CTAs during control revalidation.

## 5. Historical Meta control — verified benchmark

Historical winner:

- Ad name: `Winner | Plunge is Dead`
- Ad ID: `120249120433950279`
- Creative ID: `1315539106682077`
- Source ad set: `120247331328160279`
- Source campaign: `120242411668770279`
- Objective: Sales / Purchase / offsite conversions.
- The winning ad is **dynamic creative**, not a single fixed text ad. Preserve the real creative structure when cloning it.

Historical result:

- Spend: 303.61
- Impressions: 14,272
- Clicks: 864
- Landing-page views: 470
- ATCs: 47
- Initiate checkouts: 10
- Purchases: 3
- Revenue: 4,650.76
- CTR: 6.05%
- CPC: 0.35
- CPLPV: 0.65
- LPV → ATC: **10.00%**
- LPV → IC: **2.13%**
- Cost / ATC: **6.46**
- Cost / IC: **30.36**
- CPA: **101.20**
- ROAS: **15.32x**

Purchase lag observed across the three buyers: approximately 6 days, 3 days and 1 day, with roughly three sessions on average. Historical buyers clustered near the advertised dispatch/cutoff window. This is directional evidence that real operational deadlines can matter, but n=3 is not enough to treat it as proven causality.

## 6. Failed multivariable challenger — what actually happened

Failed Meta destination/ad:

- Ad: `(2_) LP - Winner | Plunge is Dead`
- Failed page: `/products/kryo2_`
- Spend: 74.72
- LPVs: 99
- ATCs: 1
- IC: 0
- Purchases: 0
- CPLPV: 0.75
- LPV → ATC: **1.01%**
- Cost / ATC: **74.72**

Control benchmark during historical winning period: 10% LPV → ATC and 6.46 cost/ATC.

The failed page simultaneously changed many mechanisms:

- dispatch timing / lead time
- deadline urgency → quantity scarcity
- one product option → three model tiers
- direct ATC → scroll/select decision
- sticky CTA behaviour
- cart popup/checkout incentive flow
- WhatsApp prominence
- testimonials
- what-is-in-the-box / featured media
- model-selection CTA routing

Conclusion: **the package failed badly; individual elements cannot be causally blamed.** The strongest directly observable issue is decision/purchase-path complexity, because the user had to make more decisions before ATC.

Do not conclude that testimonials, WhatsApp, or what-is-in-the-box individually failed.

### Clarity warning

Control:

- average scroll ~39.5%
- average engagement ~42.5 sec

Failed page:

- average scroll ~71.2%
- average engagement ~97.7 sec

Despite much deeper engagement, ATC collapsed to ~1%.

**Rule: more reading/scrolling is not success.** It can mean the page is creating decision work. Purchase intent and downstream economics matter more.

## 7. Current positioning and copy rules

KRYO is a premium new category.

Primary public positioning:

- `The cold immersion system built for sharper mornings.`
- `Step in tired. Step out switched on.`
- `1°C cold immersion at the press of a button.`
- `Wakes you up in 30 seconds` may be used as an immediate-experience claim where appropriate, but avoid turning it into an unsupported medical or productivity guarantee.

Approved strategic language/themes:

- From half-awake to switched on.
- Wake the body before coffee.
- Own the first 30 minutes.
- Built for mornings that cannot start slow.

Avoid publicly reducing KRYO to:

- cold plunge alternative
- cold shower upgrade
- shower attachment
- shower format
- cold hit
- serious cold

Comparison to cold plunges may be used deeper in the page/value argument, but KRYO should not be introduced as merely a cheaper substitute.

Avoid:

- `change state`
- em dashes in public KRYO copy
- fake scarcity or invented dates
- unsupported medical claims
- `dopamine hit for hours`
- `100% benefit`
- guaranteed neurological outcomes
- quantified productivity/time-saved claims without evidence
- claiming KRYO replaces coffee/supplements unless customer evidence supports the statement

## 8. Strategic messaging hypothesis

The main commercial bottleneck is likely not button-level CRO. Cold Meta visitors need to understand an unfamiliar AED 3,990 product fast enough to:

1. recognise the problem as personally relevant;
2. understand what KRYO is;
3. understand why it exists;
4. understand how the engineered system works;
5. justify the premium;
6. trust the product/company;
7. feel safe buying;
8. have a truthful reason to act now.

High-value hypothesis: a specific buyer preframe can make the visitor feel `this was built for me` before the page asks for the purchase.

Leading candidate persona:

**Morning Groggy / Time-Critical High Performer**

Situation rather than diagnosis:

- wakes up but remains foggy/groggy
- cannot afford a slow first 30–60 minutes
- values time and reliable immediate effects
- may already use coffee/supplements but does not need a medical sleep claim

Do not target people with medical sleep-disorder language in Meta ads.

Secondary future segment:

**Sauna / contrast user**

Potentially high willingness to pay, already understands cold exposure, and may need less category education. This should be tested as a separate matched funnel, not mixed equally into the main hero.

Other secondary use case:

Dubai heat / post-gym cooling. Real use case, but currently lower strategic priority than the primary morning/cold-immersion buyer.

## 9. Premium justification / mechanism story

KRYO should be understood as a complete engineered system rather than an expensive bathroom accessory.

Customer mental model:

- active cooling/refrigeration core
- compact chilled-water reservoir / own chilled-water supply
- controlled flow/pressure
- KRYO Halo delivering controlled cold across the upper body
- compact bathroom integration designed around repeated daily use

Engineering story:

- over a year of development
- many Halo/nozzle/coverage configurations tested
- designed around compactness, setup, repeated use and integration into an existing morning routine

Use the exact current hardware/spec values from live product/manufacturing sources before publishing technical numbers. Specs have evolved during development.

## 10. Category-leader research translated to KRYO

Observed patterns across Eight Sleep, Tonal, Oura, Therabody, Plunge and Baymard research:

- Lead with one dominant category-level job, then expand into secondary use cases.
- Explain how the unfamiliar system works.
- Show what engineering/hardware the buyer is paying for.
- Real product demonstration near the purchase flow is high leverage.
- Video supplements, rather than replaces, strong static imagery because many visitors will not watch.
- Premium products require strong risk reversal, shipping/returns clarity and tangible proof.
- Multiple similar choices increase decision difficulty when preferences are uncertain; relevant to the failed three-tier KRYO page.

Recommended general page hierarchy:

Hero → buy/risk-reversal → demo/proof → why KRYO exists → how the system works → authentic customer proof → secondary scenarios → complete system/what is included → setup → trial/guarantee → truthful urgency → final purchase + subordinate support.

## 11. Experiment doctrine at current traffic

Low traffic means tiny tests take too long. Prefer coherent, high-ceiling experiments capable of roughly 30%+ movement.

A coherent full-funnel bundle is acceptable when every changed element solves the same psychological bottleneck, e.g. persona preframe in ad + matched first-page sections.

Do not run a 2×2 factorial at ~$50/day.

Do not simultaneously run many independent page/creative tests against the same small traffic pool.

Keep Meta optimisation on Purchase/Sales unless there is a specific reason to change it. Do not switch to ATC merely to accelerate learning.

### Metrics

For a full-funnel ad + matched-page test:

1. **Primary leading metric: cost per ATC**
2. LPV → ATC
3. Cost / IC and LPV → IC
4. Purchases / CPA / ROAS / revenue per LPV

Diagnostics only:

- CTR
- CPC
- CPLPV
- scroll depth
- time on page

A lower CTR can still be a win if it filters for substantially higher purchase intent.

### Historical traffic economics

Historical CPLPV ~0.65–0.75.

At $50/day total and 50/50 split, expected LPVs are roughly 67–77/day total, or ~33–38/day/arm.

Approximate checkpoints:

- 100 LPVs/arm: ~2.6–3 days — safety only
- 250 LPVs/arm: ~6.5–7.5 days — directional
- 500 LPVs/arm: ~13–15 days — normal decision target

### Predeclared stop rules

Tracking failure:

- Pause affected arm; fix tracking; do not classify marketing result.

Catastrophic early kill after ≥100 LPVs/arm:

- treatment cost/ATC ≥2× control
- AND treatment LPV→ATC ≤60% of control
- AND no compensating checkout signal

Strong directional treatment after ≥250 LPVs/arm and ≥7 complete days:

- cost/ATC ≥25% lower than control
- LPV→ATC ≥30% higher
- LPV→IC not >15% worse

Ship new control around ~500 LPVs/arm only if:

- cost/ATC ≥25% lower
- LPV→ATC ≥30% higher
- checkout quality neutral/better
- mature purchase/CPA/revenue does not contradict the result

10–25% economic improvement: ITERATE rather than automatically replacing control.

<10% improvement or worse at the decision sample: REVERT.

## 12. Current experiment pipeline

Maintain three operational states at all times:

- **RUNNING** — one main commercial experiment consuming meaningful traffic.
- **READY NEXT** — fully specified and deployable immediately after current verdict.
- **BACKLOG** — ranked hypotheses awaiting evidence/dependency.

### P0 — restore/revalidate proven control

Category: baseline / measurement / revenue recovery.

Goal: get the exact proven `kryo2` funnel and historical winner delivering again, verify fresh tracking and establish a current baseline before interpreting new treatments.

Tomorrow sequence:

1. Resolve remaining control fixes and sellability.
2. Read live Shopify and Meta before write.
3. Restore/activate historical winner without changing creative/audience/optimisation.
4. Re-read live Meta and destination after activation.
5. Confirm fresh Meta/Supabase data starts arriving.
6. Watch for catastrophic funnel failure quickly.

Historical reference: cost/ATC 6.46, LPV→ATC 10%.

### P1 — Morning Purpose matched funnel

Category: persona / messaging / category comprehension.

Control: historical anti-tub winner + current winning page.

Treatment: same media/product/offer/purchase mechanics, but ad preframe + first ~20–25% of page communicates:

- built for mornings that cannot start slow
- why KRYO exists
- own chilled-water supply
- engineered system / KRYO Halo
- premium value / routine integration

Primary: cost/ATC.

This is the highest-priority new proposition test once P0 is healthy.

### P2 — Real product demo + proof package

Category: education / trust.

Hypothesis: a 45–60 sec real KRYO demonstration plus mechanism proof reduces unfamiliar-product uncertainty and premium-price skepticism.

Dependency: usable real video asset.

Do not replace all static proof; video supplements it.

### P3 — Morning vs Sauna/Contrast market

Category: persona / market discovery.

Matched funnels:

- Morning/time-critical buyer
- Sauna/contrast buyer

Purpose: determine whether sauna owners have higher willingness to pay and lower education burden.

### P4 — Urgency architecture

Category: offer / urgency.

Test truthful near-term dispatch deadline vs truthful unit-allocation scarcity.

Never invent stock/date. Historical n=3 is directional in favour of a real dispatch deadline, not proof.

### P5 — Purchase + WhatsApp assisted conversion

Category: assisted sales / UX.

Test purchase-dominant page with subordinate `check fit/availability` or expert WhatsApp path.

Judge on qualified leads and eventual assisted revenue, not WhatsApp clicks alone.

Do not place an equal-weight WhatsApp CTA beside the primary hero purchase CTA.

### P6 — Premium value / price justification

Category: value framing / copy.

Potential frames:

- engineered system
- space/routine/maintenance advantage
- immediately felt experience
- founding/current allocation price if operationally true
- deeper cold-plunge economics comparison

Avoid unsupported quantified productivity/health promises.

### Backlog

- Dubai heat/cooling persona
- setup/electrical reassurance
- small CTA/layout micro-CRO
- email capture/retargeting once proof/video exists

Re-rank the pipeline after every completed test. Do not blindly execute the original queue when evidence changes the commercial hypothesis.

## 13. Meta launch and monitoring protocol

Before activation:

- verify Shopify destination and sellability
- verify correct price/currency
- verify exact historical ad/campaign/ad-set objects live in Meta
- verify Purchase optimisation/pixel/dataset
- verify UTMs / Meta IDs will flow into attribution
- verify no competing active ads contaminate the intended experiment

After activation:

- reread Meta status and destination
- confirm impressions/spend begin
- confirm LPVs and ATCs reach Supabase
- verify data freshness rather than assuming scheduled ingestion is current

As of 2026-08-05, `meta_ad_metrics_daily` in Supabase was fresh only through 2026-08-01. Do not treat Supabase as real-time tomorrow until a fresh post-launch row proves ingestion is current.

Fast health guidance for restored control:

- technical/tracking failure: stop immediately
- ~25 LPVs: inspect only, do not overreact
- ~50 LPVs with 0–1 ATC: abnormally weak versus historical 10%, investigate quickly
- ~100 LPVs with LPV→ATC still under ~6% plus materially worse traffic economics: pause/investigate rather than continuing blindly

These control-revalidation rules are separate from the slower 100/250/500-per-arm A/B decision rules.

## 14. Codex execution doctrine

Use Codex only when implementation is clearly specified.

Preferred model for bounded deployment tasks: GPT-5.6 Terra, Medium reasoning, unless a materially harder engineering problem requires more.

Codex prompt structure:

- exact objective
- exact resource IDs / filenames
- exact old → new values
- exact forbidden scope
- hard stop on unsupported operation
- terse completion output

Do not let bounded Shopify jobs spend minutes reading broad project markdown/runbooks. If the task is deterministic, the spec should tell Codex exactly which resource to touch.

Important capability lesson:

- The connected Shopify MCP can read the published MAIN theme but its theme file write operations are blocked on MAIN/published themes.
- Do not instruct Codex to waste time debugging OAuth/curl/Shopify CLI as a fallback.
- MAIN theme file edits may require Shopify Admin/browser or an already-configured separate theme deployment path.
- Shopify MCP can still be used for live reads and supported Admin resource writes.

Do not trust a Codex `DONE` message without rereading Shopify/Meta independently.

## 15. Current technical/data assets already available

Existing system already contains:

- `marketing_experiments`
- `experiment_daily_metrics`
- `experiment_readouts_daily`
- `testing_schedule_view`
- `marketing_guardrail_alerts`
- `meta_ad_metrics_daily`
- `meta_ad_metrics_hourly`
- `meta_ads`
- `meta_adsets`
- `meta_campaigns`
- `attribution_touches`
- `kryo_funnel_daily`
- `kryo_pdp_session_quality`
- KRYO Clarity/session quality views
- WhatsApp event/conversation tables

Do not create a new experiment database or dashboard to run the August programme. Use these existing tables.

Storefront attribution already captures UTMs, Meta IDs, landing URL and key journey events. Preserve existing ATC tracking rather than rebuilding it.

## 16. Product/media assets already available

Shopify Files has adequate static assets for upcoming tests, including current hero/product shots, Halo close-ups, bathroom UGC, complete-system/flat-lay, what-is-in-the-box, sauna lifestyle and setup images.

Experiment P1 does not require a new image. Freeze the historical media so the proposition is the main changed variable.

P2 depends on real demonstration footage rather than another generated image.

## 17. Learning discipline

Every experiment close must record:

- hypothesis
- control
- treatment
- exact dates
- spend
- LPVs / sessions
- ATCs
- checkouts
- purchases
- revenue
- primary metric result
- downstream guardrails
- data-quality status
- decision: keep / revert / iterate / inconclusive / tracking failure
- what was learned
- next experiment

A failed multivariable package can teach that the package failed, but it cannot assign blame to individual components.

Revenue is the final truth; leading metrics exist to learn faster, not to replace purchase economics.

## 18. Superseded context warning

Historical KRYO context from April/May contains obsolete handles (`kryo_`), old specs, retired messaging and old page-build workflows. It must not be treated as current marketing truth.

Stable Supabase context keys are being redirected/updated as part of the August 2026 consolidation so future agents load this operating state instead of the obsolete assumptions.
