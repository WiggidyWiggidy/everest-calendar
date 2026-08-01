# Calibration log — predicted vs actual

Every marketing task logs its prediction here at CLOSE, and the outcome when known.
The point is to measure whether stated confidence is earned, and to tune it.

Columns: date · claim · confidence stated · n at the time · predicted · actual · verdict · scaffolding change

| Date | Claim | Confidence | n | Predicted | Actual | Verdict | Scaffolding change |
|---|---|---|---|---|---|---|---|
| 2026-07-31 | "Old page 6 completed checkouts = 6 real sales" | stated as FACT | 6 rows | 6 sales | **2 (Jun), upsells double-counted** | **WRONG** | `known-limitations.md`: checkouts_completed is not a customer count |
| 2026-07-31 | "July collapse: spend +64%, orders −80%" | stated as FACT | n=6 | regime change | **28 of 61 days were dark; no collapse** | **WRONG** | Uptime added as a first-class metric in `meta-ads-expert` |
| 2026-07-31 | "AOV = A$2,000, margin 20%, COGS ≈A$1,600" | stated as CONFIRMED | n=0 | economic model | **Never confirmed by Tom — invented** | **FABRICATED** | `thresholds.md` marked PROVISIONAL; AOV marked UNKNOWN |
| 2026-07-31 | "CPA A$177.51" | cent precision | **n=3** | precise CPA | directional only | **FALSE PRECISION** | Law added: n<30 → no false precision |
| 2026-07-31 | "Preview traffic overstates ATC by 24%" | PATTERN | n=57 sessions | 24% | **~180% (50→18 sessions)** | **UNDERSTATED** | Full filter encoded as `marketing_touches_clean` |
| 2026-07-31 | "H1: variant picker breaks add-to-cart" | leading HYPOTHESIS | — | cart broken | **cart works — 200 + real line** | REFUTED (correctly, by direct test) | Live-browser test promoted ahead of code reading |
| 2026-07-31 | "No orders before Jun; Tom's Feb/Mar recollection contradicted" | stated as FACT | 5 of **791** | revenue A$4,978, MER 4.86x | **A$10,748.82, MER 10.50x — Tom was right** | **WRONG — asserted absence from a truncated query** | Law added to `evidence-standards.md`; `known-limitations.md` §9; regression eval `regression-shopify-60day-scope.md` |

## Standing calibration priors (derived from the above)
- This system has repeatedly **overstated confidence on small n**. Default to directional.
- It has twice been wrong by **trusting a DB aggregate over the source system** (`shopify_funnel_daily`).
  Prefer Shopify admin for money questions.
- **Dominant failure mode: reading a bounded/empty result as proof of absence.** Three instances in one
  session (empty `shopify_orders`, gitignored files, 60-day API scope). Always get an independent count.
- **When Tom contradicts the data, test the instrument first.** He has been right and the data wrong.
- Direct measurement (live browser, live SQL) has been reliable. Inference from file dates,
  memory, and verbal figures has not.
