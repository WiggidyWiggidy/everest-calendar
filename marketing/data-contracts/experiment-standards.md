# Experiment & Scaling Standards (binding)

Written 2026-07-31 after `meta-ads-expert` output shipped cent-precise thresholds and a scaling ramp
with no hypothesis, no primary-metric justification, and — the tell — **no time-to-significance**. At
~1 order/month that is the most important number, and it was absent. These rules make that impossible.

## Rule 1 — Economic-claim evidence gate (no number ships without this)
Any CPA, ROAS, AOV, margin, cost-per-ATC, or threshold must carry:
- **Sample size (n)** and the window. n≤2 → no rate. n<30 → directional, not a verdict. No cent-level
  precision on n<30 (A$177.51 on ~5 orders is false precision — say "≈A$180, n=5, lifetime blended").
- **Input provenance:** every input from `source-of-truth.md`, not modelled. AOV must come from actual
  Shopify orders, not an assumed A$2,000. If an input is unconfirmed, the number is UNKNOWN, not published.
- **Prerequisite stamp:** thresholds/scaling numbers are INVALID while tracking is red (`facebook.com/tr`
  aborting) or AOV is unconfirmed. State "provisional pending: tracking green + AOV confirmed."
- **No scaling recommendation while any prerequisite is red.**

## Rule 2 — Every test needs an Experiment Card (LP, ad, creative, AND budget change)
No change is proposed without:
1. **Hypothesis** — "If we <change>, then <primary metric> improves because <mechanism>."
2. **Primary metric** — the ONE metric it moves, and **why it's the highest-value lever right now**
   (tie to the binding constraint + expected profit = Δmetric × traffic × margin).
3. **Guardrail metrics** — what must NOT get worse (CPA, ROAS, refund rate).
4. **Baseline + MDE** — current value + the minimum effect worth detecting.
5. **Required sample per arm + expected time-to-significance at current traffic** (Rule 3). If it can't
   reach significance in a sane window, say so and pick a proxy.
6. **Decision rule** — pre-registered: what result → ship / kill / iterate, at what sample. No calling a
   winner before the pre-registered n.
7. **Rollback** — how to undo, and the loss cap during the test.

## Rule 3 — Power & significance reality at low volume (the missing skill)
- **Compute time-to-significance before launching**, from baseline rate, MDE, traffic/day, 80% power, 95%.
- KRYO reality: purchase rate is ~0.1–0.3% on ~5 lifetime orders. A purchase-CVR A/B needs tens of
  thousands of sessions/arm → **months, often infeasible short-term.** Therefore:
  - **Test on the highest-funnel metric that (a) has adequate n and (b) is causally upstream of purchase**
    — usually **Add-to-Cart / cost-per-ATC / CTR**, which get 5–50× the events.
  - Treat **purchase as a guardrail/directional** metric, explicitly labelled, until volume supports it.
  - State the honest sentence every time: "At ~X sessions/day, this reaches significance on <metric> in
    ~Y days; purchase-level significance would take ~Z — so we decide on <metric> and watch purchase as a guardrail."
- Never present a 5-day / n≈1 result as a verdict (Poisson/CI must be shown for small n).

## Rule 4 — A budget change IS an experiment
No "jump to A$200/day." Each step is a hypothesis: "at A$130/day, cost-per-ATC stays ≤ target because
the UAE audience isn't saturated." Watch the leading metric daily; hold the step long enough to read it;
rollback rule if it breaches. One step at a time (Rule 5).

## Rule 5 — One variable, no confounds
Don't run overlapping tests that contaminate each other (e.g., new LP + new budget + new angle at once).
Change one lever per read, or use a design that isolates them. Sequence, don't pile up.

## Enforcement
`performance-economics`, `meta-ads-expert`, `design-experiment`, and both operators must pass output
through Rules 1–5 and the red-team lens before it reaches Tom. A recommendation missing an Experiment
Card or a time-to-significance line is invalid and must not be presented.
