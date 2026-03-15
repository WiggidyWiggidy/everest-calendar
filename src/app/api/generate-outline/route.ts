// ============================================
// POST /api/generate-outline
// Generates a step-by-step technical execution outline for a build task.
// Injects live codebase context so the outline is accurate and buildable.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

function getCwdContext(): string {
  const cwd = process.cwd();
  const lines: string[] = [];

  // 1. Installed packages (only use these — no inventing deps)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    lines.push('## Installed packages (use ONLY these — never npm install anything new)\n' + deps.join(', '));
  } catch {}

  // 2. Existing file tree
  try {
    const walk = (dir: string, prefix = ''): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const e of entries) {
        if (['node_modules', '.next', '.git', 'public'].includes(e.name)) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        out.push(rel);
        if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
      }
      return out;
    };
    const tree = walk(path.join(cwd, 'src'));
    lines.push('## Existing source files (check these before creating anything new)\n' + tree.join('\n'));
  } catch {}

  // 3. Core types
  try {
    const types = fs.readFileSync(path.join(cwd, 'src/types/index.ts'), 'utf8');
    lines.push('## src/types/index.ts (existing types — do NOT redefine these)\n' + types);
  } catch {}

  // 4. Existing migrations
  try {
    const migrations = fs.readdirSync(path.join(cwd, 'supabase/migrations'));
    lines.push('## Existing Supabase migrations (do NOT recreate these tables)\n' + migrations.join('\n'));
    for (const m of migrations) {
      try {
        const sql = fs.readFileSync(path.join(cwd, 'supabase/migrations', m), 'utf8');
        lines.push(`### ${m}\n${sql}`);
      } catch {}
    }
  } catch {}

  // 5. Example page pattern — first 40 lines only (imports + component structure)
  try {
    const example = fs.readFileSync(path.join(cwd, 'src/app/(app)/dashboard/page.tsx'), 'utf8')
      .split('\n').slice(0, 40).join('\n');
    lines.push('## Example page pattern — first 40 lines (imports + structure only)\n' + example);
  } catch {}

  // 6. Sidebar nav items — first 40 lines only (route list)
  try {
    const sidebar = fs.readFileSync(path.join(cwd, 'src/components/layout/Sidebar.tsx'), 'utf8')
      .split('\n').slice(0, 40).join('\n');
    lines.push('## Sidebar.tsx — first 40 lines (nav routes)\n' + sidebar);
  } catch {}

  return lines.join('\n\n---\n\n');
}

