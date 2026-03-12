// ============================================
// /api/chat — Proxies chat requests to Anthropic
// Keeps the API key server-side for security
// Supports agent memory injection: fetches agent config + memories,
// builds a personalised system prompt, and returns Claude's response
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Fallback system prompt when no agent is specified (legacy /chat page)
function buildDefaultSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return `You are the Everest Launch Strategist — an AI planning assistant for Everest Labs.

IMPORTANT: Today's date is ${today}. Never suggest dates in the past.

Your role: Help plan and optimise the product launch. Suggest milestones, marketing activities, content plans, and deadlines.

When suggesting calendar events, use this exact format (one per suggestion):
\`\`\`event
{
  "title": "Event title here",
  "description": "Brief description",
  "event_date": "YYYY-MM-DD",
  "event_time": "HH:MM",
  "category": "product|marketing|content|meeting|deadline",
  "priority": "high|medium|low"
}
\`\`\`

Be concise, strategic, and actionable.`;
}

// Build the full system prompt with agent config, memories, and event context
async function buildAgentSystemPrompt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
  events: unknown[] | undefined
): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch agent config
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return buildDefaultSystemPrompt();
  }

  // Fetch memories for this agent
  const { data: memories } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true });

  // Format memories as markdown
  let memoryNotes = '(No memory notes yet.)';
  if (memories && memories.length > 0) {
    memoryNotes = memories
      .map((m: { title: string; content: string }) => `### ${m.title}\n${m.content}`)
      .join('\n\n');
  }

  // Inject memories into the agent's system prompt
  let systemPrompt = agent.system_prompt.replace('{memory_notes}', memoryNotes);

  // Add date awareness
  systemPrompt += `\n\nIMPORTANT: Today's date is ${today}. Always use this as your reference when suggesting dates. Never suggest dates in the past.`;

  // Add event suggestion format
  systemPrompt += `\n\nWhen suggesting calendar events, use this exact format (one per suggestion):
\`\`\`event
{
  "title": "Event title here",
  "description": "Brief description",
  "event_date": "YYYY-MM-DD",
  "event_time": "HH:MM",
  "category": "product|marketing|content|meeting|deadline",
  "priority": "high|medium|low"
}
\`\`\``;

  // Add auto-learn instruction if enabled
  if (agent.auto_learn) {
    systemPrompt += `\n\nAUTO-LEARN: When you learn something important about the user's preferences, project, or working style, suggest saving it as a memory by including this block in your response:
<memory_suggestion>
{
  "title": "Short title for this memory",
  "content": "What to remember about this (markdown)"
}
</memory_suggestion>

Only suggest a memory when you genuinely learn something new and useful. Do not suggest memories for every message.`;
  }

  // Add event context
  if (events && events.length > 0) {
    systemPrompt += `\n\nHere are the user's current calendar events:\n${JSON.stringify(events, null, 2)}`;
  }

  return systemPrompt;
}

export async function POST(request: NextRequest) {
  try {
    // Verify the user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, events, agent_id } = await request.json();

    // Build the system prompt — use agent-specific if agent_id provided
    let systemPrompt: string;
    if (agent_id) {
      systemPrompt = await buildAgentSystemPrompt(supabase, agent_id, events);
    } else {
      systemPrompt = buildDefaultSystemPrompt();
      // Add event context for non-agent mode
      if (events && events.length > 0) {
        systemPrompt += `\n\nHere are the user's current calendar events:\n${JSON.stringify(events, null, 2)}`;
      }
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to get response from Claude' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const assistantMessage = data.content[0]?.text || 'Sorry, I could not generate a response.';

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
