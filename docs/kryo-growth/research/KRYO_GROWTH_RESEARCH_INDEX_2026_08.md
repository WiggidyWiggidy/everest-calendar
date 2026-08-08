# KRYO Growth Research Index — August 2026

**Status:** navigation / precedence index for KRYO growth research and execution doctrine.

Use these documents together with the canonical `docs/kryo-growth/KRYO_GROWTH_OS_2026_08.md`.

Where newer research notes explicitly revise an execution method, the newer note takes precedence for that narrow question. Live Shopify / live Meta / live Supabase remain the source of truth for current operational state and performance.

## 1. Baseline-change operating protocol

`docs/kryo-growth/operations/KRYO_BASELINE_CHANGE_PROTOCOL.md`

Use for:
- high-confidence non-experiment page changes;
- bugs/factual/hygiene fixes;
- research-operator → frozen task → Codex execution separation;
- duplicate-template preview and owner approval;
- production deployment, rollback and post-deploy monitoring;
- deciding when a change must instead be an experiment.

**Key rule:** research operator decides; Codex executes; owner approves; data decides keep/revert.

Reusable Codex Skill:
`.agents/skills/kryo-baseline-change/SKILL.md`

Frozen task template:
`marketing/baseline-changes/_TEMPLATE.md`

Current frozen task:
`marketing/baseline-changes/KRYO-BASELINE-20260806-01-CONTROL-V2.md`

## 2. Meta creative testing & multi-visit funnel

`KRYO_META_CREATIVE_TESTING_AND_MULTIVISIT_FUNNEL_2026_08.md`

Use for:
- existing winning ad set vs new ad sets;
- creative/pre-frame discovery;
- multi-session buyer logic;
- when to use Meta Experiments;
- discovery vs causal validation.

**Key decision:** discovery first inside the consolidated winning Purchase ad set; controlled splits only for finalists / high-value causal questions.

## 3. Pre-frame experiment matrix & kill rules

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

**Current priority after measurement is healthy:** preserve `Winner | Plunge is Dead`, retest `Winner | Morning Grogginess`, then use truthful Dispatch Deadline creative near real cutoffs.

## 4. Fortnightly dispatch urgency system

`KRYO_FORTNIGHTLY_DISPATCH_URGENCY_SYSTEM_2026_08.md`

Use for:
- real two-week Dubai dispatch cadence;
- stock scarcity vs time scarcity;
- page copy by phase of the dispatch cycle;
- deadline creative timing;
- truthful urgency boundaries;
- measuring whether deadlines close returning prospects.

**Key decision:** replace rolling fake urgency with current allocation + next dispatch + next-after-that dispatch when operationally true.

## 5. Funnel diagnosis & experiment priority

`KRYO_FUNNEL_DIAGNOSIS_AND_EXPERIMENT_PRIORITY_2026_08.md`

Use for:
- current/historical funnel drop-offs;
- what each experiment is trying to improve;
- metric tree from auction → LPV → ATC → IC → purchase;
- multi-session / assisted metrics;
- ranked next experiments as spend scales.

**Key decision:** optimise the multi-session decision system, not only first-click conversion.

## 6. Premium PDP competitor benchmark

`KRYO_PREMIUM_PDP_BENCHMARK_EIGHTSLEEP_PLUNGE_2026_08.md`

Use for:
- Eight Sleep / Plunge funnel patterns;
- KRYO PDP trust and information gaps;
- product imagery / what's included;
- trial / returns / delivery placement;
- social proof;
- expert assisted sales;
- demonstration / mechanism proof.

## 7. Promo video and research memory protocol

`KRYO_PROMO_VIDEO_AND_RESEARCH_MEMORY_PROTOCOL_2026_08.md`

Use for:
- Eight Sleep-style promotional video structure translated to KRYO;
- how video increases product comprehension, belief and purchase intent;
- exact 60-90 second KRYO video sequence;
- required shot list for founder/product/customer proof footage;
- PDP, Meta, retargeting and WhatsApp repurposing rules;
- research-memory capture rules for ChatGPT/user/competitor insights;
- resolving conflicting research over time.

**Key decision:** the KRYO promo video is not just content. It is a conversion, proof and comprehension asset. It should be created now, then tested cleanly on the current winning PDP before a full PDP rebuild.

## 8. Assisted conversion

`KRYO_ASSISTED_CONVERSION_WHATSAPP_AND_EXIT_INTENT_2026_08.md`

