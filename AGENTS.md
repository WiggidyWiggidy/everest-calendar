# Everest Calendar Agent Rules

## KRYO marketing work

Before any KRYO marketing analysis, website experiment, ad draft, or customer-facing copy:

1. Read `/Users/happy/Desktop/Claude Project/everest-calendar/MARKETING_RUNBOOK.md`.
2. Read `/Users/happy/Desktop/Claude Project/everest-calendar/KRYO_SYSTEM_OPERATING_MAP.md`.
3. Read the relevant files in `/Users/happy/Desktop/Claude Project/everest-calendar/marketing/`.
4. Run source health before recommendations:

```bash
npm run audit:kryo-source-health
```

## Hard rules

- No live Shopify, theme, product, ad, budget, or offer mutation without Tom approving a named patch.
- Ads created for Tom approval must land paused.
- Website changes must be branch and PR based unless Tom explicitly asks for a direct hotfix.
- Every website experiment needs an experiment ID, landing-page version, hypothesis, primary metric, guardrail, baseline, decision rule, and rollback plan.
- Every ad needs an angle ID and hook ID.
- Ads and landing pages must communicate the same promise, proof, offer, scarcity claim, and CTA.
- Every recommendation must state the evidence, source freshness, expected metric movement, and what would prove it wrong.
- Never invent unsupported medical, health, price, product, date, delivery, availability, or warranty claims.
- Use AED for UAE-facing KRYO copy.
- Failed, inconclusive, invalid, and tracking-failure experiments must be recorded.
- Do not produce marketing output merely to appear productive.

## Current KRYO commands

- `npm run audit:kryo-source-health` validates source freshness.
- `npm run analyse:kryo-performance` creates the chat analyst pack.
- `npm run operator:kryo-growth-brief` creates the founder decision brief.
- `npm run operator:kryo-experiment-packet` creates a proposed experiment packet.
- `npm run audit:kryo-measurement-spine` checks lead/deposit/experiment spine readiness.
- `npm run operator:kryo-preflight -- --mode website --handle kryo2_` checks website readiness.
