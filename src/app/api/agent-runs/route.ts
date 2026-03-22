// ============================================
// POST /api/agent-runs
// Vercel agents call this to log a task_run entry.
// On success, checks for next_directive_type and auto-creates
// an orchestrator_directive (loop closure).
//
// Auth: X-API-Key header (INBOX_INGEST_KEY env var)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAgentActivity } from '@/lib/logAgentActivity';

export async function POST(request: NextRequest) {
  const apiKey     = request.headers.get('x-api-key');
  const ingestKey  = process.env.INBOX_INGEST_KEY;
  if (ingestKey && apiKey !== ingestKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    agent_name,
    status,
    items_processed,
    error_message,
    metadata,
    next_directive_type,
    next_directive_metadata,
  } = body as {
    agent_name:              string;
    status:                  'running' | 'success' | 'error';
    items_processed?:        number;
    error_message?:          string;
    metadata?:               Record<string, unknown>;
    next_directive_type?:    string;
    next_directive_metadata?: Record<string, unknown>;
  };

  if (!agent_name || !status) {
    return NextResponse.json({ error: 'agent_name and status are required' }, { status: 400 });
  }

  if (!['running', 'success', 'error'].includes(status)) {
    return NextResponse.json({ error: 'status must be running | success | error' }, { status: 400 });
  }

  const supabase  = createServiceClient();
  const now       = new Date().toISOString();

  // Upsert task_run — update existing running row if present, else insert
  const { data: existingRun } = await supabase
    .from('task_runs')
    .select('id')
    .eq('agent_name', agent_name)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let runId: string;

  if (existingRun && status !== 'running') {
    // Update the existing running row to completed
    const { data: updated, error: updateErr } = await supabase
      .from('task_runs')
      .update({
        status,
        completed_at:           now,
        items_processed:        items_processed ?? 0,
        error_message:          error_message ?? null,
        metadata:               metadata ?? {},
        next_directive_type:    next_directive_type ?? null,
        next_directive_metadata: next_directive_metadata ?? null,
      })
      .eq('id', existingRun.id)
      .select('id')
      .single();

    if (updateErr) {
      console.error('[agent-runs] update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    runId = updated!.id;
  } else {
    // Insert new row (covers 'running' status or first-time completion without a start row)
    const { data: inserted, error: insertErr } = await supabase
      .from('task_runs')
      .insert({
        agent_name,
        status,
        started_at:             now,
        completed_at:           status !== 'running' ? now : null,
        items_processed:        items_processed ?? 0,
        error_message:          error_message ?? null,
        metadata:               metadata ?? {},
        next_directive_type:    next_directive_type ?? null,
        next_directive_metadata: next_directive_metadata ?? null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[agent-runs] insert error:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    runId = inserted!.id;
  }

  // Loop closure: if status=success and next_directive_type set, create directive
  if (status === 'success' && next_directive_type) {
    const { error: directiveErr } = await supabase
      .from('orchestrator_directives')
      .insert({
        directive_type: next_directive_type,
        instruction:    `Auto-created from completed task run: ${runId}`,
        status:         'pending',
        priority:       'medium',
        metadata:       next_directive_metadata ?? {},
        source_agent:   agent_name,
      });

    if (directiveErr) {
      console.error('[agent-runs] directive insert error:', directiveErr);
    } else {
      await logAgentActivity({
        agentName:    agent_name,
        agentSource:  'vercel',
        activityType: 'handoff',
        description:  `Task run completed → auto-created directive: ${next_directive_type}`,
        domain:       'system',
        metadata:     { run_id: runId, next_directive_type },
      });
    }
  }

  // Log the run itself
  await logAgentActivity({
    agentName:    agent_name,
    agentSource:  'vercel',
    activityType: status === 'success' ? 'auto_action' : status === 'error' ? 'error' : 'info',
    description:  status === 'running'
      ? `${agent_name} run started`
      : `${agent_name} run ${status} — ${items_processed ?? 0} items processed${error_message ? ': ' + error_message.slice(0, 80) : ''}`,
    domain:       'system',
    metadata:     { run_id: runId, items_processed: items_processed ?? 0 },
  });

  return NextResponse.json({ success: true, run_id: runId });
}
