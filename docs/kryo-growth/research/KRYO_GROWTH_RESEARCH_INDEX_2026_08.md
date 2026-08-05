# KRYO Growth Research Index — August 2026

**Status:** navigation / precedence index for KRYO growth research.

Use these documents together with the canonical `docs/kryo-growth/KRYO_GROWTH_OS_2026_08.md`.

Where these newer research notes explicitly revise an experiment-execution method, the newer note takes precedence for that narrow question. Live Shopify / live Meta / live Supabase remain the source of truth for current operational state and performance.

## 1. Meta creative testing & multi-visit funnel

`KRYO_META_CREATIVE_TESTING_AND_MULTIVISIT_FUNNEL_2026_08.md`

Use for:
- existing winning ad set vs new ad sets;
- creative/pre-frame discovery;
- multi-session buyer logic;
- when to use Meta Experiments;
- discovery vs causal validation.

**Key decision:** discovery first inside the consolidated winning Purchase ad set; controlled splits only for finalists / high-value causal questions.

## 2. Pre-frame experiment matrix & kill rules

`KRYO_PREFRAME_EXPERIMENT_MATRIX_AND_KILL_RULES_2026_08.md`

Use for:
- exact pre-frame priorities;
- historical ad-level evidence;
- Morning Purpose retest logic;
- dispatch deadline creative;
- mechanism / education / proof angles;
- how many ads to run at current spend;
- 10 / 30 / 50 / 100-LPV keep/pause rules;
- first-touch vs later-session learning.

**Current priority:** preserve `Winner | Plunge is Dead`, retest `Winner | Morning Grogginess`, then use truthful Dispatch Deadline creative near real cutoffs.

## 3. Fortnightly dispatch urgency system

`KRYO_FORTNIGHTLY_DISPATCH_URGENCY_SYSTEM_2026_08.md`

Use for:
- real two-week Dubai dispatch cadence;
- stock scarcity vs time scarcity;
- page copy by phase of the dispatch cycle;
- deadline creative timing;
- what is / is not truthful urgency;
- measuring whether deadlines close returning prospects.

**Key decision:** replace rolling fake urgency with current allocation + next dispatch + next-after-that dispatch when operationally true.

## 4. Funnel diagnosis & experiment priority

`KRYO_FUNNEL_DIAGNOSIS_AND_EXPERIMENT_PRIORITY_2026_08.md`

Use for:
- current/historical funnel drop-offs;
- what each experiment is actually trying to improve;
- metric tree from auction → LPV → ATC → IC → purchase;
- multi-session / assisted metrics;
- ranked next experiments as spend scales.

**Key decision:** optimise the multi-session decision system, not only first-click conversion.

## 5. Premium PDP competitor benchmark

`KRYO_PREMIUM_PDP_BENCHMARK_EIGHTSLEEP_PLUNGE_2026_08.md`

Use for:
- Eight Sleep / Plunge funnel patterns;
- KRYO PDP trust and information gaps;
- product imagery / what's included;
- trial / returns / delivery placement;
- social proof;
- expert assisted sales;
- demonstration / mechanism proof.

## 6. Assisted conversion

`KRYO_ASSISTED_CONVERSION_WHATSAPP_AND_EXIT_INTENT_2026_08.md`

Use for:
- WhatsApp / live sales support architecture;
- persistent multi-session conversation logic;
- placement and visual hierarchy;
- what to measure;
- whether / how to test exit-intent capture.

**Key decision:** WhatsApp expert support belongs in the baseline as a subordinate path; exit intent remains a later measured experiment.

## 7. Control v2 execution spec

`KRYO_CONTROL_V2_PRETEST_UPGRADE_2026_08.md`

Use for:
- exact high-confidence page upgrades to deploy before a major split test;
- what must remain unchanged;
- what must not be imported from `kryo2_`;
- revised creative exploration;
- later matched Morning landing-page candidate.

## 8. Authority order

For decisions, use this order:

1. **Live Shopify** — current product, inventory, price, variant, theme and commerce truth.
2. **Live Meta** — current delivery, ads, ad-set configuration, budget and optimisation.
3. **Live Supabase** — current ingested metrics / attribution when freshness is proven.
4. **These August research notes** — evidence-based decision doctrine.
5. **Canonical KRYO Growth OS** — broader strategy and historical benchmark.
6. Older KRYO docs — historical context only where not superseded.

## 9. Measurement gate

At the time these notes were expanded on 5 August 2026:

- first-party `attribution_touches` were receiving fresh paid Meta sessions;
- `meta_ad_metrics_daily` freshness reported data through 1 August / update on 2 August;
- same-day full Meta economics were not yet proven fresh in Supabase.

Therefore:

> **Do not cut, scale or classify ads from spend/CTR/CPC/CPLPV until current Meta delivery data is directly readable or proven fresh in Supabase.**

Onsite funnel data can still detect technical failures and directional intent.

## 10. Immediate experiment sequence

### Baseline

Deploy Control v2:
- truthful allocation + dispatch timing;
- stronger product gallery;
- transparent tester/customer proof;
- 30-day trial + free Dubai delivery/returns at buy decision;
- one subordinate WhatsApp specialist route;
- preserve one model, direct ATC, Downpay, free-upgrade popup and checkout.

### Creative discovery

Inside the existing winning Purchase ad set:
- keep historical `Winner | Plunge is Dead`;
- retest `Winner | Morning Grogginess`;
- use proven visuals / coherent proposition;
- point initially to Control v2;
- judge cost/ATC, LPV→ATC, checkout and mature purchase economics once Meta data is fresh.

### Dispatch-window creative

In the final ~3–5 days before a genuine two-week dispatch cutoff:
- make current dispatch date prominent;
- state next scheduled dispatch;
- use current live allocation if accurate;
- optionally allow a temporary third creative if budget / delivery supports it.

### Next evergreen challenger

Mechanism / product education:
- own chilled-water supply;
- 1°C control;
- KRYO Halo;
- engineered system;
- ideally real demonstration footage.

### Major validation test

Only after a pre-frame demonstrates commercial signal:
- build a matched first-20–25% landing-page treatment;
- use controlled Meta Experiment only if causal certainty is worth the delivery-efficiency cost.

### Later assisted-conversion experiment

Targeted exit-intent → WhatsApp specialist after meaningful engagement, with no extra discount by default.
