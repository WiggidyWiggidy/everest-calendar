## 🚫 DO NOT MODIFY — Infrastructure That Is Live

These systems are running in production. Do NOT restart, redeploy, reconfigure, or "improve" them without explicit Tom approval:

- **@KRYO_BUILDINGBOT** Edge Function (`telegram-bot` on Supabase) — webhook active, handles quick commands + notifications
- **Supabase triggers** (inbox_telegram_notify, cowork_telegram_notify, build_failure_notify, proposal_notify, critical_directive_notify) — real-time push to Telegram
- **9 RPC functions** (get_launch_status, get_pending_inbox, approve_inbox_item, get_contact_briefing, get_launch_blockers, get_product_context, get_drafting_context, check_stale_items, notify_telegram)
- **11 Scheduled tasks** (auto-chain, cost-monitor, morning-digest, morning-agents, orchestrator-daily, proactive-followup, build-executor, draft-responder, alibaba-monitor, system-health-check, sample-campaign-drafter)
- **communication_protocols** table — trust scores are being tracked, do not reset
- **product_context** table — business knowledge base, only ADD entries, never delete

### The Objective (NEVER LOSE THIS)
Tom wants a Telegram assistant that: (1) receives notifications when anyone messages on WhatsApp/Upwork/Alibaba, (2) proposes smart replies with full context, (3) learns from corrections (trust scores), (4) runs autonomously, (5) costs $0 extra (Max plan OAuth only, NEVER paid API or OpenRouter).

### Cost Rule
ALL LLM calls must route through Max plan OAuth (`$CLAUDE_CODE_OAUTH_TOKEN`). Never use Anthropic API keys or OpenRouter for automated calls. Scheduled tasks run under Claude Desktop = $0.

### Build Pipeline
- `build_pipeline` table tracks every known issue, limitation, and fix
- `system_invariants` table stores health checks that must always pass
- `pipeline` command in Telegram → shows top 5 items to fix next
- Every new Claude Code session: run `SELECT did_anything_break()` FIRST — fix before building

### Session Discipline (MANDATORY for every Claude Code session)

**START of session:**
1. Run `SELECT did_anything_break()` — if failures, fix those FIRST
2. Run `SELECT get_next_build_items(5)` — know what's prioritized

**BEFORE every code change:**
1. VERIFY YOUR DIAGNOSIS: State your hypothesis ("X is broken because of Y").
   Find a working counterexample ("Z works — does it have the same pattern as X?").
   If the working example has the same pattern → your hypothesis is wrong → dig deeper.
2. CHECK INFRASTRUCTURE FIRST: Before assuming code is broken, verify the runtime works.
   For scheduled tasks: is the scheduler firing? (check lastRunAt vs nextRunAt)
   For APIs: is the endpoint reachable? For webhooks: is the trigger working?
3. ONE CHANGE AT A TIME: Never propose modifying 3+ similar items in one sweep.
   Change ONE. Verify it works. Only then proceed to the next.
4. State what you're changing in one sentence
5. State what could break if you're wrong
6. Query the current state (SELECT before UPDATE)
7. Confirm no other system depends on this

**AFTER every code change:**
1. Verify with evidence (query result, not assumption)
2. If verification fails: REVERT immediately, don't "fix forward"
3. Log to `build_pipeline` (category='change') or `openclaw_memory`

**CIRCUIT BREAKER:** If 2 consecutive changes fail:
1. STOP immediately — do NOT attempt a third fix
2. Log to `build_pipeline` (category='incident')
3. Send Tom Telegram: "Hit a problem I can't safely fix. [summary]. Waiting for direction."
4. Do not resume until Tom responds

**SESSION CHECKPOINT:** After 5 substantive changes:
1. Run `SELECT check_invariants()` — confirm nothing broke
2. Write session summary to `openclaw_memory`
3. Send Tom a Telegram progress update
4. If any invariant fails: STOP and investigate

**END of session:**
1. Run `SELECT check_invariants()` — final health check
2. Write memory: what was done, what's left, any new pipeline items
3. Update `build_pipeline` statuses for anything resolved

### Scheduled Task Safety (MANDATORY)

Scheduled tasks have DELAYED, INVISIBLE feedback. A bad prompt change won't visibly fail — the task silently doesn't work. Extra caution required.

