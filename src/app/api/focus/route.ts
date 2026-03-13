// ============================================
// /api/focus — Focus session CRUD + daily progress calculations
// Server-side so it can be called from external integrations (e.g. agents)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';

// ─── GET /api/focus?mode=today|week|progress ─────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mode  = req.nextUrl.searchParams.get('mode') ?? 'today';
  const today = format(new Date(), 'yyyy-MM-dd');

  if (mode === 'today') {
    const { data: session } = await supabase
      .from('daily_focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (!session) return NextResponse.json({ session: null, tasks: [] });

    const { data: tasks } = await supabase
      .from('focus_tasks')
      .select('*')
      .eq('session_id', session.id)
      .order('priority_order', { ascending: true });

    return NextResponse.json({ session, tasks: tasks ?? [] });
  }

  if (mode === 'week') {
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const { data: sessions } = await supabase
      .from('daily_focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: true });

    if (!sessions || sessions.length === 0) return NextResponse.json({ sessions: [], tasks: [] });

    const sessionIds = sessions.map((s: { id: string }) => s.id);
    const { data: tasks } = await supabase
      .from('focus_tasks')
      .select('*')
      .in('session_id', sessionIds);

    return NextResponse.json({ sessions, tasks: tasks ?? [] });
  }

  if (mode === 'progress') {
    const { data: session } = await supabase
      .from('daily_focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (!session) return NextResponse.json({ progress: null });

    const { data: tasks } = await supabase
      .from('focus_tasks')
      .select('*')
      .eq('session_id', session.id);

    const all        = tasks ?? [];
    const critical   = all.filter((t: { is_critical_path: boolean }) => t.is_critical_path);
    const feature    = all.filter((t: { is_critical_path: boolean }) => !t.is_critical_path);
    const critDone   = critical.filter((t: { status: string }) => t.status === 'done').length;
    const featDone   = feature.filter((t: { status: string }) => t.status === 'done').length;

    return NextResponse.json({
      progress: {
        session,
        critical_done:  critDone,
        critical_total: critical.length,
        feature_done:   featDone,
        feature_total:  feature.length,
        on_track:       critical.length === 0 || critDone / critical.length >= 0.5,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
}

// ─── POST /api/focus — create/update session ────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === 'upsert_session') {
    const { critical_path_hours, feature_limit_hours } = body;
    const today = format(new Date(), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('daily_focus_sessions')
      .upsert(
        { user_id: user.id, date: today, critical_path_hours, feature_limit_hours },
        { onConflict: 'user_id,date' },
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: data });
  }

  if (action === 'add_task') {
    const { session_id, title, description, is_critical_path, estimated_minutes, priority_order } = body;

    const { data, error } = await supabase
      .from('focus_tasks')
      .insert({
        user_id: user.id,
        session_id,
        title,
        description,
        is_critical_path,
        estimated_minutes,
        priority_order,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ task: data });
  }

  if (action === 'update_task') {
    const { task_id, ...updates } = body;
    delete updates.action;

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

  if (action === 'reorder_tasks') {
    const { priorities } = body as { priorities: { task_id: string; priority_order: number }[] };

    await Promise.all(
      priorities.map(({ task_id, priority_order }) =>
        supabase
          .from('focus_tasks')
          .update({ priority_order })
          .eq('id', task_id)
          .eq('user_id', user.id),
      ),
    );

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
