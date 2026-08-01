# KRYO Conversion Diagnosis — Enforced Protocol

Run this **in order, every time**, before any conversion diagnosis or recommendation. It exists to
make the failure modes of 2026-07-31 structurally impossible. Each step has a HARD STOP. An analysis
that skipped a step is invalid regardless of its conclusion.

Loads at step 0: `.claude/rules/evidence-standards.md`, `source-of-truth.md`, `confirmed-facts.md`.

## Step 0 — Load the contracts + state the decision
- Load evidence-standards, source-of-truth, confirmed-facts.
- Restate the question and the **decision it feeds** (e.g. "should ads restart to kryo2_?").

## Step 1 — Confirm the facts (no inference)
- List every fact the analysis depends on (launch dates, which tracking was live, which page ads
  pointed to, config like "is the buy gated", price, objective).
- Mark each CONFIRMED / UNKNOWN from confirmed-facts.md.
- **HARD STOP:** if any decision-critical fact is UNKNOWN → ask Tom, do not proceed on a guess.

## Step 2 — Bind each metric to its canonical source
- For every metric needed, take the canonical source from source-of-truth.md.
- **HARD STOP:** if the required window overlaps a KNOWN-BAD period, or the only available source is
  outside its contract, label the number UNVALIDATED and do not use it for a verdict.

## Step 3 — Pull data, exclude internal traffic, report n
- Apply the internal/test exclusion list. Report distinct-session sample sizes for every cell.

## Step 4 — Sample-size gate
- Apply the caps: ≤2 conversions → no verdict; <10 → directional only; <30 → not FACT.
- **HARD STOP:** below threshold → report "insufficient data", give the observation as HYPOTHESIS
  at most, and state how much data would be needed to conclude.

## Step 5 — Reconcile sources (don't pick, don't flip)
- If two sources that should agree differ >~20%, investigate the gap and explain it **before**
  concluding. If this contradicts a prior finding, reconcile explicitly — no silent reversal.

## Step 6 — Compute with explicit denominators
- Never blend across device. Never substitute a denominator. Show the query for each number.

## Step 7 — Classify + cap confidence
- Tag every statement FACT / PATTERN / HYPOTHESIS / UNKNOWN / RECOMMENDATION.
- Confidence capped by sample size and source reliability (per evidence-standards).

## Step 8 — Red-team
- State the strongest case against the conclusion, what would falsify it, and the single
  discriminating test that separates it from the next-best explanation.

## Step 9 — Output (fixed shape)
- **Findings** (each labelled, each with source · window · n · exclusions).
- **What is still UNKNOWN** and why.
- **Discriminating test** to run next.
- **Owner decisions** (Tom) vs **agent actions after approval** — kept separate.
- Write findings to `marketing/findings/` (ledger format). Never overwrite a prior finding silently.

## Self-check before sending (all must be true)
- [ ] Every number has source · window · n · exclusions.
- [ ] No fact was inferred; all decision-critical facts confirmed or flagged.
- [ ] No number from a KNOWN-BAD window used as a verdict.
- [ ] Confidence ≤ what sample size allows.
- [ ] Sources reconciled where they disagree; no silent reversal of a prior finding.
- [ ] Red-team + discriminating test stated.
- [ ] Owner decisions separated from agent actions.