**BEFORE modifying any scheduled task:**
1. Read at least ONE working task's SKILL.md (e.g., auto-chain, orchestrator-daily) to confirm the patterns you're using actually work in scheduled task context
2. If the task isn't firing: check if the SCHEDULER is the problem (compare lastRunAt vs nextRunAt — if nextRunAt has passed without firing, the scheduler is the issue, not the prompt)
3. Never modify more than ONE task at a time. Wait for verification before modifying the next.

**AFTER modifying a scheduled task:**
1. State the expected verification window ("draft-responder should fire within 10 min")
2. Check `agent_activity_log` for evidence of the task running
3. If no evidence after 2x the expected interval → the change didn't help → investigate further before modifying more tasks

**NEVER:**
- Bulk-modify multiple task prompts in one session without verifying each one fired successfully
- Change a pattern that working tasks use (e.g., raw SQL) to a different pattern (e.g., curl) without evidence that the pattern itself is the problem
- Assume a prompt change fixed the issue without waiting for verification evidence

---

## Guardrails (added 29 Mar 2026 — after failure analysis)

### 1. Alibaba Delivery = Copy-Paste (NOT Chrome Automation)
Chrome MCP has timed out on every Alibaba send attempt since 26 Mar. Do not attempt Chrome-based Alibaba messaging.

**The flow:**
- ATLAS drafts messages, Tom approves via swipe inbox
- Approved messages appear in the "Ready to Send" tab at `/inbox`
- Tom copies the message (one-tap), opens the supplier's Alibaba chat (one-tap), pastes, sends
- Tom clicks "Sent" button to log delivery and advance the negotiation phase

**Every first-contact message must include a WhatsApp bridge line:**
> For faster communication, feel free to reach me on WhatsApp: +86 13002019335

**Goal:** Get every supplier onto WhatsApp within 1-2 messages. Once on WhatsApp, the full automation stack works (Green API sends/receives automatically).

**If a future session tries to build Chrome-based Alibaba send automation:** Stop. Read this section. The last 3 days of attempts all failed. Invest that time elsewhere.

### 2. Business Impact Gate (every session)
Before building anything, answer: **"What business outcome does this produce?"**

- "Tom can send 21 messages to suppliers" = YES
- "Swipe cards look nicer" = NO (not until delivery works)
- "Version control for CAD" = YES (but only if files persist after session ends)

**Session structure:**
1. First 10 min: identify the ONE blocker that's furthest upstream
2. 80% of session on that blocker
3. 20% on downstream polish (only after blocker is resolved or waiting on Tom)

### 3. Proof-of-Existence Rule
Before claiming "X was built":
- `ls` the file to prove it exists on disk
- Query the DB to prove the row exists
- Run the function to prove it works

Never claim "built" or "fixed" based on what you *wrote* -- only based on what you *verified*.

### 4. CAD Files Live in `cad/shell/`
All shell CAD Python files live in `everest-calendar/cad/shell/`. Real git, real PRs, real persistence.

**Before ANY geometry or dimension change:** Enter plan mode. The plan must state:
- What the current baseline is (read from git)
- What's changing and why
- What validation confirms it didn't regress (clearance checks, DXF visual)

### 5. Explain-as-You-Go
Every plan and every output should teach Tom what's happening and why. Show the logic chain. No black boxes. Tom should be able to spot fatal flaws before execution starts.

---

## 🔴 Instant Context — Read This First

**Product**: ISU-001 portable ice shower | **Launch**: 29 Mar 2026 | **Timezone**: WITA (UTC+8)
**Supabase**: `oksemtvjcfzicksmukmz` | **GitHub**: WiggidyWiggidy/everest-calendar | **Vercel**: everest-calendar.vercel.app

### Active Sprint
- **Alper Celik** (engineer, Upwork $21.90/hr) — Sprint 1 started 24 Mar, building outer shell DXF
- **Imran** (CAD designer, Fiverr) — STEP files for CP checkpoints. Cultural rules in `communication_protocols` — always check before drafting
- **J / Jay** (Alpicool, Foshan) — 3 blocking factory measurements outstanding: display offset, display width, corner radii. Tier 2: every message needs Tom approval
- Tom in Guangzhou ~26 Mar for factory trip

