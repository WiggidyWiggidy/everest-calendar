// ============================================
// /api/chat — Proxies chat requests to Anthropic
// Keeps the API key server-side for security
// Receives messages + event context, returns Claude's response
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// System prompt that positions Claude as a launch planning strategist
const SYSTEM_PROMPT = `You are the Everest Launch Strategist — an expert product launch planning assistant built into Everest Calendar, the command centre for Everest Labs.

Your role:
- Help plan and optimize product launches
- Suggest timeline milestones, marketing activities, content plans, and deadlines
- Provide strategic advice on launch sequencing and preparation
- When suggesting events, format them as JSON blocks that the user can add to their calendar

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

Be concise, strategic, and actionable. You are speaking with the founder of Everest Labs.`;

export async function POST(request: NextRequest) {
  try {
    // Verify the user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, events } = await request.json();

    // Build context about current calendar events
    let eventContext = '';
    if (events && events.length > 0) {
      eventContext = `\n\nHere are the user's current calendar events:\n${JSON.stringify(events, null, 2)}`;
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
        system: SYSTEM_PROMPT + eventContext,
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
