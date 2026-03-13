// ============================================
// Daily Focus Control Dashboard — Supabase CRUD
// Browser client only (called from hooks/components)
// ============================================
import { createClient } from '@/lib/supabase/client';
import { format, subDays } from 'date-fns';
import { FocusSession, FocusTask, TaskPriority, WeeklyFocusStats } from '@/types/focus';

// ─── Session ─────────────────────────────────────────────────────────────────

export async function getTodaySession(): Promise<{ session: FocusSession | null; tasks: FocusTask[] }> {
  const supabase = createClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: session } = await supabase
    .from('daily_focus_sessions')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (!session) return { session: null, tasks: [] };

  const { data: tasks } = await supabase
    .from('focus_tasks')
    .select('*')
    .eq('session_id', session.id)
    .order('priority_order', { ascending: true });

  return { session: session as FocusSession, tasks: (tasks ?? []) as FocusTask[] };
}

export async function createFocusSession(
  criticalPathHours: number,
  featureLimitHours: number,
): Promise<FocusSession | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = format(new Date(), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('daily_focus_sessions')
    .upsert(
      {
        user_id: user.id,
        date: today,
        critical_path_hours: criticalPathHours,
        feature_limit_hours: featureLimitHours,
      },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single();

  if (error) { console.error('createFocusSession', error); return null; }
  return data as FocusSession;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function addFocusTask(
  sessionId: string,
  title: string,
  description: string | null,
  isCriticalPath: boolean,
  estimatedMinutes: number | null,
  priorityOrder: number,
): Promise<FocusTask | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('focus_tasks')
    .insert({
      user_id: user.id,
      session_id: sessionId,
      title,
      description,
      is_critical_path: isCriticalPath,
      estimated_minutes: estimatedMinutes,
      priority_order: priorityOrder,
      status: 'pending',
    })
    .select()
    .single();

  if (error) { console.error('addFocusTask', error); return null; }
  return data as FocusTask;
}

export async function updateTaskPriority(priorities: TaskPriority[]): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    priorities.map(({ task_id, priority_order }) =>
      supabase.from('focus_tasks').update({ priority_order }).eq('id', task_id),
    ),
  );
}

export async function markTaskComplete(taskId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from('focus_tasks').update({ status: 'done' }).eq('id', taskId);
}

export async function updateTaskStatus(
  taskId: string,
  status: FocusTask['status'],
): Promise<void> {
  const supabase = createClient();
  await supabase.from('focus_tasks').update({ status }).eq('id', taskId);
}

export async function deleteFocusTask(taskId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from('focus_tasks').delete().eq('id', taskId);
}

// ─── Weekly stats ─────────────────────────────────────────────────────────────

export async function getWeekSessions(): Promise<FocusSession[]> {
  const supabase = createClient();
  const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  const { data } = await supabase
    .from('daily_focus_sessions')
    .select('*')
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: true });

  return (data ?? []) as FocusSession[];
}

export async function getWeekTasks(sessionIds: string[]): Promise<FocusTask[]> {
  if (sessionIds.length === 0) return [];
  const supabase = createClient();

  const { data } = await supabase
    .from('focus_tasks')
    .select('*')
    .in('session_id', sessionIds);

  return (data ?? []) as FocusTask[];
}

export async function getWeeklyStats(): Promise<WeeklyFocusStats[]> {
  const sessions = await getWeekSessions();
  if (sessions.length === 0) return [];

  const tasks = await getWeekTasks(sessions.map((s) => s.id));

  return sessions.map((s) => {
    const dayTasks = tasks.filter((t) => t.session_id === s.id);
    const critical = dayTasks.filter((t) => t.is_critical_path);
    const feature  = dayTasks.filter((t) => !t.is_critical_path);
    return {
      date: s.date,
      critical_path_hours: s.critical_path_hours,
      feature_limit_hours: s.feature_limit_hours,
      critical_done:  critical.filter((t) => t.status === 'done').length,
      critical_total: critical.length,
      feature_done:   feature.filter((t) => t.status === 'done').length,
      feature_total:  feature.length,
    };
  });
}
