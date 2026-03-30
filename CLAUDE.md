## Do Not Modify Without Tom's Approval

Live infrastructure -- do not restart, redeploy, or "improve" without asking:
- @KRYO_BUILDINGBOT Edge Function, Supabase triggers, 9 RPC functions, 11 scheduled tasks
- `communication_protocols` table (trust scores), `product_context` table (business KB)

### Objective
Web dashboard (`everest-calendar.vercel.app`) that: (1) manages supplier negotiations, (2) proposes smart replies with context, (3) learns from corrections, (4) costs $0 extra (Max plan OAuth only).

### Cost Rule
ALL LLM calls route through Max plan OAuth. Never use Anthropic API keys or OpenRouter for new automation. OpenRouter $2/day cap applies to legacy OpenClaw.

---

## Session Discipline (MANDATORY)

**START of session:**
1. Run `SELECT did_anything_break()` -- fix failures FIRST
2. Answer: "What business outcome will this session produce?"

### Verification Rules (CRITICAL)

- NEVER claim a file exists or doesn't exist without using find/Glob/ls to verify
- When a file isn't found, search BROADLY (`find ~/Desktop -name "filename"`) before concluding it's missing
- NEVER say "X is broken" or "X was deleted" -- say "I couldn't find X at [path], let me search more broadly"
- Before saying something was "built" or "fixed": show the tool call output that proves it
- If 2 consecutive approaches fail, STOP and ask Tom before trying a 3rd
- When uncertain, say "I haven't verified this yet" -- never state assumptions as facts

### CAD File Safety

- CAD files: `/Users/happy/Desktop/ISU001_SHELL_CAD/` (primary, git) and `everest-calendar/cad/shell/` (backup)
- Before ANY CAD edit: run `python3 dimensions.py` to get current validation state
- After ANY CAD edit: re-run validation. If new failures appear, revert immediately
- DXF export BLOCKED if validation fails -- `validate_before_export()` enforces this
- NEVER modify dimensions without stating the source (factory_caliper, step_caliper, spec, design)
- MUST enter plan mode before any geometry or dimension change

### Before Every Code Change
1. State your hypothesis in one sentence
2. Find a working counterexample -- if it uses the same pattern, your hypothesis is wrong
3. ONE CHANGE AT A TIME. Change one, verify, then proceed.
4. State what could break if you're wrong
5. Query current state before updating (SELECT before UPDATE)

### Critique Loop (before any multi-file change)
Before executing a plan, state 3 ways this plan could fail or produce the wrong result.
Address each failure mode in the plan before writing code.
If you can't identify failure modes, the plan isn't specific enough -- make it more specific first.

### After Every Code Change
1. Verify with evidence (query result, not assumption)
2. If verification fails: REVERT immediately, don't "fix forward"
3. Log to `openclaw_memory`

### Circuit Breaker
If 2 consecutive changes fail: STOP. Log to `build_pipeline`. Tell Tom. Do not resume until Tom responds.

### End of Session
1. Run `SELECT check_invariants()` -- final health check
2. Write to `openclaw_memory`: what was done, what's left, what's broken
3. Update `build_pipeline` for anything resolved

---

## Guardrails (29 Mar 2026)

### 1. Alibaba = Copy-Paste (NOT Chrome)
Chrome MCP times out on Alibaba. Do not attempt it.
- Tom approves via swipe inbox, copies from "Ready to Send" tab, pastes into Alibaba chat, clicks "Sent"
- Every first-contact message includes: "For faster communication, feel free to reach me on WhatsApp: +86 13002019335"
- Goal: move every supplier to WhatsApp where full automation works

### 2. Business Impact Gate
Before building anything: "What business outcome does this produce?"
- 80% of session on the furthest-upstream blocker
- 20% on polish (only after blocker resolved)

### 3. Proof-of-Existence
Before claiming "X was built": `ls` the file, query the DB, run the function. Never claim "built" based on what you wrote -- only what you verified.

### 4. Explain-as-You-Go
Every plan shows the logic chain. Tom should spot fatal flaws before execution starts. No black boxes.

---

## Approval & Message Delivery

All approvals via web dashboard at `/inbox`:
- **Pending tab:** swipe right = approve, left = skip
- **Ready to Send tab:** copy message, open supplier chat, paste, click "Sent"
- **Done tab:** completed items

**Tiers:** 0 = auto (internal), 1 = draft + Tom approves, 2 = Tom writes (Jay pricing, commitments >$50)

**Platforms:** WhatsApp = auto via Green API. Alibaba = copy-paste. Upwork = Chrome MCP.

### Supplier Tracking
Before drafting: query `rpc/get_conversation_thread`. After sending: call `rpc/log_supplier_message`.
Supplier keys: steven, ally, stella, demi, jack, jay

### Contact Rules
- **Imran**: Max 3 actions/message. Single deliverable. "OK/Noted" = ask for the file. Silence >24h = stuck.
- **Jay/Alpicool**: Tier 2. Formal technical language. mm only. Never discuss pricing in measurement requests.
- **Alper**: Sprint-based ($21.90/hr). Upwork only.
- **Alibaba suppliers**: Include product identifiers. "Gathering quotes -- no commitment." Never agree to prices.

---

## Telegram -- DEPRECATED
Passive notifications still run (free). Do not build new Telegram features. All UI goes to Vercel dashboard.

## Two Systems -- Do Not Confuse
- **This system** (everest-calendar): Claude Code + Supabase + scheduled tasks + web dashboard
- **OpenClaw** (separate, legacy): Local Node.js gateway for personal WhatsApp only
- They share the same Supabase DB and OpenRouter key. Do NOT edit `~/.openclaw/` files.

## Key Tables
| Table | Purpose | Valid statuses |
|-------|---------|---------------|
| `platform_inbox` | Approval queue | pending, approved, edited, rejected, auto_sent, snoozed, transitioned |
| `orchestrator_directives` | Agent task queue | pending, acknowledged, completed, cancelled |
| `task_backlog` | Build queue | queued, building, pr_raised, approved, rejected, failed |
| `system_proposals` | Improvement proposals | pending, approved, rejected, feedback_given, queued, implemented, verified |
| `supplier_conversations` | Negotiation tracking | (negotiation phases) |
| `communication_protocols` | Per-contact rules + trust scores | |
| `draft_corrections` | Learning loop | |

Never use status values outside those listed -- Postgres CHECK constraints will reject them.

## Code Rules
- Use `@/` import paths, never relative `../../`
- Client Supabase: `import { createClient } from '@/lib/supabase/client'`
- Server Supabase: `import { createClient } from '@/lib/supabase/server'`
- Read `src/types/index.ts` before adding types
- Branch convention: `feature/[name]` off main, PR back to main, never commit to main

## Every Response (after completing substantive work)

After every task, always end with these two lines:
- **Next**: Single most impactful action to take now, and why
- **Gap**: One thing that's still missing, unverified, or could break
