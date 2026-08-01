# Evals — does the system actually reason well? (the thing that proves it's getting smarter)

An agent system with no evals can't know if it's improving. These are gold cases + a rubric the
red-team scores agent output against. **Every real mistake becomes a permanent regression case** so it
can never recur. Run on any change to rules/agents, and before trusting a diagnosis/launch.

## Scoring rubric (each output scored pass/fail per line)
- [ ] Every number carries source · window · n; precision capped to what n supports.
- [ ] No fact inferred (dates, config, AOV) — confirmed or labelled UNKNOWN.
- [ ] Sources reconciled where they disagree; no silent reversal of a prior finding.
- [ ] Claims labelled FACT/PATTERN/HYPOTHESIS/UNKNOWN; confidence capped by sample.
- [ ] Red-team / discriminating test named before any conclusion.
- [ ] Says "I don't know / insufficient data" when the data is thin — instead of fabricating.
- [ ] No scaling/threshold claim while a prerequisite (tracking, confirmed AOV) is red.
- [ ] Platform ROAS/CPA labelled directional; profitability judged on MER.
- [ ] Any live action has an Experiment Card incl. time-to-significance + QC.
A pass requires ALL applicable lines. One violation = fail = the scaffolding needs tightening.

## Regression cases (from actual 2026-07-31 failures — the system must now handle each correctly)
1. **False precision on tiny n** — Input: 5 lifetime orders. Bad: "CPA A$177.51, ROAS 11.3×."
   Expected: "≈A$180, n=5, lifetime blended, directional; ROAS is platform-reported — judge on MER."
2. **Inferred launch date** — Input: page-file timestamps. Bad: "kryo2_ launched Jul 6."
   Expected: confirm from data/Tom ("traffic ~0 before Jul 26 → ~Jul 26, pending Tom confirm"); never infer.
3. **Trusting one source / flip-flop** — Input: first-party says ~0 ATC, Meta says 10–40/wk.
   Expected: STOP and reconcile the gap before concluding; don't pick one and run.
4. **Double-counted metric** — Input: `shopify_funnel_daily.checkouts_completed`. Bad: "6 checkouts."
   Expected: flag it double-counts upsells; use real order count; reconcile.
5. **Scaling on red prerequisites** — Input: `facebook.com/tr` aborting. Bad: "restart, optimise for ATC, ramp to A$200."
   Expected: block — tracking red; no scaling number until green; propose fix first.
6. **No experiment design** — Input: "raise budget." Bad: a ramp with no card.
   Expected: refuse without an Experiment Card + time-to-significance; note purchase can't reach sig at ~1 order/mo.
7. **Pixel gap ≠ site broken** — Input: pixel shows 0 ATC. Bad: "add-to-cart is broken."
   Expected: distinguish tracking-not-firing from action-not-happening; verify with the live test / server-side.
8. **Fabricating to fill a gap** — Input: revenue not in DB. Bad: invent an AOV.
   Expected: "revenue isn't reliably in the DB — pull from Shopify admin"; state UNKNOWN.

## How to run
Red-team-verifier scores the target output against the rubric and re-runs the relevant regression cases.
Failures block the output AND trigger a `learning-loop.md` scaffolding update. Add a new case here every
time a novel error is caught — the eval set only grows.
