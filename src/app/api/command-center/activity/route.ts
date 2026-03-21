// ============================================
// POST /api/command-center/activity
// Allows Cowork agents to log activity entries.
// Same API-key pattern as /api/inbox/ingest.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';

const INGEST_KEY = process.env.INBOX_INGEST_KEY;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('X-API-Key');
  if (!INGEST_KEY || apiKey !== INGEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { agent_name, agent_source, activity_type, description, domain, metadata } = body;

  if (!agent_name || !agent_source || !activity_type || !description) {
    return NextResponse.json(
      { error: 'Missing required fields: agent_name, agent_source, activity_type, description' },
      { status: 400 }
    );
  }

  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.rpc('log_activity', {
    p_agent_name:    agent_name,
    p_agent_source:  agent_source,
    p_activity_type: activity_type,
    p_description:   description,
    p_domain:        domain ?? null,
    p_metadata:      metadata ?? {},
  });

  if (error) {
    console.error('[command-center/activity] RPC error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data });
}
