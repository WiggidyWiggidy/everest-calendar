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
  } catch (_) {}

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
  } catch (_) {}

  // 3. Core types
  try {
    const types = fs.readFileSync(path.join(cwd, 'src/types/index.ts'), 'utf8');
    lines.push('## src/types/index.ts (existing types — do NOT redefine these)\n' + types);
  } catch (_) {}

  // 4. Existing migrations
  try {
    const migrations = fs.readdirSync(path.join(cwd, 'supabase/migrations'));
    lines.push('## Existing Supabase migrations (do NOT recreate these tables)\n' + migrations.join('\n'));
    for (const m of migrations) {
      try {
        const sql = fs.readFileSync(path.join(cwd, 'supabase/migrations', m), 'utf8');
        lines.push(`### ${m}\n${sql}`);
      } catch (_) {}
    }
  } catch (_) {}

  // 5. Example page pattern (for structural consistency)
  try {
    const example = fs.readFileSync(path.join(cwd, 'src/app/(app)/dashboard/page.tsx'), 'utf8');
    lines.push('## Example page pattern (src/app/(app)/dashboard/page.tsx) — follow this structure\n' + example);
  } catch (_) {}

  // 6. Sidebar (to understand navigation structure for adding new routes)
  try {
    const sidebar = fs.readFileSync(path.join(cwd, 'src/components/layout/Sidebar.tsx'), 'utf8');
    lines.push('## Sidebar.tsx (add new routes here if needed)\n' + sidebar);
  } catch (_) {}

  return lines.join('\n\n---\n\n');
}

const OUTLINE_SYSTEM_PROMPT = `You are a senior full-stack engineer at Everest Labs implementing features on a Next.js 14 / Supabase / TypeScript product launch platform.

You will be given a build task plus the live codebase context — installed packages, existing files, existing types, existing DB tables, and example patterns.

Produce a step-by-step technical execution outline that Claude Code will use to implement the feature autonomously. 

RULES:
- Use ONLY packages already in package.json — never reference packages not listed
- Use ONLY the Supabase client patterns shown in existing code (@/lib/supabase/client or @/lib/supabase/server)
- Do NOT redefine types that already exist in src/types/index.ts
- Do NOT create tables that already exist in supabase/migrations/
- Follow the exact file structure and import conventions shown in the codebase
- For UI, use only shadcn/ui components already in src/components/ui/ and lucide-react for icons
- Each step must name the exact file, the exact function/component name, and describe its specific behaviour — not just "create X component"

FORMAT:
Numbered list, max 15 steps. Each step must be specific enough that an engineer could implement it without asking questions. Include: exact file path, what the component/function does, what data it reads/writes, what it renders or returns.`;

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
        max_tokens: 2048,
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
