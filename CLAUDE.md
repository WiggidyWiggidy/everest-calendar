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
