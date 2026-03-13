# Everest Calendar — Claude Code Context

## Project Overview
Everest Calendar is a product launch command centre for Everest Labs.
The owner (Big Dog) is the sole user. The system is built to answer one
question on open: "Am I on track for my launch date?"

Physical product: Ice Showers. Launch date: March 29 2026.

## Repo & Deployment
- GitHub: WiggidyWiggidy/everest-calendar
- Production: everest-calendar.vercel.app (auto-deploys from main)
- Branch convention: feature/[name]
- Always branch from main, PR back to main
- Never commit directly to main

## Stack
- Next.js 14 App Router
- Tailwind CSS + shadcn/ui + Radix
- Supabase (Postgres + Auth + RLS + Realtime)
- Anthropic Claude API (claude-sonnet-4-20250514 default)
- Vercel (auto-deploy)
- TypeScript strict mode

## File Structure
src/
  app/
    (app)/              # Protected routes (require auth)
      dashboard/page.tsx
      calendar/page.tsx
      chat/page.tsx
      agents/page.tsx
      settings/page.tsx
      layout.tsx        # Auth check + Sidebar + VoiceCapture global
    (auth)/
      login/page.tsx
      signup/page.tsx
    api/
      assistant/route.ts        # Primary agentic loop — 8 tools
      chat/route.ts             # Legacy chat (chat page only)
      thoughts/route.ts         # Save raw thought
      process-thoughts/route.ts # Batch analyst processing
      agents/optimise-memory/route.ts
    globals.css
    layout.tsx
  components/
    CommandCentre.tsx       # Floating command panel (bottom-right pill)
    global/
      VoiceCapture.tsx      # 3-line re-export of CommandCentre
    layout/
      Sidebar.tsx
    calendar/
      CalendarGrid.tsx      # Month view
      WeekView.tsx          # Week view
      DayPanel.tsx          # Right-side slide panel (day detail)
      EventDialog.tsx       # Create/edit modal
    agents/
      AgentSelector.tsx
      MemoryPanel.tsx
      ChatPanel.tsx
      AnalystDashboard.tsx
      TaskCard.tsx
      MemoryNoteCard.tsx
      MemorySuggestionBanner.tsx
      OptimiseMemoryModal.tsx
      PromptSettingsModal.tsx
      NewAgentDialog.tsx
    ui/                     # shadcn/ui components (never modify)
  hooks/
    useSpeechRecognition.ts
  lib/
    agents.ts               # Agent + conversation CRUD
    analyst-config.ts       # Analyst prompt CRUD
    memories.ts             # Agent memory CRUD
    slashCommands.ts        # /dump /feature /schedule /erins parser
    task-backlog.ts         # Task CRUD + launch tasks
    thoughts.ts             # Raw thoughts CRUD
    utils.ts                # cn() only
    hooks/
      useEvents.ts          # Calendar events with realtime
    supabase/
      client.ts             # Browser client
      server.ts             # Server client
      middleware.ts         # Session refresh
  types/
    index.ts                # ALL types live here
    speech.d.ts             # Web Speech API declarations
  middleware.ts             # Route protection
supabase/
  schema.sql
  agents-schema.sql
  memory-optimiser-migration.sql
  migrations/voice_to_build_tables.sql

## Database Schema

### calendar_events
| Column       | Type      | Notes                                              |
|--------------|-----------|-----------------------------------------------------|
| id           | UUID PK   |                                                    |
| user_id      | UUID FK   | auth.users                                         |
| title        | TEXT      |                                                    |
| description  | TEXT      | nullable                                           |
| event_date   | DATE      | stored as 'YYYY-MM-DD' string in JS                |
| event_time   | TIME      | nullable, 'HH:MM' in JS                            |
| category     | TEXT      | ENUM: product, marketing, content, meeting, deadline |
| priority     | TEXT      | ENUM: high, medium, low                            |
| status       | TEXT      | ENUM: planned, in-progress, done                   |
| is_big_mover | BOOLEAN   | default false — flags high-impact events           |
| created_at   | TIMESTAMPTZ |                                                  |
| updated_at   | TIMESTAMPTZ |                                                  |

