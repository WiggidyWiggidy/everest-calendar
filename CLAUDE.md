# Everest Calendar — Claude Code Context

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

## Existing Types (src/types/index.ts)
- `EventCategory`: product | marketing | content | meeting | deadline
- `EventPriority`: high | medium | low
- `EventStatus`: planned | in-progress | done
- `CalendarEvent`, `EventFormData`, `TaskBacklogItem`

## When Complete
Run: `git add -A && git commit -m "feat: [feature name]"`
Do not push — the runner handles push and PR creation.
