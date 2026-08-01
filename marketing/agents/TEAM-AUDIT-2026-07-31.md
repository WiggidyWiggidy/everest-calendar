# Why the agents are not working as a team — audit

**Measured 2026-07-31.** Six structural failures. The first alone is sufficient to explain the symptom.

---

## 1. They have never run. Not once. (fatal)

The runtime exposes a fixed roster of subagent types. `.claude/agents/*.md` files are **not in it**
until the session reloads. Proven live this session:

> `Agent type 'red-team-verifier' not found. Available agents: claude, claude-code-guide, …`

Every agent task actually executed today ran as **`general-purpose`** with a prompt I hand-wrote.
So the four "agent" outputs in this session — the red-team, the scaling economics, the change
critique, the forensic — were **not** these agents. They were a generic model reading a bespoke
prompt, with none of the rules, contracts, schema, or instrument gate attached.

**Consequence:** every quality problem attributed to "the agents" is actually a problem with
prompts I wrote ad hoc. The team has never been tested. Judging it on this session is judging
something that never ran.

## 2. No handoff graph — 10 of 13 reference zero other agents

| Agents referencing ≥1 other | 3 (consumer-psychology, creative-testing, meta-ads-expert) |
| Agents referencing none | **10** |

Each is written as a competent solo contributor. None knows who precedes or follows it.
A `handoff` field pointing at nobody is a dead end, not a handoff.

## 3. Four agents are orphaned from the orchestrator

`conversion-diagnosis-loop.md` names **9 of 13**. Unreferenced:
`campaign-operator` · `page-builder` · `creative-testing` · `voice-of-customer`.

They exist, carry rules, and are never invoked by any procedure. Dead code.

## 4. No shared workspace — 0 of 13 know the blackboard exists

`SYSTEM.md` and the diagnosis loop both describe a blackboard as shared state.
**Not one agent file mentions it.** So findings cannot accumulate across lenses; each returns to
the orchestrator and dies there. There is no team memory, only a hub-and-spoke with me as the hub.

## 5. No arbitration rule — nothing decides who wins

Searched for conflict/tie-break/arbitration/overrule. Found only advice
("reconcile disagreeing sources"), never a mechanism. Unanswered:
- If `data-analyst` says the funnel is fine and `live-ux-tester` says the button is unreachable, who wins?
- If `red-team-verifier` breaks a claim, is that advisory or blocking?
- If two lenses disagree, does the loop halt, escalate, or average them?

Without this, "multi-agent" degrades to *whichever output the orchestrator read last* — which is
exactly the failure mode seen today, where each new agent result overwrote the previous framing.

## 6. The schema does not compose — outputs declared, inputs never

| Agents declaring `handoff` (output) | **13 of 13** |
| Agents declaring required **inputs** | **0 of 13** |

Every agent says what it emits. None says what it needs. The orchestrator therefore cannot
sequence them, cannot detect a missing prerequisite, and cannot know when an agent is being run
without the evidence it requires. This is why the loop reads as a list of lenses rather than a
pipeline.

---

## Root cause

**I wrote 13 job descriptions, not a team.**

Each file was authored to be read *by me*, as guidance for work I would then do myself. None was
authored as a process that interacts with other processes. That is why they are individually
reasonable and collectively inert: roles without wiring — no registration, no interfaces, no shared
memory, no conflict resolution, no sequencing.

Adding a 14th agent would not have helped. The missing thing is not more lenses; it is the
**connective tissue** between them.

## Fix order

| # | Fix | Owner |
|---|---|---|
| 1 | **Register the agents** — reload so the roster exposes them. Until then nothing else matters. | Tom (session reload) |
| 2 | Declare `Inputs:` on all 13 so the orchestrator can sequence and detect missing prerequisites | done below |
| 3 | Declare explicit handoff targets → a real graph | done below |
| 4 | Give agents blackboard read/write so findings accumulate | done below |
| 5 | Add an arbitration rule: red-team is blocking; direct measurement beats inference; unresolved conflict escalates rather than averaging | done below |
| 6 | Wire the 4 orphans into a procedure, or delete them | partially — wired into the launch playbook |

## The honest caveat
Fixes 2–6 are the connective tissue. **Fix 1 is the precondition.** Until the runtime exposes these
as spawnable types, this remains a well-organised set of documents, and any claim that "the agent
system works" is unverified.
