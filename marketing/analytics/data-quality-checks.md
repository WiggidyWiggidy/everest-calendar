# KRYO Data Quality Checks

Mandatory command before analysis:

```bash
npm run audit:kryo-source-health
```

Mandatory command before website work:

```bash
npm run operator:kryo-preflight -- --mode website --handle kryo2_
```

## Checks required before optimisation recommendations

- Source max timestamp is present.
- Source is within freshness threshold.
- Quarantined routes/connectors were not used as current truth.
- Meta delivery rows exist for the decision window.
- GA4 is not used as current source while Pipeboard quota is exhausted.
- GSC is not used until access/connector is restored.
- First-party events are not used as paid verdict metrics unless revalidated.
- WhatsApp clicks are not called qualified leads.
- Deposits are not inferred from checkout or WhatsApp clicks.
- Every experiment/variant has an experiment ID.
- Every ad URL has required UTM IDs.

## Failure states

- `blocked`: do not recommend current action.
- `stale`: show as historical only.
- `quota_limited`: account/plan issue, not property permission.
- `deprecated`: not canonical; do not use as blocker if canonical source exists.

## Analytics cycle guardrails

`/api/marketing/ops/run-analytics-cycle` must not call quarantined legacy syncs by default.

Explicit opt-ins:

- `ALLOW_LEGACY_GA4_SYNC=true` permits the hot lane to call old GA4 hourly sync.
- `ALLOW_QUARANTINED_MARKETING_SYNCS=true` permits the cold lane to call old Meta/GA4/GSC/asset syncs.

Without those env vars, the route should skip those paths and report the skip.

## Chat analyst pack

For founder-facing chat insight, use the deterministic analyst pack instead of ad-hoc queries:

```bash
npm run analyse:kryo-performance
```

Output:

- `artifacts/kryo-performance-analyst-pack/latest/analyst-pack.md`
- `artifacts/kryo-performance-analyst-pack/latest/analyst-pack.json`

Rules:

- Read-only. It does not trigger sync routes and does not mutate Shopify, Meta, or Supabase.
- Uses the latest source-health packet to gate CPA, ROAS, conversion-rate, winner, and scale claims.
- Labels Meta and GA4 as historical/stale when source-health says they are not fresh.
- Joins `/cart` events back to KRYO-touched sessions before calculating cart behaviour.
- Separates exact results, observations, interpretations, hypotheses, recommendations, and cannot-say-yet items.