### CoWork Tables (core data layer)
| Table | Purpose |
|---|---|
| `cowork_messages` | Inbound WhatsApp messages from Imran/Jay |
| `cowork_contacts` | Contact routing — who gets what pipeline |
| `communication_protocols` | Per-contact reply rules (JSONB) — ALWAYS read before drafting |
| `platform_inbox` | Approval queue — Tom approves before any external send |
| `orchestrator_directives` | Agent task queue — status: pending/acknowledged/completed/cancelled ONLY |
| `agent_memories` | Per-agent accumulated learning — read before running any agent |
| `agents` | Agent definitions + system_prompts (4 agents: Jeet Designer, Engineer Communication, Chinese Negotiator, Product Agent) |
| `draft_corrections` | Learning loop — approve/edit/reject history |
| `task_backlog` | Build queue — build_status: queued/building/pr_raised/approved/rejected/failed ONLY |
| `system_proposals` | Improvement proposals awaiting Tom's APPROVE/REJECT |
| `agent_activity_log` | All agent run logs |
| `supplier_conversations` | Per-supplier per-component negotiation tracking — phase, quotes, message history, target prices |

### External Message Routing (DO NOT confuse)
- **Imran/Jay → Vercel webhook** `/api/webhooks/whatsapp` → Green API → platform_inbox for Tom approval
- **Tom's commands → Telegram → Claude** (this session)
- Owner messages never go through the webhook. External contacts never go through Claude directly.

### Cost Rules
- Never add Sonnet/Opus as automatic fallbacks
- OpenRouter spending cap must stay at $2/day
- Scheduled tasks run on Max plan — $0 incremental cost

---

## Telegram -- DEPRECATED as command interface (29 Mar 2026)

Telegram is no longer used as the primary interface. All interaction happens through the Vercel web dashboard (`everest-calendar.vercel.app`).

**What's still running (passive, do not remove):**
- Supabase notification triggers (inbox_telegram_notify, cowork_telegram_notify, etc.) -- free push alerts
- @KRYO_BUILDINGBOT Edge Function -- handles those notifications

**What's stopped:**
- Channels tmux session (no longer needed)
- Telegram as command interface
- Inline keyboard approvals
- Telegram Mini App approvals

**Do NOT build new Telegram features.** All UI investment goes to the Vercel dashboard.

---

## Approval & Message Delivery

**All approvals happen via the web dashboard at `/inbox`:**
- Pending tab: swipe right to approve, left to skip
- Ready to Send tab: copy message, open supplier chat, paste, mark as sent
- Done tab: completed items

**Approval tiers (still apply):**
- **Tier 0 (auto):** Internal queries, logging, pipeline updates
- **Tier 1 (draft + Tom approves via dashboard):** External messages, task assignments, follow-ups
- **Tier 2 (Tom writes):** Factory pricing with Jay, financial commitments >$50, contract changes

**Message delivery by platform:**
- **WhatsApp:** Automatic via Green API (handled by approve endpoint)
- **Alibaba:** Copy-paste from Ready to Send tab (Chrome deprecated)
- **Upwork:** Chrome MCP still viable for lighter site

**Learning from edits:** The API logs to `draft_corrections` and updates trust scores automatically.

### Supplier Conversation Tracking

**Before drafting any supplier message:**
1. Query `rpc/get_conversation_thread` for full history
2. Read negotiation phase, quote trajectory, and previous messages
3. Cross-reference with `product_context` (negotiation_playbook, chinese_comms_protocol)

**After any supplier message is sent:**
1. Call `rpc/log_supplier_message` with: supplier_key, component_name, direction, content, channel
2. If supplier quoted a price: include p_quote_usd
3. If phase changed: UPDATE supplier_conversations SET negotiation_phase = '[new_phase]'

**Supplier keys:** steven, ally, stella, demi, jack, jay

**Supplier storefront URLs (for Ready to Send links):**
- Steven Huang (Jialongfu): jialongfu.en.alibaba.com
- Ally Won (Boke): dgbkjm.en.alibaba.com
- Stella Yu (Perfect Precision): szperfect888.en.alibaba.com
- Demi En (Xiang Xin Yu): xxyuprecision.en.alibaba.com
- Jack Ye (Fuzhan): fuzhan-tops.en.alibaba.com

