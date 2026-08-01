# KRYO B2C Growth — Operating Entry Point

Scope: **KRYO direct-to-consumer marketing only.** Paid acquisition (Meta), landing pages
and PDPs, on-site conversion, the WhatsApp assisted-sales pathway, Shopify checkout.

Out of scope: B2B, manufacturing, CAD, suppliers — see
[.claude/rules/business-scope.md](.claude/rules/business-scope.md).

This file routes. It does not restate business facts; those live in the referenced files.
Previous version archived at
[marketing/archive/CLAUDE.md.superseded-2026-07-31.md](marketing/archive/CLAUDE.md.superseded-2026-07-31.md).

---

**Before any conversion analysis, run [marketing/data-contracts/diagnostic-protocol.md](marketing/data-contracts/diagnostic-protocol.md).**

## Marketing agent system — MANDATORY boot/close (do not skip)

**BOOT (before any marketing work):**
1. Read `marketing/agents/SYSTEM.md`, `.claude/rules/evidence-standards.md`,
   `marketing/data-contracts/{source-of-truth,confirmed-facts,experiment-standards,profitability-and-attribution}.md`,
   `marketing/agents/{conversion-diagnosis-loop,experiment-launch-playbook,learning-loop}.md`.
2. Load MEMORY: open items in `marketing/findings/`, active learnings, `marketing/agents/calibration-log.md`,
   customer-language.
3. State what is KNOWN (with source + n) vs UNKNOWN for the task **before acting**.

**CLOSE (end of every marketing task):**
1. Write findings to `marketing/findings/` — labelled FACT/PATTERN/HYPOTHESIS/UNKNOWN · source · window · n.
2. Log prediction vs outcome to `marketing/agents/calibration-log.md`.
3. POSTMORTEM: if anything was wrong or missing, update the responsible rule/agent/contract **and** add a
   regression case to `marketing/evals/`. An error is not "handled" until the scaffolding changed.

**LAWS (these override the urge to produce output):**
- **Honesty over output.** If you don't know, say "I don't know" and what you'd need. Never fabricate a
  number, cause, or confidence level. A stated UNKNOWN is a success; confident unfounded output is a failure.
- **Confidence capped by n.** n≤2 → no rate, no verdict. n<30 → directional only, no false precision.
- **Confirm facts, don't infer.** Reconcile disagreeing sources; never flip a prior finding silently.
- **No scaling or threshold claim while a prerequisite is red** (tracking broken, AOV unconfirmed).
  Profitability is **MER** (real revenue ÷ total spend), not platform-reported ROAS.
- **No self-certification.** The lens that produced a claim does not pass it. Red-team before concluding.
- **Autonomy split.** Do reversible/no-spend work. PREPARE spend/live actions for Tom.
  Never merge `main`. Never commit secrets.

**Agent output schema** — every agent returns this, not free text:
`claim · method · source+window+n · confidence · what-would-falsify-it · handoff`

## Read before any analysis

| Concern | File |
|---|---|
| Evidence standards (mandatory) | [.claude/rules/evidence-standards.md](.claude/rules/evidence-standards.md) |
| Business scope | [.claude/rules/business-scope.md](.claude/rules/business-scope.md) |
| Metric definitions | [marketing/data-contracts/metric-definitions.md](marketing/data-contracts/metric-definitions.md) |
| What data is usable today | [marketing/data-contracts/source-inventory.md](marketing/data-contracts/source-inventory.md) |
| Known limitations | [marketing/data-contracts/known-limitations.md](marketing/data-contracts/known-limitations.md) |
| Production permissions | [.claude/rules/production-permissions.md](.claude/rules/production-permissions.md) |
| Experiment governance | [.claude/rules/experiment-governance.md](.claude/rules/experiment-governance.md) |

## Source of truth

Business facts: [marketing/source-of-truth/](marketing/source-of-truth/) — product,
offer and pricing, positioning, customer, funnel, landing pages, WhatsApp pathway,
business objectives, agent permissions.

**Never state a price, spec, claim or offer term from memory. Read the file.**

## Data contracts

[marketing/data-contracts/](marketing/data-contracts/) — source inventory, tool map,
table map, metric definitions, funnel definitions, attribution rules, refresh schedules,
known limitations, authentication status.

## Workflow

| Command | Purpose |
|---|---|
| [/kryo-growth-diagnose](.claude/commands/kryo-growth-diagnose.md) | Full evidence-backed conversion diagnosis |

Skills live in one place: [.claude/skills/](.claude/skills/).

## Experiments

Governance: [.claude/rules/experiment-governance.md](.claude/rules/experiment-governance.md)
Active: `marketing/experiments/active/` · Completed: `.../completed/` · Rejected: `.../rejected/`

## Data freshness gate

Every number carries its as-of date, checked at the moment of use. A metric without a
visible measured-at date is forbidden in analysis — same status as a fabricated number.

| Data | Stale after |
|---|---|
| Page performance / live page state | 24h |
| Ad + traffic metrics | 24h |
| Conversion / funnel / intent | 48h |

If the newest datapoint is older than its threshold, re-sync first or open with
"No current data — cannot recommend until refreshed."

## Verification rules

- Never claim a file exists or does not exist without checking. Search broadly before
  concluding something is missing.
- Before saying something was built or fixed, show the output that proves it.
- If two consecutive approaches fail, stop and ask Tom.
- When uncertain, say "I haven't verified this yet." Never state an assumption as fact.

## Production permissions — summary

Read-only analysis: allowed. Code and SQL prepared on branches: allowed.
**Deployment, Meta campaign edits, live Shopify changes, Supabase schema changes,
migration application, and merges to `main`: Tom's approval required.**
Existing add-to-cart tracking must not be disturbed. No autonomous experiment launch.

Live infrastructure — do not restart, redeploy or "improve" without asking:
@KRYO_BUILDINGBOT Edge Function, Supabase triggers, RPC functions, scheduled tasks,
`communication_protocols`, `product_context`.

## Current state — 2026-07-31

The dominant measured loss is **mobile add-to-cart**. On the identical template
`/products/kryo2`: desktop 10.4% (77 sessions), mobile 0.18% (545 sessions).
Mobile scrolls *deeper* than desktop. `cta_to_cart_request_rate` is 82% desktop vs 3% mobile.

Full diagnosis:
[audit/b2c-growth-system-activation-2026-07-31/first-conversion-diagnosis.md](audit/b2c-growth-system-activation-2026-07-31/first-conversion-diagnosis.md)

**Do not run a landing-page copy experiment until this is resolved** — its primary metric
is not reliably measurable on the segment carrying 80% of the traffic.

## Code rules

- `@/` import paths, never relative `../../`
- Client Supabase: `import { createClient } from '@/lib/supabase/client'`
- Server Supabase: `import { createClient } from '@/lib/supabase/server'`
- Read `src/types/index.ts` before adding types
- Branch `feature/[name]` off `main`, PR back to `main`, never commit to `main`

## Cost rule

All LLM calls route through Max plan OAuth. Never use Anthropic API keys or OpenRouter
for new automation.
