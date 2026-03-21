// ============================================
// POST /api/agent-health/heartbeat
// Agents call this after each run to log status.
// Auth: X-API-Key header → INBOX_INGEST_KEY env var
// Calls log_agent_run SECURITY DEFINER RPC (anon client)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.INBOX_INGEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
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
    started_at,
    completed_at,
  } = body;

  if (!agent_name || typeof agent_name !== 'string') {
    return NextResponse.json({ error: 'agent_name is required' }, { status: 400 });
  }
  if (!['running', 'success', 'error'].includes(status as string)) {
    return NextResponse.json({ error: 'status must be running, success, or error' }, { status: 400 });
  }

  // ── Call RPC via anon client ───────────────────────────────────────────────
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.rpc('log_agent_run', {
    p_agent_name:      agent_name,
    p_status:          status,
    p_items_processed: typeof items_processed === 'number' ? items_processed : 0,
    p_error_message:   error_message ?? null,
    p_metadata:        metadata ?? null,
    p_started_at:      started_at ?? new Date().toISOString(),
    p_completed_at:    completed_at ?? new Date().toISOString(),
  });

  if (error) {
    console.error('[heartbeat] log_agent_run error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: (data as { id: string }).id }, { status: 201 });
}