### Contact Rules

- **Imran**: Max 3 actions per message. Single deliverable. Frame corrections as spec clarifications. "OK/Noted" = meaningless -- ask for the file. Silence > 24h = stuck. Owner signoff required.
- **Jay/Alpicool**: Tier 2 -- every message needs Tom's approval. Formal technical language. Batch requests. mm only. Never discuss pricing in measurement requests.
- **Alper**: Sprint-based ($21.90/hr). Clear task specs with deliverables and deadlines. Communicates on Upwork, not WhatsApp.
- **Alibaba suppliers**: Include product identifiers + PO reference. "Gathering quotes -- no commitment." Never agree to prices. Professional but direct.

# Everest Calendar — Claude Code Context

## ⚠️ CRITICAL — Read Before ANY Change

This system has TWO independent LLM pipelines processing WhatsApp messages:
1. **Vercel webhook** (`/api/webhooks/whatsapp`) — calls Mistral + Haiku via OpenRouter
2. **OpenClaw gateway** (local, port 18789) — calls Haiku via OpenRouter

**They share the same OpenRouter API key.** Changes to either affect both. Before writing code:
- How many LLM calls does this change trigger? Count them.
- Could this cause double-billing? (Both pipelines processing same message)
- What happens when it fails? Does it retry? How expensive is the fallback?
- Owner messages → handled by OpenClaw ONLY. Webhook skips them.
- External contacts (Imran, suppliers) → handled by webhook ONLY.

**Supabase project:** `oksemtvjcfzicksmukmz` (NOT the old `fwvdcchsoaxkmodyjqzj`)
**OpenRouter key:** shared across OpenClaw + Vercel webhook — spending limit MUST be set

## System Architecture — Background Processes

### LaunchAgents (macOS, always running)
| Agent | Schedule | What it does | LLM cost |
|-------|----------|-------------|----------|
| `ai.openclaw.gateway` | KeepAlive | OpenClaw gateway + WhatsApp Web bridge | Per-message (~$0.02) |
| `ai.openclaw.auto-chain` | Every 30 min | Checks `orchestrator_directives` for pending work, runs agents | $0.01-0.05 if directives found |
| `ai.openclaw.morning-agents` | 7:00 AM | Runs all 4 Cowork agents sequentially | ~$0.08/run |
| `ai.openclaw.orchestrator-cron` | 7:00 AM | Analyses agent state, proposes improvements | ~$0.02/run |
| `ai.openclaw.digest-cron` | 6:00 AM | Daily progress digest to WhatsApp | ~$0.01/run |
| `ai.openclaw.cost-monitor` | Every 2h | Checks OpenRouter spend, alerts if >$1/day | $0 (no LLM) |

### Vercel Crons
| Cron | Schedule | What it does |
|------|----------|-------------|
| `/api/cron/cowork-followup` | Daily midnight UTC | Follows up with silent contacts (calls Anthropic Haiku) |
| `/api/cron/process-directives` | Daily 6am UTC | Processes queued directives |

### Tables with Auto-Processors (inserting rows = triggering work = spending money)
- `orchestrator_directives` (status=pending) → auto-chain picks up every 30 min
- `system_proposals` (status=pending) → Tom APPROVE/REJECT via WhatsApp
- `platform_inbox` (status=pending) → Tom approves in web UI
- `task_backlog` (build_status=queued) → build watcher (currently DISABLED)

## Project Overview
Everest Calendar is a product launch command centre for Everest Labs.
The owner (Tom) is the sole user. Physical product: Ice Showers. Launch: March 29 2026.

## Repo & Deployment
- GitHub: WiggidyWiggidy/everest-calendar
- Production: everest-calendar.vercel.app (auto-deploys from main)
- Branch convention: feature/[name] off main, PR back to main
- Never commit directly to main

## Stack
- Next.js 14 App Router (TypeScript strict)
- Tailwind CSS + shadcn/ui + Radix
- Supabase (Postgres + Auth + RLS + Realtime)
- Anthropic Claude API (claude-sonnet-4-20250514)
- Vercel (auto-deploy)

