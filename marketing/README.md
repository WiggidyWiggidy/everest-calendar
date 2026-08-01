# KRYO Marketing Source of Truth

This directory is the small, durable source-of-truth layer for the KRYO growth operating system.

It intentionally references existing documents instead of duplicating them.

Read order for any KRYO marketing work:

1. `foundation/funnel.md`
2. `analytics/metric-definitions.md`
3. `analytics/attribution-rules.md`
4. `analytics/data-quality-checks.md`
5. `experiments/decision-rules.md`
6. `experiments/experiment-ledger.csv`
7. Existing copy/product docs referenced below.

Canonical existing docs:

- Copy/claims: `../docs/KRYO_COPY_CONSTITUTION.md`
- WhatsApp sales: `../docs/KRYO_WHATSAPP_PLAYBOOK.md`
- System gates: `../KRYO_SYSTEM_OPERATING_MAP.md`
- Marketing routes: `../MARKETING_RUNBOOK.md`
- Product facts: `../KRYO_PRODUCT_RUNBOOK.md`

Rule: if a fact conflicts, stop and verify from source-health, product_context/shared memory, or Tom. Do not invent.

## Founder daily interface

Run:

```bash
npm run operator:kryo-growth-brief
```

Output:

- Current primary commercial constraint.
- Active experiment state.
- Data reliability.
- Single recommended action.
- Approval items waiting.

Artifact:

`artifacts/kryo-growth-decision-brief/latest/growth-decision-brief.md`

## Chat analyst pack

Run:

```bash
npm run analyse:kryo-performance
```

Use this when Tom wants insight in chat rather than a dashboard. It creates a source-health-gated analyst packet with exact results, observations, interpretations, hypotheses, recommendations, and cannot-say-yet sections.

Artifact:

`artifacts/kryo-performance-analyst-pack/latest/analyst-pack.md`

## Experiment packet and review

Run:

```bash
npm run operator:kryo-experiment-packet
npm run review:kryo-experiment
```

Artifacts:

- `artifacts/kryo-experiment-packets/latest/experiment-spec.md`
- `artifacts/kryo-experiment-review/latest/experiment-review.md`

## Rapid experimentation loop

Run the full non-website loop:

```bash
npm run operator:kryo-rapid-loop
```

It performs:

1. Source-health gate.
2. Analyst pack.
3. Measurement-spine health.
4. Experiment packet generation.
5. DB experiment ledger sync.
6. Experiment release review.
7. Reversible synthetic lead/deposit smoke test.

It does not mutate Shopify or Meta. It writes/updates the experiment row in Supabase and inserts then deletes synthetic smoke rows to prove the lead/deposit rollup works.

## Experiment velocity

Run:

```bash
npm run report:kryo-experiment-velocity
```

North-star operating metric: tests started and completed per week. The report shows draft, active, proposed-this-week and ended-this-week counts from the DB-backed experiment ledger.