### task_backlog
| Column             | Type      | Notes                                          |
|--------------------|-----------|------------------------------------------------|
| id                 | UUID PK   |                                                |
| user_id            | UUID FK   |                                                |
| title              | TEXT      |                                                |
| description        | TEXT      |                                                |
| category           | TEXT      | free-text currently (Stage 1 will add enum)    |
| priority_score     | INTEGER   | 1–10                                           |
| status             | TEXT      | ENUM: pending, approved, in-progress, done, dismissed |
| source_thought_ids | UUID[]    |                                                |
| is_launch_task     | BOOLEAN   | true = shown in Launch Dependencies on dashboard |
| due_date           | DATE      | nullable                                       |
| created_at         | TIMESTAMPTZ |                                              |

### raw_thoughts
| Column     | Type        | Notes                                        |
|------------|-------------|----------------------------------------------|
| id         | UUID PK     |                                              |
| user_id    | UUID FK     |                                              |
| text       | TEXT        |                                              |
| status     | TEXT        | ENUM: unprocessed, processed, archived       |
| created_at | TIMESTAMPTZ |                                              |

### agents
| Column             | Type        | Notes                                    |
|--------------------|-------------|------------------------------------------|
| id                 | UUID PK     |                                          |
| user_id            | UUID FK     |                                          |
| name               | TEXT        |                                          |
| description        | TEXT        | nullable                                 |
| icon               | TEXT        | emoji                                    |
| system_prompt      | TEXT        | use {memory_notes} placeholder           |
| auto_learn         | BOOLEAN     |                                          |
| last_optimised_at  | TIMESTAMPTZ | nullable                                 |
| agent_type         | TEXT        | ENUM: chat, analyst                      |
| created_at         | TIMESTAMPTZ |                                          |
| updated_at         | TIMESTAMPTZ |                                          |

### agent_memories
| Column      | Type        | Notes                                        |
|-------------|-------------|----------------------------------------------|
| id          | UUID PK     |                                              |
| agent_id    | UUID FK     | agents                                       |
| user_id     | UUID FK     | auth.users                                   |
| title       | TEXT        |                                              |
| content     | TEXT        |                                              |
| memory_type | TEXT        | ENUM: manual, auto, system_prompt            |
| is_archived | BOOLEAN     | soft-delete for optimiser                    |
| created_at  | TIMESTAMPTZ |                                              |
| updated_at  | TIMESTAMPTZ |                                              |

### agent_conversations
| Column     | Type        | Notes     |
|------------|-------------|-----------|
| id         | UUID PK     |           |
| agent_id   | UUID FK     |           |
| user_id    | UUID FK     |           |
| title      | TEXT        | nullable  |
| created_at | TIMESTAMPTZ |           |

### agent_messages
| Column          | Type        | Notes                    |
|-----------------|-------------|--------------------------|
| id              | UUID PK     |                          |
| conversation_id | UUID FK     | agent_conversations      |
| user_id         | UUID FK     |                          |
| role            | TEXT        | ENUM: user, assistant    |
| content         | TEXT        |                          |
| created_at      | TIMESTAMPTZ |                          |

### analyst_config
One row per user. Stores the editable Analyst master prompt.

## TypeScript — Key Type Enums

### EventCategory (calendar_events.category)
'product' | 'marketing' | 'content' | 'meeting' | 'deadline'
Defined in: src/types/index.ts as EventCategory
Color map: CATEGORY_COLORS in src/types/index.ts
Label map: CATEGORY_LABELS in src/types/index.ts

### TaskCategory (task_backlog.category) — Stage 1 will enforce this
'marketing' | 'product' | 'operations' | 'everyday'
⚠️ CRITICAL: TaskCategory !== EventCategory. Never conflate these two enums.
EventCategory is for calendar_events. TaskCategory is for task_backlog.