Use for:
- WhatsApp / live sales support architecture;
- persistent multi-session conversation logic;
- placement and visual hierarchy;
- what to measure;
- whether / how to test exit-intent capture.

**Key decision:** WhatsApp is strategically valuable, but it is not bundled into Control v2 Release 1. Introduce it as a separate measured assisted-conversion release after the baseline is stable. Exit intent remains later.

## 9. Control v2 research spec

`KRYO_CONTROL_V2_PRETEST_UPGRADE_2026_08.md`

Use for:
- why the immediate Control v2 baseline changes are justified;
- what must remain unchanged;
- why WhatsApp is excluded from Release 1;
- expected regression/monitoring logic;
- what experiments come after the baseline stabilises.

Execution must use the frozen task manifest, not reinterpret this research note.

## 10. Authority order

For decisions, use this order:

1. **Live Shopify** — current product, inventory, price, variant, theme and commerce truth.
2. **Live Meta** — current delivery, ads, ad-set configuration, budget and optimisation.
3. **Live Supabase** — current ingested metrics / attribution when freshness is proven.
4. **Frozen task manifest** — exact approved implementation intent for a specific release.
5. **August research notes / operating protocols** — evidence-based doctrine.
6. **Canonical KRYO Growth OS** — broader strategy and historical benchmark.
7. Older KRYO docs — historical context only where not superseded.

## 11. Measurement gate

At the time these notes were expanded:

- first-party `attribution_touches` were receiving fresh paid Meta sessions;
- Meta historical tables were useful for historical comparison;
- same-day complete Meta spend/CTR/CPC economics were not yet proven consistently fresh in Supabase.

Therefore:

> **Do not cut, scale or classify ads from spend/CTR/CPC/CPLPV until current Meta delivery data is directly readable or proven fresh in Supabase.**

Onsite funnel data can still detect technical failures and directional intent.

## 12. Immediate sequence

### A. Control v2 Release 1

Frozen non-experiment baseline release:
- truthful `7 of 10` allocation + next dispatch wording, conditional on exact frozen stock precondition;
- stronger product gallery using exact existing what's-in-box/front/side media;
- exact tester testimonial block after `What makes KRYO different?`;
- trial + free Dubai delivery/returns at the buy decision;
- preserve one model, direct ATC, Downpay, free-upgrade popup, Chatway and checkout.

Workflow:
- build alternate-template review;
- owner approves;
- deploy exact approved artifact;
- attach/reorder approved product media;
- record deployment time;
- regression monitor;
- keep/revert using task thresholds.

### B. Creative discovery

Inside the existing winning Purchase ad set:
- keep historical `Winner | Plunge is Dead`;
- retest `Winner | Morning Grogginess`;
- use coherent pre-frame copy / proven assets;
- point initially to stable Control v2;
- judge cost/ATC, LPV→ATC, checkout and mature purchase economics once Meta data is fresh.

### C. Dispatch-window creative

In the final ~3–5 days before a genuine fortnightly dispatch cutoff:
- make current dispatch date prominent;
- state next scheduled dispatch when operationally true;
- use current live allocation if accurate;
- measure whether returning/multi-session prospects close before cutoff.

### D. Next evergreen challenger

Mechanism / product education:
- own chilled-water supply;
- 1°C control;
- KRYO Halo;
- engineered system;
- preferably real demonstration footage.

### E. Promo video / comprehension asset

Start asset creation now:
- tired morning state;
- KRYO reveal;
- real Halo/water/use footage;
- temperature/mechanism proof;
- what arrives;
- 30-morning trial/risk reversal;
- cutdowns for Meta and WhatsApp.

First clean test:
- current winning PDP + video near hero / first product explanation;
- no simultaneous cart copy, price, delivery or full PDP rebuild change.

### F. Major validation test

Only after a pre-frame or video/proof asset demonstrates commercial signal:
- build a matched first-20–25% landing-page treatment;
- use controlled Meta Experiment only if causal certainty is worth the delivery-efficiency cost.

### G. Assisted conversion

After Control v2 stabilises:
- subordinate WhatsApp specialist path;
- measure assisted revenue / 1-, 7-, 30-day conversion;
- later test targeted exit-intent → WhatsApp with no extra discount by default.

## 13. Research memory rule

When a ChatGPT/user/competitor insight materially changes KRYO positioning, offer, video, page structure, cart psychology, follow-up, price, delivery promise or measurement logic, it must be captured in Supabase and/or a GitHub research note.

If new research conflicts with old research, do not choose automatically. Record the conflict, evidence on both sides, current status, supersession rule and the experiment or live data that resolves it.