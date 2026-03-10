// ============================================
// POST /api/process-thoughts
// Voice-to-Build Pipeline — Stage 4: Processing Engine
//
// Fetches unprocessed raw thoughts, sends them to Claude with the
// user's custom analyst prompt, parses the structured JSON response,
// saves tasks to task_backlog, and marks thoughts as processed.
// ============================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_MASTER_PROMPT =
  `You are the Lead Technical Analyst scaling global physical product brands (Europe/US focus). Review these raw brain dumps. Break them into distinct technical tasks. Score each task (1-10) based strictly on: 1. Automating workflows to save the founder time. 2. Improving conversion rates and revenue systems. Return a strict JSON array with objects containing: "title" (string), "category" (string), "description" (string, exactly 2 sentences), "priority_score" (integer 1-10). Return ONLY the JSON array. No preamble. No markdown code fences.`;

export async function POST() {
  try {
    // 1. AUTH CHECK
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. FETCH UNPROCESSED THOUGHTS
    const { data: thoughts, error: thoughtsError } = await supabase
      .from('raw_thoughts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'unprocessed')
      .order('created_at', { ascending: true });

    if (thoughtsError) {
      console.error('process-thoughts: fetch thoughts error:', thoughtsError);
      return NextResponse.json({ error: 'Failed to fetch thoughts' }, { status: 500 });
    }

    if (!thoughts || thoughts.length === 0) {
      return NextResponse.json(
        { error: 'No unprocessed thoughts to analyse' },
        { status: 400 }
      );
    }

    // 3. FETCH ANALYST CONFIG
    const { data: config } = await supabase
      .from('analyst_config')
      .select('master_prompt')
      .eq('user_id', user.id)
      .single();

    const masterPrompt = config?.master_prompt || DEFAULT_MASTER_PROMPT;

    // 4. FORMAT THOUGHTS FOR CLAUDE
    const formattedThoughts = thoughts
      .map((t, i) => `${i + 1}. ${t.text}`)
      .join('\n');
    const userMessage = `Here are ${thoughts.length} raw thoughts to process:\n\n${formattedThoughts}`;

    // 5. CALL CLAUDE API
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
        system: masterPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error('process-thoughts: Claude API error:', response.status, await response.text());
      return NextResponse.json({ error: 'Claude API request failed' }, { status: 500 });
    }

    const aiData = await response.json();
    const rawText: string = aiData.content[0]?.text || '';

    // 6. PARSE CLAUDE'S RESPONSE
    // Strip markdown code fences if present (despite the prompt asking Claude not to use them)
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('process-thoughts: JSON parse failed. Raw text:', rawText);
      return NextResponse.json(
        { error: 'Claude returned unexpected format. Try adjusting the prompt.' },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Claude returned unexpected format. Try adjusting the prompt.' },
        { status: 500 }
      );
    }

    // Validate each item — filter out anything malformed
    interface RawTask {
      title: unknown;
      category: unknown;
      description: unknown;
      priority_score: unknown;
    }

    const validTasks = (parsed as RawTask[]).filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.title !== 'string' || !item.title.trim()) return false;
      if (typeof item.category !== 'string' || !item.category.trim()) return false;
      if (typeof item.description !== 'string' || !item.description.trim()) return false;
      const score = Number(item.priority_score);
      if (isNaN(score) || score < 1 || score > 10) return false;
      return true;
    });

    if (validTasks.length === 0) {
      return NextResponse.json(
        { error: 'Claude did not return any valid tasks. Try adjusting the prompt.' },
        { status: 500 }
      );
    }

    // 7. SAVE TASKS TO DATABASE
    const thoughtIds = thoughts.map((t) => t.id);
    const tasksToInsert = validTasks.map((task) => ({
      user_id: user.id,
      title: String(task.title).trim(),
      description: String(task.description).trim(),
      category: String(task.category).trim(),
      priority_score: Math.min(10, Math.max(1, Math.round(Number(task.priority_score)))),
      status: 'pending',
      source_thought_ids: thoughtIds,
    }));

    const { error: insertError } = await supabase
      .from('task_backlog')
      .insert(tasksToInsert);

    if (insertError) {
      console.error('process-thoughts: insert tasks error:', insertError);
      return NextResponse.json({ error: 'Failed to save tasks' }, { status: 500 });
    }

    // 8. MARK THOUGHTS AS PROCESSED (only after tasks are saved)
    const { error: updateError } = await supabase
      .from('raw_thoughts')
      .update({ status: 'processed' })
      .in('id', thoughtIds);

    if (updateError) {
      // Tasks are saved — log the error but don't fail the request
      console.error('process-thoughts: mark thoughts processed error:', updateError);
    }

    // 9. RETURN SUCCESS
    return NextResponse.json({ success: true, tasks_created: tasksToInsert.length });
  } catch (err) {
    console.error('process-thoughts: unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
