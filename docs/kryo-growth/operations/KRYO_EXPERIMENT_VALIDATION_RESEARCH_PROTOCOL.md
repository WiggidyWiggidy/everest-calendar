# KRYO Experiment Validation Research Protocol

**Purpose:** turn Tom's proposed marketing experiments into research-backed decisions, a canonical operating priority queue, an implementation sequence, and measurable readouts.

**Updated:** 2026-08-08

## 1. Source of truth and the key distinction

`public.marketing_proposals` is the canonical KRYO ICE/proposal registry.

There are TWO different views of this registry and they must not be confused:

- `public.vw_marketing_proposal_ice_matrix` = full research/proposal matrix. Useful for analysis, not the daily operating list.
- `public.vw_kryo_experiment_operating_queue` = canonical daily operating queue. Use this when Tom asks: "what experiments have we decided to prioritise?", when planning the calendar, or when reviewing the next few days.

Do not use old `marketing_experiments` or `kryo_growth_experiments` draft rows to answer current-priority questions unless explicitly researching experiment history. Those tables contain legacy/draft history and are not the current operating queue.

## 2. Why the old readout failed

The old ICE view mixed research candidates, holds, infrastructure, live tests, scheduled tests and asset projects in one long list. It also filtered primarily on `action_data.product_handle/page/page_path`, so a valid KRYO experiment could disappear when those tags were missing. `recommended_order` was often absent because newer decisions used `week_sequence_order`. Finally, free-form `implementation_status` strings were not consistently recognised by the view's sort logic.

Result: real decisions such as the $25->$50 Meta budget test existed in Supabase but were effectively invisible or buried in operational references.

## 3. Mandatory logging rule

Whenever Tom and the growth operator reach a clear decision that a KRYO marketing action is a real experiment/priority, update or create the `marketing_proposals` row in the same interaction. Do not leave a decided experiment only in chat, GitHub notes, calendar, or memory.

Every current KRYO row must include:

- `action_data.product_handle = "kryo2"`
- market where relevant
- ICE Impact / Confidence / Ease / score
- `implementation_status`
- `recommended_decision`
- `next_action`
- primary metric + guardrails
- research/data confidence where available
- `implementation_schedule.week_sequence_order` once it has entered the decided operating sequence
- dependencies / launch conditions where applicable
- actual timestamp once live

If an experiment is discussed but NOT decided, keep it as candidate/research and do not assign it a sequence order.

## 4. Operating states

The daily queue normalises proposals into five states:

1. `LIVE / MEASURING` - already changed; protect attribution and read results.
2. `DECIDED / SCHEDULED` - Tom/operator have decided to run it and timing/condition is known.
3. `DECIDED / PREP` - decision is positive but a real dependency must be completed first (costing, asset, verified fix).
4. `CANDIDATE / RESEARCH` - potentially valuable but not yet a committed experiment.
5. `HOLD / BACKLOG` - explicitly not a current priority.

Calendar/operations questions should normally show states 1-3 only. Candidates must not crowd out committed work simply because they have a high theoretical ICE score.

## 5. Priority logic

ICE estimates commercial attractiveness. It does NOT by itself determine execution order.

Execution order is:

1. protect/read live tests;
2. run committed experiment with lowest `week_sequence_order`;
3. respect dependencies and contamination risk;
4. prepare the next committed experiment;
5. only then pull from candidate research using ICE.

Therefore a score-63 candidate with an unresolved logistics dependency can sit behind a score-56 experiment that is already scheduled and ready to run.

## 6. Current committed sequence (as of 2026-08-08)

The database is the live authority, but the intended sequence is:

1. 72-hour Meta budget stress test: $25/day -> $50/day. Budget only; do not stack page/creative changes during its clean read window.
2. Bottom-of-funnel August dispatch/offer creative, conditional on the budget test preserving traffic quality. Parallel cart audit is allowed; only fix an objectively confirmed bug.
3. Next-day Dubai delivery offer test, after logistics cost/SLA feasibility is confirmed. Prefer a truthful explicit arrival promise over vague dispatch wording.
4. WhatsApp assist/nurture layer only if the budget + BOF read shows warm traffic needs assisted conversion.
5. Real KRYO promotional/demo video asset and subsequent PDP/Meta test.

Live Aug 6 PDP changes remain `LIVE / MEASURING` and should be read separately from the sequence above.

## 7. Research workflow

Tom idea / observed problem -> log proposal -> validate with Shopify/Supabase first -> external research -> define causal mechanism -> metrics/guardrails -> ICE -> decision state -> if committed assign sequence -> implementation -> timestamp -> readout -> learning.

Source-of-truth order:

1. Shopify live/Admin Analytics for commerce/funnel metrics.
2. Supabase for KRYO events, proposals, historical performance, change logs and readouts.
3. Meta/live ad tools only if fresh and verified.
4. GitHub for implementation context and operating rules.

## 8. ICE scoring

`ICE = Impact × Confidence × Ease / 10`

Impact: 10 = could materially change KRYO sales economics; 8-9 = likely material primary-funnel movement; 6-7 = meaningful narrower effect; <=5 = smaller/diagnostic.

Confidence: 9-10 = KRYO data + strong external evidence + manageable downside; 7-8 = strong directional evidence; 5-6 = plausible/theoretical with uncertainty; <=4 = weak/high-risk.

Ease: 9-10 = quick low-risk change; 7-8 = small implementation + measurement; 5-6 = moderate dependency/investigation; 3-4 = asset/physical/multi-day; <=2 = major dependency.

## 9. Measurement minimum

Before implementation, define one primary metric, at least two secondary metrics, at least two guardrails, baseline, post-change window, timestamp plan, rollback/fail condition, and any required custom event.

Do not stack changes during a protected experiment window unless the second action is an objectively necessary technical fix and is separately timestamped.

## 10. Codex boundary

Codex is implementation-only after strategy is specified. A handoff must define exact surface, exact change/copy, event tracking, forbidden scope, success criteria, rollback condition, read-before/write/read-after checks and marketing change-log timestamp. Codex must not rediscover strategy.

## 11. Daily operations query

For regular operations/calendar planning, query `public.vw_kryo_experiment_operating_queue`, show `LIVE / MEASURING`, `DECIDED / SCHEDULED`, and `DECIDED / PREP`, ordered by operating state then `sequence_order`. Explain dependencies. Do not substitute a raw ICE-score sort or legacy experiment table.