## File Structure
```
src/
  app/
    (app)/              # Protected routes (require auth)
      dashboard/        # Main dashboard
      calendar/         # Calendar view
      chat/             # Chat interface
      agents/           # Agent management
      settings/
    (auth)/             # Login / signup
    api/                # API routes
      assistant/        # Main AI assistant
      chat/
      focus/            # Focus dashboard API
      generate-outline/ # Build task outline generation
      process-thoughts/ # Brain dump processor
      thoughts/
      webhooks/
        github/
        openclaw/       # OpenClaw build pipeline webhook
  components/
    agents/             # Agent UI components
    calendar/           # Calendar components
    focus/              # Focus dashboard components
    global/             # App-wide components (VoiceCapture, MobileCommandBar)
    layout/             # Sidebar
    ui/                 # shadcn/ui base components
  hooks/                # Custom React hooks
  lib/
    supabase/           # Supabase client/server/middleware
    agents.ts
    memories.ts
    task-backlog.ts
    thoughts.ts
    utils.ts
  types/
    index.ts            # Core types — READ THIS BEFORE ADDING NEW TYPES
    focus.ts            # Focus dashboard types
    speech.d.ts
  middleware.ts
supabase/
  migrations/           # SQL migrations — READ BEFORE ADDING TABLES
```

## ⚠️ Rules Before Writing Any Code

1. **Read `src/types/index.ts` before adding types.**
   EventCategory ≠ TaskCategory — never conflate these.
   TaskStatus, EventStatus, EventCategory are already defined.

2. **Read `supabase/migrations/` before adding tables.**
   Existing migrations: `daily_focus_tables.sql`, `voice_to_build_tables.sql`
   Never create duplicate tables or conflicting column names.

3. **Check `src/components/` before creating components.**
   Avoid duplicate names. Use existing shadcn/ui components from `src/components/ui/`.

4. **Use the Supabase client correctly:**
   - Client-side: `import { createClient } from '@/lib/supabase/client'`
   - Server-side (API routes): `import { createClient } from '@/lib/supabase/server'`

5. **Import paths use `@/` alias** — never relative `../../` from src root.

6. **Never add new Supabase tables without a migration file** in `supabase/migrations/`.

7. **One concern per branch** — never combine different features in one commit.

## Existing Tables (Supabase)
- `calendar_events` — core calendar events
- `task_backlog` — build queue and business tasks
- `agent_memory` — agent memory/notes
- `raw_thoughts` — brain dump inputs
- `chat_messages` — chat history
- `daily_focus_sessions` — focus dashboard sessions
- `focus_tasks` — focus dashboard tasks
- `voice_conversations` — voice interface logs
- `ai_usage_log` — per-build API cost tracking (columns: user_id, operation, input_tokens, output_tokens, cost_usd, created_at)
- `agent_conversations` — agent conversation threads
- `agent_messages` — individual messages within agent conversations (columns: id, conversation_id, role [user|assistant], content, created_at)
- `cowork_messages` — inbound WhatsApp messages from external contacts
- `cowork_contacts` — contact routing configuration
- `communication_protocols` — per-contact reply rules (JSONB)
- `platform_inbox` — unified approval queue (status: pending/approved/edited/rejected/auto_sent/snoozed/transitioned; platform: whatsapp/upwork/alibaba/system)
- `orchestrator_directives` — agent task queue (status: pending/acknowledged/completed/cancelled ONLY)
- `agents` — agent definitions with system_prompts
- `agent_memories` — per-agent accumulated memory (memory_type: manual/auto/system_prompt)
- `agent_activity_log` — all agent execution logs
- `system_proposals` — improvement proposals (status: pending/approved/rejected/feedback_given/queued/implemented/verified)
- `draft_corrections` — learning loop: approve/edit/reject history

## task_backlog build_status values (CHECK CONSTRAINT — only these are valid)
`queued` | `building` | `pr_raised` | `approved` | `rejected` | `failed`

⚠️ Never use any other value (e.g. "dismissed", "complete", "done") — the check constraint will reject it with a Postgres error.

## Existing Types (src/types/index.ts)
- `EventCategory`: product | marketing | content | meeting | deadline
- `EventPriority`: high | medium | low
- `EventStatus`: planned | in-progress | done
- `CalendarEvent`, `EventFormData`, `TaskBacklogItem`

## When Complete
Run: `git add -A && git commit -m "feat: [feature name]"`
Do not push — the runner handles push and PR creation.
