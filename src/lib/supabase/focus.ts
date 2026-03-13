'use client';

// ============================================
// Supabase queries for Daily Focus Sessions
// ============================================
import { createClient } from '@/lib/supabase/client';
import { FocusSession, FocusTask, WeeklyFocusStats } from '@/types/focus';
import { format, subDays } from 'date-fns';

const supabase = createClient();

// Get today's focus session for the current user
export async function getTodaySession(): Promise<FocusSession | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = format(new Date(), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('daily_focus_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row found
    console.error('getTodaySession error:', error);
    return null;
  }
  return data;
}

// Create a new focus session for today
export async function createFocusSession(
  critical_path_hours: number,
  feature_limit_hours: number
): Promise<FocusSession | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = format(new Date(), 'yyyy-MM-dd');

  // Upsert — replace if one already exists for today
  const { data, error } = await supabase
    .from('daily_focus_sessions')
    .upsert(
      { user_id: user.id, date: today, critical_path_hours, feature_limit_hours },
      { onConflict: 'user_id,date' }
    )
    .select()
    .single();

  if (error) { console.error('createFocusSession error:', error); return null; }
  return data;
}

// Fetch all tasks for a session
export async function getSessionTasks(session_id: string): Promise<FocusTask[]> {
  const { data, error } = await supabase
    .from('focus_tasks')
    .select('*')
    .eq('session_id', session_id)
    .order('priority_order', { ascending: true });

  if (error) { console.error('getSessionTasks error:', error); return []; }
  return data || [];
}

// Add a task to a session
export async function addFocusTask(
  session_id: string,
  title: string,
  description: string,
  is_critical_path: boolean,
  estimated_minutes: number,
  priority_order: number
): Promise<FocusTask | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('focus_tasks')
    .insert({
      user_id: user.id,
      session_id,
      title: title.trim(),
      description: description.trim() || null,
      is_critical_path,
      estimated_minutes,
      priority_order,
      status: 'pending',
    })
    .select()
    .single();

  if (error) { console.error('addFocusTask error:', error); return null; }
  return data;
}

// Update the priority_order of a task (used after drag-and-drop reorder)
export async function updateTaskPriority(id: string, priority_order: number): Promise<boolean> {
  const { error } = await supabase
    .from('focus_tasks')
    .update({ priority_order })
    .eq('id', id);

  if (error) { console.error('updateTaskPriority error:', error); return false; }
  return true;
}

// Batch-update priority orders for a list of tasks
export async function batchUpdateTaskPriorities(
  updates: Array<{ id: string; priority_order: number }>
): Promise<boolean> {
  const results = await Promise.all(
    updates.map(({ id, priority_order }) => updateTaskPriority(id, priority_order))
  );
  return results.every(Boolean);
}

// Mark a task as complete (or revert to pending)
export async function markTaskComplete(id: string, done: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('focus_tasks')
    .update({ status: done ? 'done' : 'pending' })
    .eq('id', id);

  if (error) { console.error('markTaskComplete error:', error); return false; }
  return true;
}

// Delete a focus task
export async function deleteFocusTask(id: string): Promise<boolean> {
  const { error } = await supabase.from('focus_tasks').delete().eq('id', id);
  if (error) { console.error('deleteFocusTask error:', error); return false; }
  return true;
}

// Fetch last 7 days of sessions + task stats for WeeklyReview
export async function getWeeklyStats(): Promise<WeeklyFocusStats[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const sevenDaysAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd');

  const { data: sessions, error: sessErr } = await supabase
    .from('daily_focus_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: true });

  if (sessErr || !sessions) return [];

  const stats: WeeklyFocusStats[] = await Promise.all(
    sessions.map(async (s) => {
      const tasks = await getSessionTasks(s.id);
      return {
        date: s.date,
        critical_path_hours: s.critical_path_hours,
        feature_limit_hours: s.feature_limit_hours,
        tasks_total: tasks.length,
        tasks_done: tasks.filter((t) => t.status === 'done').length,
        critical_tasks_total: tasks.filter((t) => t.is_critical_path).length,
        critical_tasks_done: tasks.filter((t) => t.is_critical_path && t.status === 'done').length,
      };
    })
  );

  return stats;
}
