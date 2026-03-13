// ============================================
// POST /api/generate-outline
// Given a build task ID, calls Claude to produce a step-by-step
// technical execution outline, then saves it to task.execution_outline.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const OUTLINE_SYSTEM_PROMPT = `You are a senior full-stack engineer at Everest Labs working on a Next.js 14 / Supabase / TypeScript product launch platform.

Given a build task title, description, and optional context, produce a concise step-by-step technical execution outline. This will be used by a developer as their implementation checklist.

Format as a numbered markdown list. Each step should be specific and actionable — name actual files to create or modify, functions to write, and the exact approach. Max 15 steps. Be precise. No preamble, no closing remarks — just the numbered list.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id } = await request.json();
    if (!task_id) return NextResponse.json({ error: 'task_id is required' }, { status: 400 });

    // Fetch the task
    const { data: task, error: taskError } = await supabase
      .from('task_backlog')
      .select('id, title, description, build_context')
      .eq('id', task_id)
      .eq('user_id', user.id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Build the user message
    const parts = [
      `Title: ${task.title}`,
      `Description: ${task.description || '(none)'}`,
    ];
    if (task.build_context) {
      parts.push(`Context: ${task.build_context}`);
    }
    const userMessage = parts.join('\n');

    // Call Claude
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

    // Save outline to task
    const { error: updateError } = await supabase
      .from('task_backlog')
      .update({ execution_outline: outline })
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
