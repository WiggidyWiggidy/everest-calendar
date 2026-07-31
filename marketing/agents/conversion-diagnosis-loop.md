# Conversion Diagnosis Loop (orchestrator)

An agentic loop that keeps iterating until the diagnosis is *complete and corroborated*, not until
it feels done. Best run in Claude Code (can spawn subagent lenses, run Playwright, hold state).
One orchestrator + on-demand lenses — NOT an always-on swarm.

Loads: `.claude/rules/evidence-standards.md`, `data-contracts/*`, `diagnostic-protocol.md`.

## The blackboard (persistent state — the anti-"conclude quickly" device)
Maintain one file per investigation in `marketing/findings/<date>-<topic>-blackboard.md`:
```
Funnel step | metric | best source | value (n) | status | dominant-loss?
Hypothesis  | for step | prediction | test | assigned lens | status(OPEN/CONFIRMED/REFUTED) | evidence
```
Nothing may be called "the answer" while any dominant-loss hypothesis is OPEN.

## The loop
1. **Frame:** state the question + the decision it feeds + the Definition of Done (below).
2. **Map the funnel:** quantify every step from a canonical source (or mark UNKNOWN + why). Identify
   the candidate dominant-loss step(s).
3. **Enumerate hypotheses** for the dominant loss across ALL lenses (data, code, live-UX, research).
   Put them on the blackboard as OPEN.
4. **Assign & gather:** dispatch each OPEN hypothesis to the right lens(es) to collect evidence.
5. **Corroborate:** a hypothesis → CONFIRMED only when ≥2 independent methods agree AND its
   discriminating test passed. One source is never enough.
6. **Red-team:** the Verifier lens tries to falsify every CONFIRMED finding. If it can, status → OPEN.
7. **Update beliefs & confidence** on the blackboard.
8. **Stopping check** (below). If not met → loop to step 3 with the still-OPEN items. If blocked →
   escalate (below). Hard cap: if 3 full iterations pass without progress on an item, escalate it.
9. **Output:** ranked highest-leverage changes, each tied to a CONFIRMED cause + expected mechanism
   + measurement plan. Owner-decisions vs agent-actions separated.

## Definition of Done — ALL must hold
- [ ] Every funnel step quantified from a canonical source (adequate sample) OR explicitly UNKNOWN+why.
- [ ] Dominant-loss step corroborated by ≥2 independent sources.
- [ ] The cause of the dominant loss has ≥1 hypothesis promoted to CONFIRMED (its falsification test ran and it survived).
- [ ] Red-team attempted and FAILED to break the top conclusion.
- [ ] Top 1–3 changes named, each mapped to the confirmed cause, each with a measurement plan.
- [ ] No claim violates evidence-standards (sample caps, source contract, no inferred facts).

## Keep going — do NOT stop while any is true
- A dominant-loss hypothesis is still OPEN (untested).
- Sources disagree and the gap is unexplained.
- The dominant loss rests on a single source.
- A cheaper available test could raise confidence and hasn't been run.

## Escalate to human — keep the loop honest (don't spin, don't fake)
Stop and ask *precisely* when:
- A required capability is unavailable in this environment (e.g. live browser → hand to Claude Code + Playwright).
- A decision-critical fact is UNKNOWN and unconfirmable from data (→ ask Tom, record in confirmed-facts).
- A production action (deploy, campaign change) is required (→ Tom approval).
Escalation states: what's blocked, why, the exact input needed, and what's ready to run the moment it arrives.

## Lenses (invoked on demand — see marketing/agents/lenses/)
data-analyst · code-tracking-auditor · live-ux-tester · cro-researcher · red-team-verifier.
Each returns: claim + method + evidence + confidence + what would falsify it. The orchestrator, not
any single lens, owns the blackboard and the stopping decision.
