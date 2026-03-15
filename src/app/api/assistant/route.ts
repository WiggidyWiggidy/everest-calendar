// ============================================
// /api/assistant — Agentic calendar assistant with tool use
// Runs an agentic loop: Claude calls tools autonomously until
// stop_reason === 'end_turn', then returns the final message
// and a list of all actions taken.
//
// Supports two calling modes:
//   ChatPanel   — sends { messages, agent_id }
//   CommandCentre — sends { messages, agentId, conversationId }
//
// When called from CommandCentre (camelCase fields), the route
// manages its own conversation: creates one on first use, fetches
// history on subsequent calls, and persists user + assistant messages.
//
// Slash command preprocessing strips /dump /feature /schedule /erins
// prefixes and injects per-category context into the system prompt.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ActionTaken } from '@/types';
import { parseSlashCommand, CATEGORY_CONTEXT, SlashCategory } from '@/lib/slashCommands';

const MAX_ITERATIONS = 8;

async function buildSystemPrompt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string
): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return `You are Everest, an AI calendar assistant. Today is ${today}.`;
  }

  const { data: memories } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_id', agentId)
    .or('is_archived.eq.false,is_archived.is.null')
    .order('created_at', { ascending: true });

  const memoryNotes =
    memories && memories.length > 0
      ? memories.map((m: { title: string; content: string }) => `### ${m.title}\n${m.content}`).join('\n\n')
      : '(No memory notes yet.)';

  let prompt = agent.system_prompt.replace('{memory_notes}', memoryNotes);
  prompt += `\n\nIMPORTANT: Today's date is ${today}.`;

  if (agent.auto_learn) {
    prompt += `\n\nAUTO-LEARN: When you learn something important about the user's preferences, project, or working style, include this block:\n<memory_suggestion>\n{\n  "title": "Short title",\n  "content": "What to remember (markdown)"\n}\n</memory_suggestion>`;
  }

  return prompt;
}