### EventStatus
'planned' | 'in-progress' | 'done'

### TaskStatus
'pending' | 'approved' | 'in-progress' | 'done' | 'dismissed'

## Environment Variables
NEXT_PUBLIC_SUPABASE_URL      — browser + server
NEXT_PUBLIC_SUPABASE_ANON_KEY — browser + server
ANTHROPIC_API_KEY             — server only (never expose to browser)

## Supabase Client Pattern
Browser components: import { createClient } from '@/lib/supabase/client'
API routes / Server Components: import { createClient } from '@/lib/supabase/server'
RLS is enabled on all tables — every query is automatically scoped to auth.uid()
Never pass user_id manually in SELECT queries — RLS handles it
Always pass user_id in INSERT queries

## API Route Pattern
All API routes:
1. Import createClient from '@/lib/supabase/server'
2. Call supabase.auth.getUser() — return 401 if no user
3. Parse request body
4. Execute Supabase/Anthropic operation
5. Return NextResponse.json()

The /api/assistant route runs an agentic loop (max 5 iterations).
It supports two calling modes:
  - ChatPanel: sends { messages, agent_id } (snake_case)
  - CommandCentre: sends { messages, agentId, conversationId } (camelCase)
Never change this dual-mode signature.

## Assistant Tools (currently in /api/assistant/route.ts)
create_calendar_event
update_calendar_event
delete_calendar_event
get_calendar_events
get_launch_tasks
update_launch_task
batch_update_calendar_events
save_raw_thought

Adding a new tool requires:
1. Add tool definition object to the TOOLS array
2. Add handler block in the executeTool function
3. Add ActionTaken type union in src/types/index.ts

## Component Conventions
- All client components: 'use client' at top
- shadcn/ui components live in src/components/ui/ — never modify these
- New feature components go in src/components/[feature-name]/
- Global components (visible on all pages) go in src/components/global/
- Import alias: @/ maps to src/

## Styling Conventions
- Tailwind utility classes only
- CSS variables defined in src/app/globals.css
- shadcn/ui CSS variable names: --background, --foreground, --primary, etc.
- Never use inline styles except for dynamic values (e.g. width percentages)
- Indigo-600 is the primary brand colour
- Amber is used exclusively for Big Mover highlights
- Red is used for overdue/urgent states

## Build Roadmap (do not architect against these)
Stage 1: Enforce task category enum (marketing/product/operations/everyday)
Stage 2: Task board Kanban page (/tasks)
Stage 3: Daily planner + time blocks
Stage 4: North Star dashboard (profit/hr metric)
Stage 5: Outputs tracker + ICE matrix
Stage 6: Agent scheduling intelligence

## What NOT to Touch
- src/components/ui/* — shadcn/ui, never modify
- src/middleware.ts — auth routing, do not change
- src/lib/supabase/* — Supabase client setup, do not change
- supabase/schema.sql — reference only, apply migrations in Supabase dashboard
- The dual-mode signature in /api/assistant/route.ts

## Common Mistakes to Avoid
1. Using EventCategory values in task_backlog.category — wrong type
2. Using TaskCategory values in calendar_events.category — wrong type
3. Creating a new Supabase client inside a loop — create once per function
4. Calling supabase.auth.getUser() in client components instead of hooks
5. Adding 'use client' to API routes — they are server-only
6. Hard-coding user_id in SELECT queries — RLS handles scoping
7. Importing from @/lib/supabase/server in client components — will throw

## Sprint 0 Features (all live)
- Launch countdown (dashboard, reads localStorage 'everest_launch_date')
- Launch tasks remaining stat card
- Big Mover flag on calendar_events (amber, 🎯)
- Today's Big Mover banner on dashboard
- Overdue events counter
- Completion rate bar (calendar events + launch tasks combined)
- Launch checklist with quick-add (bypasses Analyst, is_launch_task=true)
