# KRYO Marketing Agent System — architecture (read this to understand how it all wires together)

The canonical map. Everything else (rules, contracts, lenses, operators, loops) hangs off this. If a
session doesn't know how the system fits together, it reads this first.

## Three loops
1. **Diagnosis loop** (`conversion-diagnosis-loop.md`) — figure out what's true / what's the biggest lever.
2. **Launch playbook** (`experiment-launch-playbook.md`) — ship a live experiment through gates.
3. **Learning loop** (`learning-loop.md`) — get smarter across sessions (memory + calibration + self-update).

## Orchestration patterns (from Anthropic's agent guidance — use these, don't freelance)
- **Router:** classify the request → diagnosis vs launch vs monitor → the right loop.
- **Orchestrator-workers:** one orchestrator owns the blackboard + stopping decision; it dispatches
  focused lens/operator workers, each in its own context, returning **distilled structured results**.
- **Evaluator-optimizer:** for any generated artefact (creative, copy, LP variant, a diagnosis), a
  *separate* evaluator scores it against a rubric and sends it back to revise. The generator never
  grades its own work (this is the no-self-certification rule, made into a pattern).
- **Summary-and-handoff:** the orchestrator summarises completed work into the blackboard/findings before
  continuing, so context stays focused and nothing rots.

## Agent roster (each = one clear goal, scoped tools, structured output)
**Analysis lenses:** data-analyst · code-tracking-auditor · live-ux-tester · performance-economics ·
consumer-psychology · customer-avatar · cro-researcher.
**Adversary:** red-team-verifier (can send any output back; holds sign-off).
**Growth/creative:** meta-ads-expert · creative-testing · voice-of-customer.
**Operators (execute under approval):** campaign-operator · page-builder.
**Orchestrators:** the diagnosis loop + the launch playbook.

## Every agent conforms to this spec (standardise when mirroring to `.claude/agents/*.md`)
```
---
name: <kebab>
description: <when to invoke — action-oriented, so routing works>
tools: <scoped: read-heavy lenses get search/db; operators get the write routes; nothing more>
---
Goal (one) · Inputs · Process · OUTPUT SCHEMA · Handoff rule · Failure behaviour · Approval boundary
```
**Output schema (all agents return this, not free text):**
`claim · method · source+window+n · confidence(FACT/PATTERN/HYPOTHESIS/UNKNOWN) · what-would-falsify-it · handoff`
Structured results are what let the orchestrator compose lenses reliably.

## Boot order (load at session start — see learning-loop.md)
evidence-standards → data-contracts/* (source-of-truth, confirmed-facts, experiment-standards,
profitability-and-attribution) → MEMORY (findings ledger open items, active learnings, calibration priors)
→ the relevant loop. A session that skipped boot is not trusted.

## How it gets smarter (the point)
Outputs are labelled + auditable → the red-team + evals catch errors → each error updates the
**scaffolding** (a rule/agent/contract), not just the answer → next session boots with the improvement.
The system improves by editing itself, governed by `learning-loop.md` and measured by `../evals/`.

## Non-negotiables (inherited)
Honesty over output ("I don't know" is a valid, good answer). Confidence capped by n. Confirm facts,
don't infer. Reconcile disagreeing sources; never flip silently. Autonomy split: reversible/no-spend
autonomous; spend/live prepared for Tom. No self-certification.