const TOOLS = [
  {
    name: 'create_calendar_event',
    description: "Create a new event on the user's calendar.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        event_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        event_time: { type: 'string', description: 'Time in HH:MM format, or null' },
        category: {
          type: 'string',
          enum: ['product', 'marketing', 'content', 'meeting', 'deadline'],
          description: 'Event category',
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Event priority',
        },
        description: { type: 'string', description: 'Optional event description' },
        is_big_mover: { type: 'boolean', description: 'Flag as a Big Mover' },
      },
      required: ['title', 'event_date', 'category', 'priority'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'The UUID of the event to update' },
        title: { type: 'string' },
        event_date: { type: 'string', description: 'YYYY-MM-DD' },
        event_time: { type: 'string', description: 'HH:MM or null' },
        status: { type: 'string', enum: ['planned', 'in-progress', 'done'] },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        description: { type: 'string' },
        is_big_mover: { type: 'boolean' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'The UUID of the event to delete' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch calendar events, optionally filtered by date range or status.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'YYYY-MM-DD' },
        to_date: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['planned', 'in-progress', 'done'] },
      },
      required: [],
    },
  },
  {
    name: 'get_launch_tasks',
    description: 'Fetch all open launch dependency tasks. Use this when the user asks about launch status, dependencies, or what is still outstanding.',
    input_schema: {
      type: 'object',
      properties: {
        include_done: {
          type: 'boolean',
          description: 'If true, include completed tasks. Default false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_launch_task',
    description: 'Mark a launch dependency task as done or pending. Match by title (case-insensitive, partial match acceptable).',
    input_schema: {
      type: 'object',
      properties: {
        title_match: {
          type: 'string',
          description: 'Partial title to match against — finds the closest task',
        },
        status: {
          type: 'string',
          enum: ['done', 'pending'],
          description: 'New status to set',
        },
      },
      required: ['title_match', 'status'],
    },
  },
  {
    name: 'batch_update_calendar_events',
    description: "Update the status of multiple calendar events at once. Use when the user asks to complete, mark done, or update several events in bulk — e.g. \"mark all today's tasks done\", \"complete everything before 2pm\", \"mark all Big Movers done\".",
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Filter criteria to select which events to update',
          properties: {
            date: {
              type: 'string',
              description: 'ISO date string YYYY-MM-DD. If provided, only update events on this date.',
            },
            before_time: {
              type: 'string',
              description: 'HH:MM format. If provided, only update events with event_time before this time.',
            },
            is_big_mover: {
              type: 'boolean',
              description: 'If true, only update events flagged as Big Movers.',
            },
            status_from: {
              type: 'string',
              description: 'Only update events currently in this status.',
            },
          },
        },
        new_status: {
          type: 'string',
          enum: ['planned', 'in-progress', 'done'],
          description: 'The status to set on all matched events.',
        },
      },
      required: ['filter', 'new_status'],
    },
  },
  {
    name: 'save_raw_thought',
    description: 'Save a raw thought or brain dump to the thoughts log for later processing by the Analyst. Use this automatically whenever the user sends a /dump command or asks to capture an idea for later.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The thought content to save. Use the clean content without the /dump prefix.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'create_build_task',
    description: "Add a feature or build task to the development build queue. Use this whenever the user sends a /feature command, mentions something they want built, or asks to log a development task. Call it immediately — don't ask for more info unless the title is completely unclear.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, clear title for the build task' },
        description: { type: 'string', description: 'One or two sentences describing what needs to be built' },
        category: {
          type: 'string',
          enum: ['product', 'marketing', 'operations', 'content'],
          description: 'Category for this task',
        },
        priority_score: {
          type: 'integer',
          description: 'Priority from 1 (low) to 10 (critical)',
          minimum: 1,
          maximum: 10,
        },
        build_context: {
          type: 'string',
          description: "Optional extra context the developer will need — e.g. 'user said it should work like Notion blocks'",
        },
      },
      required: ['title', 'description', 'category', 'priority_score'],
    },
  },
  {
    name: 'get_build_queue',
    description: 'Fetch the current build queue (tasks with task_type=build). Use when the user asks what is in the build pipeline, what features are queued, or to review development priorities.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in-progress', 'done'],
          description: 'Filter by status. Omit to return all non-dismissed build tasks.',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_task_priority',
    description: 'Update the priority score on a task in the backlog. Use when the user re-prioritises a feature or task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'UUID of the task to update. Use when you already know the ID.' },
        title_match: { type: 'string', description: 'Partial title to fuzzy-match against if you do not have the ID.' },
        priority_score: {
          type: 'integer',
          description: 'New priority from 1 (low) to 10 (critical)',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['priority_score'],
    },
  },
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
  {
    name: 'save_execution_outline',
    description: 'Save an execution outline to a build task. Use when you have generated or updated an implementation plan for a specific build task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The UUID of the build task to attach the outline to',
        },
        outline: {
          type: 'string',
          description: 'The full execution outline text (markdown numbered list)',
        },
      },
      required: ['task_id', 'outline'],
    },
  },
];

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  conversationId: string | null
): Promise<Record<string, unknown>> {
  if (toolName === 'create_calendar_event') {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        user_id: userId,
        title: input.title,
        description: input.description || null,
        event_date: input.event_date,
        event_time: input.event_time || null,
        category: input.category,
        priority: input.priority,
        status: 'planned',
        is_big_mover: input.is_big_mover ?? false,
      })
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, event_id: data.id, title: data.title, event_date: data.event_date };
  }

  if (toolName === 'update_calendar_event') {
    const { event_id, ...fields } = input;
    const updateFields: Record<string, unknown> = {};
    if (fields.title        !== undefined) updateFields.title        = fields.title;
    if (fields.event_date   !== undefined) updateFields.event_date   = fields.event_date;
    if (fields.event_time   !== undefined) updateFields.event_time   = fields.event_time;
    if (fields.status       !== undefined) updateFields.status       = fields.status;
    if (fields.priority     !== undefined) updateFields.priority     = fields.priority;
    if (fields.description  !== undefined) updateFields.description  = fields.description;
    if (fields.is_big_mover !== undefined) updateFields.is_big_mover = fields.is_big_mover;

    const { error } = await supabase
      .from('calendar_events')
      .update(updateFields)
      .eq('id', event_id as string)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, event_id };
  }

  if (toolName === 'delete_calendar_event') {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', input.event_id as string)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, event_id: input.event_id };
  }

  if (toolName === 'get_calendar_events') {
    let query = supabase
      .from('calendar_events')
      .select('id, title, event_date, event_time, category, priority, status, is_big_mover')
      .eq('user_id', userId)
      .order('event_date', { ascending: true });
    if (input.from_date) query = query.gte('event_date', input.from_date as string);
    if (input.to_date)   query = query.lte('event_date', input.to_date as string);
    if (input.status)    query = query.eq('status', input.status as string);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, events: data || [] };
  }

  if (toolName === 'get_launch_tasks') {
    let query = supabase
      .from('task_backlog')
      .select('id, title, status, due_date')
      .eq('user_id', userId)
      .eq('is_launch_task', true)
      .neq('status', 'dismissed')
      .order('due_date', { ascending: true, nullsFirst: false });
    if (!input.include_done) {
      query = query.neq('status', 'done');
    }
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, tasks: data || [] };
  }

  if (toolName === 'update_launch_task') {
    const { data: tasks, error: fetchError } = await supabase
      .from('task_backlog')
      .select('id, title, status')
      .eq('user_id', userId)
      .eq('is_launch_task', true)
      .neq('status', 'dismissed');
    if (fetchError) return { success: false, error: fetchError.message };
    if (!tasks || tasks.length === 0) return { success: false, error: 'No launch tasks found' };

    const searchTerm = (input.title_match as string).toLowerCase();
    const match = tasks.find((t: { id: string; title: string; status: string }) =>
      t.title.toLowerCase().includes(searchTerm)
    );
    if (!match) {
      return {
        success: false,
        error: `No task found matching "${input.title_match}". Available: ${tasks.map((t: { title: string }) => t.title).join(', ')}`,
      };
    }

    const newStatus = input.status === 'done' ? 'done' : 'pending';
    const { error: updateError } = await supabase
      .from('task_backlog')
      .update({ status: newStatus })
      .eq('id', match.id)
      .eq('user_id', userId);
    if (updateError) return { success: false, error: updateError.message };
    return { success: true, task_id: match.id, title: match.title, new_status: newStatus };
  }

  if (toolName === 'batch_update_calendar_events') {
    const filter = input.filter as {
      date?: string;
      before_time?: string;
      is_big_mover?: boolean;
      status_from?: string;
    };

    let query = supabase
      .from('calendar_events')
      .select('id, title, status, event_time, is_big_mover')
      .eq('user_id', userId);

    if (filter.date)                    query = query.eq('event_date', filter.date);
    if (filter.is_big_mover !== undefined) query = query.eq('is_big_mover', filter.is_big_mover);
    if (filter.status_from)             query = query.eq('status', filter.status_from);

    const { data: candidates, error: fetchError } = await query;
    if (fetchError) return { success: false, error: fetchError.message };
    if (!candidates || candidates.length === 0) {
      return { success: true, updated: 0, message: 'No matching events found.' };
    }

    let targets: Array<{ id: string; title: string; event_time?: string | null }> = candidates;
    if (filter.before_time) {
      targets = candidates.filter((e: { event_time?: string | null }) => {
        if (!e.event_time) return false;
        return e.event_time.slice(0, 5) < filter.before_time!;
      });
    }

    if (targets.length === 0) {
      return { success: true, updated: 0, message: 'No events matched the time filter.' };
    }

    const ids = targets.map((e: { id: string }) => e.id);
    const { error: updateError } = await supabase
      .from('calendar_events')
      .update({ status: input.new_status })
      .in('id', ids)
      .eq('user_id', userId);

    if (updateError) return { success: false, error: updateError.message };
    return {
      success: true,
      updated: targets.length,
      titles: targets.map((e: { title: string }) => e.title),
      new_status: input.new_status,
    };
  }

  if (toolName === 'save_raw_thought') {
    const { error } = await supabase
      .from('raw_thoughts')
      .insert({
        user_id: userId,
        text: input.content as string,
      });
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Thought saved for Analyst processing.' };
  }

  if (toolName === 'create_build_task') {
    const { data, error } = await supabase
      .from('task_backlog')
      .insert({
        user_id: userId,
        title: (input.title as string).trim(),
        description: (input.description as string || '').trim(),
        category: input.category as string || 'product',
        priority_score: Math.min(10, Math.max(1, input.priority_score as number)),
        status: 'pending',
        source_thought_ids: [],
        task_type: 'build',
        source: 'assistant',
        build_context: (input.build_context as string) || null,
        conversation_id: conversationId || null,
      })
      .select('id, title, priority_score')
      .single();
    if (error) return { success: false, error: error.message };

    return { success: true, task_id: data.id, title: data.title, priority_score: data.priority_score };
  }

  if (toolName === 'get_build_queue') {
    let query = supabase
      .from('task_backlog')
      .select('id, title, description, priority_score, status, build_context, execution_outline')
      .eq('user_id', userId)
      .eq('task_type', 'build')
      .neq('status', 'dismissed')
      .order('priority_score', { ascending: false });

    if (input.status) {
      query = query.eq('status', input.status as string);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, tasks: data || [], count: (data || []).length };
  }

  if (toolName === 'update_task_priority') {
    let taskId = input.task_id as string | undefined;
    let title = '';

    if (!taskId && input.title_match) {
      const { data: allTasks } = await supabase
        .from('task_backlog')
        .select('id, title')
        .eq('user_id', userId)
        .neq('status', 'dismissed');

      const match = (allTasks || []).find((t: { id: string; title: string }) =>
        t.title.toLowerCase().includes((input.title_match as string).toLowerCase())
      );
      if (!match) {
        return { success: false, error: `No task found matching "${input.title_match}"` };
      }
      taskId = match.id;
      title = match.title;
    }

    const { error } = await supabase
      .from('task_backlog')
      .update({ priority_score: Math.min(10, Math.max(1, input.priority_score as number)) })
      .eq('id', taskId as string)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true, task_id: taskId, title, priority_score: input.priority_score };
  }

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
      thoughts: (data || []).map((t: { id: string; text: string; status: string; created_at: string }) => ({
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

    if (input.task_type) query = query.eq('task_type', String(input.task_type));
    if (input.status)    query = query.eq('status', String(input.status));

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, count: (data || []).length, tasks: data || [] };
  }

  if (toolName === 'get_system_state') {
    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const LAUNCH_DATE = '2026-03-29';
    const daysUntilLaunch = Math.ceil((new Date(LAUNCH_DATE).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    const [
      { count: unprocessedCount },
      { count: pendingBusinessCount },
      { count: pendingBuildCount },
      { count: inProgressCount },
      { data: priorityBuilds },
      { data: activeBuilds },
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
      // Top priority builds — surfaces the pre-launch flagged items first
      supabase
        .from('task_backlog')
        .select('id, title, priority_score, build_status, build_context')
        .eq('user_id', userId)
        .eq('task_type', 'build')
        .neq('status', 'dismissed')
        .order('priority_score', { ascending: false })
        .limit(5),
      // Active/in-flight builds
      supabase
        .from('task_backlog')
        .select('id, title, build_status, branch_name')
        .eq('user_id', userId)
        .in('build_status', ['queued', 'building', 'pr_raised'])
        .neq('status', 'dismissed'),
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
        days_until_launch: daysUntilLaunch,
        launch_date: LAUNCH_DATE,
        unprocessed_thoughts: unprocessedCount ?? 0,
        pending_business_tasks: pendingBusinessCount ?? 0,
        pending_build_tasks: pendingBuildCount ?? 0,
        in_progress_tasks: inProgressCount ?? 0,
        top_build_items: priorityBuilds || [],
        active_builds: activeBuilds || [],
        overdue_launch_tasks: overdueLaunchTasks || [],
        upcoming_big_movers: upcomingBigMovers || [],
        generated_at: new Date().toISOString(),
      },
    };
  }

  if (toolName === 'save_execution_outline') {
    const { error } = await supabase
      .from('task_backlog')
      .update({ execution_outline: input.outline as string })
      .eq('id', input.task_id as string)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, task_id: input.task_id, message: 'Execution outline saved.' };
  }

  return { success: false, error: `Unknown tool: ${toolName}` };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      messages,
      agent_id,                              // from ChatPanel (snake_case)
      agentId: incomingAgentId,              // from CommandCentre (camelCase)
      conversationId: incomingConversationId, // from CommandCentre
    } = await request.json();

    if (!messages) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 });
    }

    // ── Agent resolution ──────────────────────────────────────────────────────
    // Priority: explicit agent_id (ChatPanel) → explicit agentId (CommandCentre)
    // → fallback to default chat agent from DB
    let resolvedAgentId: string = agent_id || incomingAgentId || '';
    if (!resolvedAgentId) {
      const { data: defaultAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', user.id)
        .eq('agent_type', 'chat')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      if (!defaultAgent) {
        return NextResponse.json({ error: 'No agent found for this user' }, { status: 400 });
      }
      resolvedAgentId = defaultAgent.id;
    }

    // ── CommandCentre conversation management ─────────────────────────────────
    // When called from CommandCentre (camelCase fields present), the route
    // manages its own conversation so context accumulates across submissions.
    const isCommandCentre = incomingAgentId !== undefined || incomingConversationId !== undefined;
    let resolvedConversationId: string | null = incomingConversationId || null;
    let anthropicMessages: Array<{ role: string; content: string }> = messages.map(
      (m: { role: string; content: string }) => ({ role: m.role, content: m.content })
    );

    if (isCommandCentre) {
      if (!resolvedConversationId) {
        // First use — create a new persistent conversation
        const { data: newConvo } = await supabase
          .from('agent_conversations')
          .insert({ agent_id: resolvedAgentId, user_id: user.id, title: 'Command Centre' })
          .select('id')
          .single();
        resolvedConversationId = newConvo?.id ?? null;
      } else {
        // Subsequent use — load last 20 messages for context
        const { data: existingMsgs } = await supabase
          .from('agent_messages')
          .select('role, content')
          .eq('conversation_id', resolvedConversationId)
          .order('created_at', { ascending: true })
          .limit(20);

        if (existingMsgs && existingMsgs.length > 0) {
          const newUserMsg = messages[messages.length - 1] as { role: string; content: string };
          anthropicMessages = [
            ...existingMsgs.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
            { role: newUserMsg.role, content: newUserMsg.content },
          ];
        }
      }

      // Persist the incoming user message
      const lastUserMsg = messages[messages.length - 1] as { role: string; content: string };
      if (resolvedConversationId && lastUserMsg) {
        await supabase.from('agent_messages').insert({
          conversation_id: resolvedConversationId,
          user_id: user.id,
          role: 'user',
          content: lastUserMsg.content,
        });
      }
    }

    // ── Slash command preprocessing ───────────────────────────────────────────
    let conversationCategory: SlashCategory = 'general';
    const lastMsg = anthropicMessages[anthropicMessages.length - 1];
    const rawContent = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
    const parsed = parseSlashCommand(rawContent);

    if (parsed.hasSlashCommand) {
      conversationCategory = parsed.category;
      anthropicMessages[anthropicMessages.length - 1] = {
        ...lastMsg,
        content: parsed.cleanContent,
      };
    }

    let systemPrompt = await buildSystemPrompt(supabase, resolvedAgentId);
    const categoryContext = CATEGORY_CONTEXT[conversationCategory];
    if (categoryContext) {
      systemPrompt = systemPrompt + '\n\n' + categoryContext;
    }

    // ── Agentic loop ──────────────────────────────────────────────────────────
    const actionsTaken: ActionTaken[] = [];
    let finalMessage = '';
    let iterations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

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
          system: systemPrompt,
          tools: TOOLS,
          tool_choice: { type: 'auto' },
          messages: anthropicMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('assistant route: Anthropic error:', errorText);
        return NextResponse.json({ error: 'Failed to get response from Claude' }, { status: 500 });
      }

      const aiData = await response.json();

      // Accumulate tokens across loop iterations
      if (aiData.usage) {
        totalInputTokens  += aiData.usage.input_tokens  || 0;
        totalOutputTokens += aiData.usage.output_tokens || 0;
        console.log('[assistant] iteration', iterations, 'tokens:', aiData.usage);
      } else {
        console.warn('[assistant] iteration', iterations, 'no usage data in response');
      }

      const textBlocks = aiData.content.filter((b: { type: string }) => b.type === 'text');
      if (textBlocks.length > 0) {
        finalMessage = textBlocks.map((b: { text: string }) => b.text).join('\n');
      }

      if (aiData.stop_reason !== 'tool_use') break;

      const toolUseBlocks = aiData.content.filter((b: { type: string }) => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          supabase,
          user.id,
          resolvedConversationId
        );

        actionsTaken.push({
          tool: toolUse.name as ActionTaken['tool'],
          input: toolUse.input as Record<string, unknown>,
          result,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: aiData.content },
        { role: 'user', content: toolResults },
      ];
    }

    // ── Log token usage (fire-and-forget with logging) ───────────────────────
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const costUsd = (totalInputTokens / 1_000_000) * 3.0 + (totalOutputTokens / 1_000_000) * 15.0;
      void (async () => {
        try {
          const { error } = await supabase.from('ai_usage_log').insert({
            user_id:       user.id,
            operation:     'assistant',
            input_tokens:  totalInputTokens,
            output_tokens: totalOutputTokens,
            cost_usd:      costUsd,
          });
          if (error) {
            console.error('[assistant] token usage insert error:', error);
          } else {
            console.log('[assistant] token usage logged:', { totalInputTokens, totalOutputTokens, costUsd });
          }
        } catch (err) {
          console.error('[assistant] token usage logging failed:', err);
        }
      })();
    }

    // ── Persist assistant reply (CommandCentre only) ──────────────────────────
    if (isCommandCentre && resolvedConversationId && finalMessage) {
      await supabase.from('agent_messages').insert({
        conversation_id: resolvedConversationId,
        user_id: user.id,
        role: 'assistant',
        content: finalMessage,
      });
    }

    return NextResponse.json({
      message: finalMessage,             // ChatPanel reads this
      reply: finalMessage,               // CommandCentre reads this
      actions_taken: actionsTaken,
      category: conversationCategory,
      agentId: resolvedAgentId,
      conversationId: resolvedConversationId,
    });
  } catch (error) {
    console.error('assistant route: unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
