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
