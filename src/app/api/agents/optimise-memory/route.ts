// ============================================
// /api/agents/optimise-memory
// Fetches all manual/auto memories for an agent, sends them to Claude
// with a clean-up prompt, and returns the optimised note set.
// Does NOT write to the database — the client applies the result after
// the user reviews the before/after diff.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OptimisedNote } from '@/types';

const OPTIMISER_PROMPT = `You are a memory optimisation assistant. You will be given a set of memory notes belonging to an AI agent. Your job is to clean and optimise them.

Rules:
- Merge notes that contain duplicate or overlapping information
- Remove notes that are clearly outdated or contradicted by newer notes
- Rewrite notes to be concise and clearly structured in markdown
- Preserve ALL genuinely useful information — do not remove things just to shorten
- Keep the same title format: short, descriptive

Return ONLY a JSON array of optimised notes. No preamble. No explanation. No markdown code block wrapper. Format:
[
  { "title": "Note title", "content": "Note content in markdown" }
]

Here are the current memory notes:
{memory_notes_json}`;

export async function POST(request: NextRequest) {
  try {
    // Verify the user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agent_id } = await request.json();

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    // Fetch only manual + auto memories (never system_prompt, never archived)
    const { data: memories, error: memError } = await supabase
      .from('agent_memories')
      .select('title, content, memory_type')
      .eq('agent_id', agent_id)
      .eq('user_id', user.id)
      .in('memory_type', ['manual', 'auto'])
      .or('is_archived.eq.false,is_archived.is.null')
      .order('created_at', { ascending: true });

    if (memError) {
      console.error('optimise-memory: fetch error:', memError);
      return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 });
    }

    if (!memories || memories.length === 0) {
      return NextResponse.json({ error: 'No memories to optimise' }, { status: 400 });
    }

    // Build the original snapshot (title + content only, no DB fields)
    const originalNotes: OptimisedNote[] = memories.map((m) => ({
      title: m.title,
      content: m.content,
    }));

    // Build the optimiser prompt
    const prompt = OPTIMISER_PROMPT.replace(
      '{memory_notes_json}',
      JSON.stringify(originalNotes, null, 2)
    );

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
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('optimise-memory: Anthropic error:', errorText);
      return NextResponse.json(
        { error: 'Failed to get response from Claude' },
        { status: 500 }
      );
    }

    const aiData = await response.json();
    const rawText = aiData.content[0]?.text || '';

    // Parse the JSON array from Claude's response
    let optimisedNotes: OptimisedNote[] = [];
    try {
      // Strip any accidental markdown code fences Claude might add
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        optimisedNotes = parsed.filter(
          (n): n is OptimisedNote =>
            typeof n === 'object' &&
            typeof n.title === 'string' &&
            typeof n.content === 'string'
        );
      }
    } catch (parseErr) {
      console.error('optimise-memory: failed to parse Claude response:', parseErr, rawText);
      return NextResponse.json(
        { error: 'Claude returned an unexpected format. Please try again.' },
        { status: 500 }
      );
    }

    if (optimisedNotes.length === 0) {
      return NextResponse.json(
        { error: 'Optimiser returned no notes. Please try again.' },
        { status: 500 }
      );
    }

    // Compute basic stats
    const stats = {
      originalCount: originalNotes.length,
      optimisedCount: optimisedNotes.length,
      delta: optimisedNotes.length - originalNotes.length, // negative = notes merged/removed
    };

    return NextResponse.json({ original: originalNotes, optimised: optimisedNotes, stats });
  } catch (error) {
    console.error('optimise-memory: unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