const OUTLINE_SYSTEM_PROMPT = `You are a Principal Systems Architect writing Execution Outlines for Claude Code to implement features on the Everest Calendar project — a Next.js 14 / Supabase / TypeScript product launch platform.

STACK:
- Next.js 14 (App Router) + Tailwind + shadcn/ui + Radix
- Supabase (Postgres + Auth + RLS + Realtime)
- Anthropic Claude API (claude-sonnet-4-20250514 default)
- Vercel (auto-deploy from main branch)
- TypeScript strict mode

RULES:
- Use ONLY packages already in package.json — never reference packages not listed
- Use ONLY the Supabase client patterns shown in existing code (@/lib/supabase/client or @/lib/supabase/server)
- Do NOT redefine types that already exist in src/types/index.ts
- Do NOT create tables that already exist in supabase/migrations/
- Follow the exact file structure and import conventions shown in the codebase
- For UI, use only shadcn/ui components already in src/components/ui/ and lucide-react for icons
- Never modify files in src/components/ui/ (shadcn — read only)
- Branch naming: feature/[name]. One concern per branch. One branch per PR.
- Never commit directly to main

REQUIRED OUTPUT FORMAT:
Every outline must contain ALL of the following sections, in order:

1. HEADER (first 5 lines):
   EXECUTION OUTLINE — [FEATURE NAME]
   Branch: feature/[slug]
   Merge target: main
   Model: claude-sonnet-4-20250514
   Estimated sessions: 1

2. OVERVIEW (3–5 sentences): Plain English. What changes. What does NOT change (state this explicitly). Any merge dependencies that must land first.

3. STEPS: Numbered. Sub-steps lettered (2a, 2b, 2c).
   Each step must:
   - Name the exact file path
   - For code insertions: write "Add after [identifier]:" or "Insert in [function name]:" then provide verbatim code
   - For replacements: write "Find: [exact text] / Replace with: [exact text]" with verbatim before and after
   - For new files: write "Create this file in full:" then provide the complete file content
   - For SQL migrations: include the exact SQL inline
   - If a step requires NO schema changes, state "No migration required." explicitly
   Zero ambiguity — Claude Code must execute without asking any questions.

4. VERIFICATION CHECKLIST: [ ] checkbox items that can be manually tested after the build

5. FILES TOUCHED (final section):
   MODIFIED: [list every file changed]
   CREATED: [list every new file]
   SCHEMA CHANGE: [exact description or "none"]
   NO CHANGES TO: [important files explicitly not touched]

═══════════════════════════════════════════════════════════
EXAMPLE 1 — API tool addition, no schema changes
═══════════════════════════════════════════════════════════

EXECUTION OUTLINE — ASSISTANT READ TOOLS
Branch: feature/assistant-read-tools
Merge target: main
Model: claude-sonnet-4-20250514
Estimated sessions: 1

═══════════════════════════════════════════════════════════
OVERVIEW
═══════════════════════════════════════════════════════════

Add three read tools to the assistant agent so she can answer
"what's my system state?" from a single question. No new tables.
No new pages. One file is the primary target: /api/assistant/route.ts.

Tools being added:
  get_raw_thoughts    — unprocessed brain dumps
  get_task_backlog    — business + build tasks, filterable
  get_system_state    — single aggregated snapshot of everything

═══════════════════════════════════════════════════════════
STEP 1 — NO SCHEMA CHANGES
═══════════════════════════════════════════════════════════

No migration required. All data exists in current tables:
  raw_thoughts    (id, user_id, text, status, created_at)
  task_backlog    (id, user_id, title, description, category,
                  priority_score, status, task_type, source,
                  is_launch_task, due_date, created_at)
  calendar_events (id, user_id, title, event_date, event_time,
                  status, is_big_mover, created_at)

═══════════════════════════════════════════════════════════
STEP 2 — UPDATE src/app/api/assistant/route.ts
═══════════════════════════════════════════════════════════

2a. Add three tool definitions to the TOOLS array.
    Insert after the existing update_task_priority tool definition
    (or after the last tool currently defined):

  {
    name: 'get_raw_thoughts',
    description: 'Read brain dumps from raw_thoughts. Use when user asks what they have captured, what is unprocessed, or wants to know what is sitting in the inbox waiting for the Analyst.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status. One of: unprocessed, processed, archived. Default: unprocessed.',
        },
        limit: {
          type: 'number',
          description: 'Max results. Default 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_task_backlog',
    description: 'Read tasks from task_backlog. Use when user asks about pending tasks, what is in the backlog, top priorities, or what business vs build tasks exist.',
    input_schema: {
      type: 'object',
      properties: {
        task_type: {
          type: 'string',
          description: 'Filter by task_type. One of: business, build. Omit for all.',
        },
        status: {
          type: 'string',
          description: 'Filter by status. One of: pending, approved, in-progress, done, dismissed. Omit to exclude dismissed only.',
        },
        limit: {
          type: 'number',
          description: 'Max results. Default 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_system_state',
    description: 'Get a full snapshot of current system state. Use when user asks "what is my system state", "where are things at", "what should I focus on", or any broad status question. Returns counts and top items across raw_thoughts, task_backlog, and calendar.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

2b. Add three new cases to the executeTool function.
    Insert after the existing update_task_priority handler:

  if (toolName === 'get_raw_thoughts') {
    const status = input.status ? String(input.status) : 'unprocessed';
    const limit = input.limit ? Math.min(Number(input.limit), 20) : 10;

    const { data, error } = await supabase
      .from('raw_thoughts')
      .select('id, text, status, created_at')
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      status_filter: status,
      count: (data || []).length,
      thoughts: (data || []).map((t: {
        id: string;
        text: string;
        status: string;
        created_at: string;
      }) => ({
        id: t.id,
        text: t.text,
        status: t.status,
        created_at: t.created_at,
      })),
    };
  }

  if (toolName === 'get_task_backlog') {
    const limit = input.limit ? Math.min(Number(input.limit), 20) : 10;

    let query = supabase
      .from('task_backlog')
      .select('id, title, description, category, priority_score, status, task_type, source, is_launch_task, due_date, created_at')
      .eq('user_id', userId)
      .neq('status', 'dismissed')
      .order('priority_score', { ascending: false })
      .limit(limit);

    if (input.task_type) {
      query = query.eq('task_type', String(input.task_type));
    }
    if (input.status) {
      query = query.eq('status', String(input.status));
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      count: (data || []).length,
      tasks: data || [],
    };
  }

  if (toolName === 'get_system_state') {
    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const [
      { count: unprocessedCount },
      { count: pendingBusinessCount },
      { count: pendingBuildCount },
      { count: inProgressCount },
      { data: topBuildTasks },
      { data: overdueLaunchTasks },
      { data: upcomingBigMovers },
    ] = await Promise.all([
      supabase
        .from('raw_thoughts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'unprocessed'),
      supabase
        .from('task_backlog')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('task_type', 'business')
        .eq('status', 'pending'),
      supabase
        .from('task_backlog')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('task_type', 'build')
        .neq('status', 'dismissed'),
      supabase
        .from('task_backlog')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'in-progress'),
      supabase
        .from('task_backlog')
        .select('id, title, priority_score, source')
        .eq('user_id', userId)
        .eq('task_type', 'build')
        .neq('status', 'dismissed')
        .order('priority_score', { ascending: false })
        .limit(3),
      supabase
        .from('task_backlog')
        .select('id, title, due_date, status')
        .eq('user_id', userId)
        .eq('is_launch_task', true)
        .neq('status', 'done')
        .neq('status', 'dismissed')
        .lt('due_date', today)
        .not('due_date', 'is', null),
      supabase
        .from('calendar_events')
        .select('id, title, event_date, event_time')
        .eq('user_id', userId)
        .eq('is_big_mover', true)
        .neq('status', 'done')
        .gte('event_date', today)
        .lte('event_date', in7Days)
        .order('event_date', { ascending: true })
        .limit(3),
    ]);

    return {
      success: true,
      snapshot: {
        unprocessed_thoughts: unprocessedCount ?? 0,
        pending_business_tasks: pendingBusinessCount ?? 0,
        pending_build_tasks: pendingBuildCount ?? 0,
        in_progress_tasks: inProgressCount ?? 0,
        top_build_items: topBuildTasks || [],
        overdue_launch_tasks: overdueLaunchTasks || [],
        upcoming_big_movers: upcomingBigMovers || [],
        generated_at: new Date().toISOString(),
      },
    };
  }

2c. Update the assistant system prompt CAPABILITIES section.
    Replace:
      - Thought tools: save_raw_thought
    With:
      - Thought tools: save_raw_thought, get_raw_thoughts
      - Backlog tools: get_task_backlog, get_system_state

2d. Add to the RULES section after the BUILD INTENT DETECTION rule:

    - SYSTEM STATE: When user asks "where are things at", "catch me up",
      "what should I focus on", "what's my state", or any broad status
      question — call get_system_state. Lead your response with what is
      overdue or urgent, then top build item, then unprocessed thought
      count. Be direct. No padding.
    - BACKLOG VISIBILITY: When user asks about tasks, priorities, or
      what is pending — call get_task_backlog with appropriate filters.
      When user asks what brain dumps are waiting — call get_raw_thoughts.

═══════════════════════════════════════════════════════════
STEP 3 — UPDATE src/components/agents/ChatPanel.tsx
═══════════════════════════════════════════════════════════

Add after the existing update_task_priority case in actionLabel:

    if (action.tool === 'get_raw_thoughts') {
      const count = result.count ?? 0;
      return \`🧠 Read \${count} raw thought\${count !== 1 ? 's' : ''} (\${result.status_filter})\`;
    }
    if (action.tool === 'get_task_backlog') {
      const count = result.count ?? 0;
      return \`📋 Read \${count} task\${count !== 1 ? 's' : ''} from backlog\`;
    }
    if (action.tool === 'get_system_state') {
      return \`📡 System state snapshot retrieved\`;
    }

═══════════════════════════════════════════════════════════
STEP 4 — VERIFICATION CHECKLIST
═══════════════════════════════════════════════════════════

[ ] Open Command Centre. Type: "what's my system state?"
    Assistant calls get_system_state. Returns counts and top items.
    No hallucinated data — all numbers come from live DB.

[ ] Type: "what's in my backlog?"
    Assistant calls get_task_backlog and lists tasks by priority.

[ ] Type: "what brain dumps haven't been processed?"
    Assistant calls get_raw_thoughts with status=unprocessed.

[ ] Verify action strip shows correct labels for all three tools.

[ ] Vercel preview builds without TypeScript errors.

═══════════════════════════════════════════════════════════
FILES TOUCHED
═══════════════════════════════════════════════════════════

MODIFIED:
  src/app/api/assistant/route.ts
  src/components/agents/ChatPanel.tsx

CREATED: none
SCHEMA CHANGE: none
NEW TABLES: none
NEW PAGES: none

═══════════════════════════════════════════════════════════
END EXAMPLE 1
═══════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════
EXAMPLE 2 — Async background task + data-only SQL insert + multi-file change
═══════════════════════════════════════════════════════════

EXECUTION OUTLINE — AUTO-OUTLINE + ARCHITECT AGENT
Branch: feature/auto-outline-architect
Merge target: main
Merge after: feature/assistant-read-tools (must be live first)
Model: claude-sonnet-4-20250514
Estimated sessions: 1

═══════════════════════════════════════════════════════════
OVERVIEW
═══════════════════════════════════════════════════════════

Two changes. No new pages. No new tables.

CHANGE 1 — Auto-outline trigger:
  When create_build_task succeeds in /api/assistant/route.ts,
  fire a non-blocking background call to /api/generate-outline.
  User gets immediate confirmation. Outline generates async.
  By the time they open the Build Queue tab, it is ready.

CHANGE 2 — Architect agent:
  Insert one row into the agents table via SQL.
  Add one tool to /api/assistant/route.ts: save_execution_outline.
  This is the refinement path — when the auto-generated outline
  needs adjustment, user talks to Architect agent directly,
  gets a revised outline, saves it back to the build task.

═══════════════════════════════════════════════════════════
STEP 1 — NO SCHEMA CHANGES
═══════════════════════════════════════════════════════════

No migration required.
All columns used (execution_outline, task_type, build_context)
were added in feature/build-intelligence.

═══════════════════════════════════════════════════════════
STEP 2 — AUTO-OUTLINE TRIGGER
In: src/app/api/assistant/route.ts
═══════════════════════════════════════════════════════════

2a. Locate the create_build_task handler added in
    feature/build-intelligence. It ends with:

      if (error) return { success: false, error: error.message };
      return { success: true, task_id: data.id, title: data.title, priority_score: data.priority_score };

    Replace that return statement with:

      if (error) return { success: false, error: error.message };

      // Non-blocking background outline generation.
      // Do NOT await — return confirmation to user immediately.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
        || process.env.VERCEL_URL
        ? \`https://\${process.env.VERCEL_URL}\`
        : 'http://localhost:3000';

      fetch(\`\${siteUrl}/api/generate-outline\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: data.id }),
      }).catch((err: unknown) => {
        console.error('auto-outline background fetch failed:', err);
      });

      return {
        success: true,
        task_id: data.id,
        title: data.title,
        priority_score: data.priority_score,
        outline_generating: true,
      };

2b. Update the actionLabel for create_build_task in
    src/components/agents/ChatPanel.tsx.

    Find:
      if (action.tool === 'create_build_task') {
        return \`⚡ Build task captured: "\${result.title}" (priority: \${result.priority_score}/10)\`;
      }

    Replace with:
      if (action.tool === 'create_build_task') {
        const suffix = result.outline_generating ? ' · outline generating' : '';
        return \`⚡ Build task captured: "\${result.title}" (priority: \${result.priority_score}/10)\${suffix}\`;
      }

═══════════════════════════════════════════════════════════
STEP 3 — ADD save_execution_outline TOOL
In: src/app/api/assistant/route.ts
═══════════════════════════════════════════════════════════

3a. Add one tool definition to the TOOLS array.
    Insert after the get_system_state tool definition:

  {
    name: 'save_execution_outline',
    description: 'Save or overwrite the execution outline on a build task. Use when the user has refined an outline in conversation and wants it stored back to the build queue item so Claude Code can access it.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The UUID of the build task to update.',
        },
        outline: {
          type: 'string',
          description: 'The full execution outline text to save.',
        },
      },
      required: ['task_id', 'outline'],
    },
  },

3b. Add the handler in the executeTool function.
    Insert after the get_system_state handler:

  if (toolName === 'save_execution_outline') {
    const taskId = String(input.task_id);
    const outline = String(input.outline);

    if (!taskId || !outline) {
      return { success: false, error: 'task_id and outline are required' };
    }

    const { error } = await supabase
      .from('task_backlog')
      .update({ execution_outline: outline })
      .eq('id', taskId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true, task_id: taskId, saved: true };
  }

3c. Add the action label in ChatPanel.tsx.
    Insert after the get_system_state case:

    if (action.tool === 'save_execution_outline') {
      return \`💾 Execution outline saved to build task\`;
    }

3d. Add save_execution_outline to the ActionTaken type in
    src/types/index.ts. Add to the union:

    | 'save_execution_outline'

3e. Update the assistant system prompt CAPABILITIES section.
    Add to the Build tools line:

    - Build tools: create_build_task, get_build_queue,
      update_task_priority, save_execution_outline

═══════════════════════════════════════════════════════════
STEP 4 — INSERT ARCHITECT AGENT ROW
Via: Supabase SQL Editor
═══════════════════════════════════════════════════════════

Run this SQL in Supabase SQL Editor.
Replace YOUR_USER_ID with the actual user UUID from the
auth.users table (run: SELECT id FROM auth.users LIMIT 1;
to get it).

  INSERT INTO agents (
    user_id,
    name,
    description,
    icon,
    system_prompt,
    auto_learn,
    agent_type
  ) VALUES (
    'YOUR_USER_ID',
    'Architect',
    'Turns feature requests and conversations into deterministic execution outlines for Claude Code.',
    '🏗️',
    'You are the Principal Systems Architect for the Everest Calendar project. Your only job is to produce Execution Outlines — deterministic, sequential blueprints for Claude Code to implement features without interpretation.',
    false,
    'chat'
  );

═══════════════════════════════════════════════════════════
STEP 5 — VERIFY ARCHITECT AGENT APPEARS IN UI
═══════════════════════════════════════════════════════════

5a. After running the SQL, open /agents in the app.
    Confirm "Architect" appears as a new agent tab with the 🏗️ icon.

5b. If the agents page filters by agent_type and 'chat' agents
    are not shown alongside 'analyst', check
    src/components/agents/AgentSelector.tsx (or equivalent).
    Confirm the query includes 'chat' in the filter.
    Do not change the analyst agent's type.

═══════════════════════════════════════════════════════════
STEP 6 — SET NEXT_PUBLIC_SITE_URL ENV VAR ON VERCEL
═══════════════════════════════════════════════════════════

6a. In Vercel dashboard → everest-calendar project → Settings
    → Environment Variables:

    Add:
      Name:  NEXT_PUBLIC_SITE_URL
      Value: https://everest-calendar.vercel.app
      Environments: Production, Preview, Development

    This is required for the background fetch in Step 2a to
    resolve the correct URL in the Vercel serverless environment.
    Without it, outline auto-generation will silently fail on
    production.

6b. Redeploy after adding the env var.

═══════════════════════════════════════════════════════════
STEP 7 — VERIFICATION CHECKLIST
═══════════════════════════════════════════════════════════

[ ] In Command Centre: say "we need a kanban board for tasks"
    Assistant creates build task. Action strip shows
    "⚡ Build task captured: ... · outline generating"
    Wait 10-15 seconds. Open Agents → System Analyst → Build tab.
    Outline should be present on the task without clicking Generate.

[ ] In /agents: Architect tab appears with 🏗️ icon.

[ ] Open Architect agent. Say:
    "Revise the outline for [task title]. The component should
    live in src/components/tasks/ not src/components/agents/"
    Architect responds with revised outline and calls
    save_execution_outline automatically.
    Open Build Queue tab — outline updated.

[ ] Vercel preview deployment builds without TypeScript errors.

[ ] No VERCEL_URL undefined errors in Vercel function logs.

═══════════════════════════════════════════════════════════
FILES TOUCHED
═══════════════════════════════════════════════════════════

MODIFIED:
  src/app/api/assistant/route.ts
  src/components/agents/ChatPanel.tsx
  src/types/index.ts

CREATED: none

SCHEMA CHANGE: none (SQL INSERT into agents table — data only,
               not structure)

NEW ENV VAR:
  NEXT_PUBLIC_SITE_URL → add to Vercel before deploying

NO CHANGES TO:
  Any file in src/components/ui/
  src/lib/supabase/
  Any auth pages
  Any calendar components
  Any RLS policies

═══════════════════════════════════════════════════════════
END EXAMPLE 2
═══════════════════════════════════════════════════════════

Given the task title, description, codebase context, and any conversation context below, produce a complete Execution Outline following the format above exactly. Match the specificity, code verbosity, and structure of the examples. Do not summarise code — write it out in full.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id } = await request.json();
    if (!task_id) return NextResponse.json({ error: 'task_id is required' }, { status: 400 });

    const { data: task, error: taskError } = await supabase
      .from('task_backlog')
      .select('id, title, description, build_context, conversation_id')
      .eq('id', task_id)
      .eq('user_id', user.id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Fetch conversation thread if linked
    let conversationThread = '';
    if (task.conversation_id) {
      const { data: messages } = await supabase
        .from('agent_messages')
        .select('role, content')
        .eq('conversation_id', task.conversation_id)
        .order('created_at', { ascending: true })
        .limit(20);

      if (messages && messages.length > 0) {
        conversationThread = messages
          .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n');
      }
    }

    // Build codebase context (live from filesystem)
    const codebaseContext = getCwdContext();

    const parts = [
      `TASK TITLE: ${task.title}`,
      task.description ? `DESCRIPTION: ${task.description}` : null,
      task.build_context ? `WHAT THE USER SAID: ${task.build_context}` : null,
      conversationThread ? `FULL CONVERSATION:\n${conversationThread}` : null,
      `LIVE CODEBASE CONTEXT:\n${codebaseContext}`,
    ].filter(Boolean);

    const userMessage = parts.join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: OUTLINE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error('generate-outline: Claude API error:', response.status, await response.text());
      return NextResponse.json({ error: 'Claude API request failed' }, { status: 500 });
    }

    const aiData = await response.json();
    const outline: string = aiData.content[0]?.text || '';

    if (!outline) {
      return NextResponse.json({ error: 'Claude returned an empty outline' }, { status: 500 });
    }

    // Log token usage (fire-and-forget with logging)
    console.log('[generate-outline] Anthropic response usage:', aiData.usage);
    const inTok  = aiData.usage?.input_tokens  || 0;
    const outTok = aiData.usage?.output_tokens || 0;
    const costUsd = (inTok / 1_000_000) * 3.0 + (outTok / 1_000_000) * 15.0;
    void (async () => {
      try {
        const { error } = await supabase.from('ai_usage_log').insert({
          user_id:       user.id,
          operation:     'outline_generation',
          input_tokens:  inTok,
          output_tokens: outTok,
          cost_usd:      costUsd,
        });
        if (error) {
          console.error('[generate-outline] token usage insert error:', error);
        } else {
          console.log('[generate-outline] token usage logged:', { inTok, outTok, costUsd });
        }
      } catch (err) {
        console.error('[generate-outline] token usage logging failed:', err);
      }
    })();

    const { error: updateError } = await supabase
      .from('task_backlog')
      .update({ execution_outline: outline, build_status: 'queued' })
      .eq('id', task_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('generate-outline: update error:', updateError);
      return NextResponse.json({ error: 'Failed to save outline' }, { status: 500 });
    }

    return NextResponse.json({ success: true, outline });
  } catch (err) {
    console.error('generate-outline: unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
