# Evidence Standards

Binding on every marketing analysis, report, diagnosis and recommendation.

## Every important conclusion must show

1. **Data source** — table or view name
2. **Query or view** — the actual SQL, or a named view
3. **Date range** — explicit start and end
4. **Cohort** — device, traffic class, page, and eligibility filter applied
5. **Sample size** — distinct session counts, not event counts
6. **Comparison group** — what the number is being contrasted against
7. **Confidence** — and what would change it
8. **Alternative explanation** — at least one competing account of the same data

A conclusion missing any of these is not reportable.

## Classification is mandatory

Label every substantive statement:

| Label | Means |
|---|---|
| **FACT** | Directly measured, query shown, sample adequate |
| **PATTERN** | Repeated observation, mechanism not established |
| **HYPOTHESIS** | Proposed mechanism, testable, not yet tested |
| **UNKNOWN** | Data does not exist or is not trustworthy |
| **RECOMMENDATION** | Proposed action, with the decision owner named |

Unlabelled prose is treated as UNKNOWN.

## Prohibited reasoning

- **No generic benchmark as proof of a KRYO problem.** "Industry add-to-cart is 8%" is not
  evidence that KRYO has a problem. Only KRYO's own segments and history are valid baselines.
- **No correlation presented as causation.** An observational gap between cohorts is a
  PATTERN. It becomes a FACT about mechanism only after an intervention or a direct test.
- **No blended rate across device.** Mobile and desktop currently differ by ~35×.
  A blended headline number is misleading and is not permitted.
- **No event-level counts as funnel numerators.** Duplicate firing makes them meaningless.
- **No substituted denominator.** If the defined denominator is unavailable, the metric is
  UNKNOWN — do not swap in a near-neighbour.
- **No proxying an unmeasurable metric.** `whatsapp_click` is not a qualified lead.
- **No inferring intent from absence.** Zero events may mean zero behaviour *or* broken
  tracking. Distinguish them, or report both branches.

## Freshness gate

Before quoting any current-state verdict (CPA, ROAS, conversion rate, winner, fatigue),
confirm the source is within its freshness threshold in
`marketing/data-contracts/source-inventory.md`. Stale data must be labelled
`historical through <max date>`.

## Contradiction duty

If direct evidence contradicts a stated assumption — including one given in the task
brief — say so explicitly, show the query, and record it in
`marketing/data-contracts/known-limitations.md`. Do not quietly proceed on the
corrected basis, and do not quietly proceed on the wrong one.

## Absence is a claim about the instrument, not the world

**Never assert that records do not exist based on a query returning none.** A short or empty result
is evidence about the *query*, the *scope*, and the *permissions* — before it is evidence about reality.

Before writing "there are no X":
1. **Get an independent count** and compare it to what you received
   (`orders/count.json` vs the array; `count(*)` vs the rows). A mismatch means TRUNCATED — say so.
2. **Check the boundary.** A result set ending near a round window (30/60/90 days) or a round
   row count (250, 1000) is pagination or scope truncation until proven otherwise.
3. **Check scope/permissions** before attributing a gap to reality.
4. **If a human contradicts the data, test the instrument before disputing them.** The owner has
   context the API does not.

Report as `TRUNCATED — n visible of N total`, never as `n exist`.
**Do not compute a rate, AOV, MER or CPA from a truncated set** without stating the window.

*This law exists because the system made this error three times on 2026-07-31: an empty
`shopify_orders` read as "no sales", a `.gitignore`-hidden directory read as "files absent", and a
60-day-scoped Shopify response read as "no orders before June" — which wrongly told the owner his own
sales history was contradicted. See `marketing/evals/regression-shopify-60day-scope.md`.*
