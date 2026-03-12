// ============================================
// /api/assistant — Agentic calendar assistant with tool use
// Replaces /api/chat for all non-analyst agents.
// Runs an agentic loop: Claude calls calendar tools autonomously
// until stop_reason === 'end_turn', then returns the final message
// and a list of all actions taken.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ActionTaken } from '@/types';

const MAX_ITERATIONS = 5;

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
];

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
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
    if (fields.title       !== undefined) updateFields.title        = fields.title;
    if (fields.event_date  !== undefined) updateFields.event_date   = fields.event_date;
    if (fields.event_time  !== undefined) updateFields.event_time   = fields.event_time;
    if (fields.status      !== undefined) updateFields.status       = fields.status;
    if (fields.priority    !== undefined) updateFields.priority     = fields.priority;
    if (fields.description !== undefined) updateFields.description  = fields.description;
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

  return { success: false, error: `Unknown tool: ${toolName}` };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, agent_id } = await request.json();
    if (!messages || !agent_id) {
      return NextResponse.json({ error: 'messages and agent_id are required' }, { status: 400 });
    }

    const systemPrompt = await buildSystemPrompt(supabase, agent_id);
    const actionsTaken: ActionTaken[] = [];

    let anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    let finalMessage = '';
    let iterations = 0;

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

      // Capture any text blocks in this iteration
      const textBlocks = aiData.content.filter((b: { type: string }) => b.type === 'text');
      if (textBlocks.length > 0) {
        finalMessage = textBlocks.map((b: { text: string }) => b.text).join('\n');
      }

      // If no more tool calls, we're done
      if (aiData.stop_reason !== 'tool_use') {
        break;
      }

      // Execute all tool calls in this iteration
      const toolUseBlocks = aiData.content.filter((b: { type: string }) => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          supabase,
          user.id
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

      // Append assistant turn + tool results and loop
      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: aiData.content },
        { role: 'user', content: toolResults },
      ];
    }

    return NextResponse.json({ message: finalMessage, actions_taken: actionsTaken });
  } catch (error) {
    console.error('assistant route: unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
