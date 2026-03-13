// ============================================
// /api/focus — Focus session CRUD + daily stats
// Handles session creation, task updates, and
// daily progress calculations
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

// GET /api/focus?date=YYYY-MM-DD  → session + tasks + stats for that date
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd');

  // Fetch session
  const { data: session, error: sessErr } = await supabase
    .from('daily_focus_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .single();

  if (sessErr && sessErr.code !== 'PGRST116') {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  if (!session) return NextResponse.json({ session: null, tasks: [], stats: null });

  // Fetch tasks
  const { data: tasks } = await supabase
    .from('focus_tasks')
    .select('*')
    .eq('session_id', session.id)
    .order('priority_order', { ascending: true });

  const taskList = tasks ?? [];

  // Daily progress calculations
  const stats = {
    total:                taskList.length,
    done:                 taskList.filter((t) => t.status === 'done').length,
    critical_total:       taskList.filter((t) => t.is_critical_path).length,
    critical_done:        taskList.filter((t) => t.is_critical_path && t.status === 'done').length,
    feature_total:        taskList.filter((t) => !t.is_critical_path).length,
    feature_done:         taskList.filter((t) => !t.is_critical_path && t.status === 'done').length,
    estimated_minutes:    taskList.reduce((a, t) => a + (t.estimated_minutes ?? 0), 0),
    critical_path_pct:    taskList.filter((t) => t.is_critical_path).length > 0
      ? Math.round(
          (taskList.filter((t) => t.is_critical_path && t.status === 'done').length /
           taskList.filter((t) => t.is_critical_path).length) * 100
        )
      : 0,
  };

  return NextResponse.json({ session, tasks: taskList, stats });
}

// POST /api/focus  { date, critical_path_hours, feature_limit_hours }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { date, critical_path_hours, feature_limit_hours } = body;

  if (!date || critical_path_hours == null || feature_limit_hours == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('daily_focus_sessions')
    .upsert(
      { user_id: user.id, date, critical_path_hours, feature_limit_hours },
      { onConflict: 'user_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data }, { status: 201 });
}

// PATCH /api/focus  { task_id, status?, priority_order? }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { task_id, status, priority_order } = body;

  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (status        != null) updates.status         = status;
  if (priority_order != null) updates.priority_order = priority_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('focus_tasks')
    .update(updates)
    .eq('id', task_id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}
