# Claude Code Bootstrap — install enforcement, then produce value in Session 1
Repo: `~/Desktop/Claude Project/everest-calendar` · 2026-07-31

Read `HANDOFF_CLAUDE_CODE_COMPLETE_2026-07-31.md` + `marketing/agents/SYSTEM.md` first. This file makes
the scaffolding *load and enforce*, then drives the first session to concrete outputs. The measure of
success is the deliverables in Part D existing — not more documents.

---

## PART A — Patch `CLAUDE.md` (add this block; it makes every session boot + close correctly)
```md
## Marketing agent system — MANDATORY boot/close (do not skip)
BOOT (before any marketing work):
1. Read marketing/agents/SYSTEM.md, .claude/rules/evidence-standards.md,
   marketing/data-contracts/{source-of-truth,confirmed-facts,experiment-standards,profitability-and-attribution}.md,
   marketing/agents/{conversion-diagnosis-loop,experiment-launch-playbook,learning-loop}.md.
3. Load MEMORY: open items in marketing/findings/, active learnings, calibration-log, customer-language.
4. State what is KNOWN (with source+n) vs UNKNOWN for the task before acting.

CLOSE (end of every marketing task):
1. Write findings to marketing/findings/ (labelled FACT/PATTERN/HYPOTHESIS/UNKNOWN · source · window · n).
2. Log prediction vs outcome to marketing/agents/calibration-log.md.
3. POSTMORTEM: if anything was wrong/missing, update the responsible rule/agent/contract AND add a
   regression case to marketing/evals/ — an error is not "handled" until the scaffolding changed.

LAWS (override the urge to produce output):
- Honesty over output: if you don't know, say "I don't know" + what you'd need. Never fabricate a number/cause/confidence.
- Confidence capped by n: ≤2 → no rate; <30 → directional, no false precision.
- Confirm facts, don't infer. Reconcile disagreeing sources; never flip silently.
- No scaling/threshold claim while a prerequisite (tracking, confirmed AOV) is red. Profitability = MER, not platform ROAS.
- No self-certification: producer ≠ challenger; red-team before concluding.
- Autonomy split: do reversible/no-spend work; PREPARE spend/live for Tom. Never merge main; never commit secrets.
```

## PART B — Make the 13 agents real subagents (`.claude/agents/*.md`)
For each file below, create `.claude/agents/<name>.md` with frontmatter, keeping the body, and enforce the
`SYSTEM.md` output schema (claim · source+window+n · confidence · what-would-falsify · handoff).
```
---
name: <name>
description: <when to invoke — action-oriented so routing works>
tools: <scoped — see table>
---
```
| Agent (source in marketing/agents/…) | Scoped tools |
|---|---|
| data-analyst · performance-economics · red-team-verifier | Read, Grep, Supabase SQL (read) |
| code-tracking-auditor | Read, Grep |
| live-ux-tester | Playwright/Chrome, Read |
| consumer-psychology · customer-avatar · cro-researcher · creative-testing · voice-of-customer | Read, WebSearch/WebFetch, Supabase SQL (read) |
| meta-ads-expert | Read, WebSearch, Supabase SQL (read) |
| campaign-operator | Read, Bash (the Meta write routes), Supabase SQL |
| page-builder | Read, Bash (Shopify clone/theme routes), Playwright, Supabase SQL |
Orchestrators (conversion-diagnosis-loop, experiment-launch-playbook) are procedures the main agent runs, not subagents.
Verify: `/memory` shows the intended hierarchy; all agents resolve; no CAD/supplier/B2B bleed.

## PART C — SESSION 1: produce value now (ordered; each yields an artifact; BOOT first)
Do the reversible/no-spend work fully; prepare the rest for Tom. Autonomous unless marked (Tom).
1. **Push** the branch (Tom approves the push permission) → PR/commit URL. Artifact: pushed branch.
2. **Fix + verify tracking** — repair `facebook.com/tr`, wire meta-capi into storefront-event, internal
   filter. Artifact: a live add-to-cart shows a **server AddToCart in Meta Test Events** (screenshot/log).
3. **Trustworthy money** — pull real orders + AOV from **Shopify admin**; backfill `shopify_orders`;
   compute **MER** (real revenue ÷ spend). Artifact: `marketing/findings/<date>-mer-and-orders.md` with n + source.
4. **First honest diagnosis** — run the diagnosis loop on the current state; label everything; state what's
   UNKNOWN. Artifact: updated blackboard + a findings entry that passes the `marketing/evals/` rubric.
5. **First Experiment Cards (prepared, not launched)** — (a) sticky-CTA LP variant vs control (page-builder,
   DRAFT + QC + Playwright pass); (b) winner-ad restart at the learning-exit budget (campaign-operator,
   built PAUSED) — each with hypothesis, primary metric, **time-to-significance**, win/kill rule, QC checklist.
   Artifact: two Experiment Cards in `marketing/findings/`.
6. **Predictability dashboard** stub reading the thresholds. Artifact: dashboard renders leading indicators.
7. **Surface the 3 Tom unlocks** with exactly what each enables. Artifact: a short decision list for Tom.

## PART D — Definition of "Session 1 was valuable" (all must exist; else it wasn't)
- [ ] Branch pushed (work no longer stranded).
- [ ] Server AddToCart verified in Meta Test Events (tracking real).
- [ ] Real MER + order count from Shopify, with n + source (money finally trustworthy).
- [ ] One diagnosis that passes the evals rubric (labelled, reconciled, no fabrication).
- [ ] Two prepared Experiment Cards (sticky-CTA LP + winner restart) with time-to-significance + QC.
- [ ] A crisp list of the 3 decisions only Tom can make.
- [ ] CLOSE ran: findings written, calibration logged, any error → scaffolding + eval updated.
If a step is blocked, say so precisely (what's blocked, why, exact input needed) and complete the rest —
do not fabricate to appear complete. A truthful "blocked on X" is valuable; a confident wrong output is not.
```
