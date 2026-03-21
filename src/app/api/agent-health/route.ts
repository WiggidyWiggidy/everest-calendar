// ============================================
// GET /api/agent-health
// Returns latest run per agent with health color.
// Auth: session (client-side dashboard use)
// ============================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AgentHealthStatus } from '@/types';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Latest run per agent, ordered by agent name
  const { data: rows, error } = await supabase
    .from('task_runs')
    .select('agent_name, status, started_at, completed_at, items_processed, error_message')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate — keep only the most recent row per agent_name
  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows ?? []) {
    if (!seen.has(row.agent_name)) {
      seen.add(row.agent_name);
      latest.push(row);
    }
  }

  const now = Date.now();

  const agents: AgentHealthStatus[] = latest.map((row) => {
    const ageMs  = now - new Date(row.started_at).getTime();
    const ageHrs = ageMs / (1000 * 60 * 60);

    let health: AgentHealthStatus['health'];
    if (row.status === 'error') {
      health = 'amber';
    } else if (ageHrs > 6) {
      health = 'red';
    } else if (ageHrs > 2) {
      health = 'amber';
    } else {
      health = 'green';
    }

    return {
      agent_name:      row.agent_name,
      last_status:     row.status as AgentHealthStatus['last_status'],
      last_run_at:     row.started_at,
      items_processed: row.items_processed ?? 0,
      error_message:   row.error_message ?? null,
      health,
    };
  });

  return NextResponse.json({ agents });
}
