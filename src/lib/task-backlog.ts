'use client';

// ============================================
// Supabase queries for task_backlog
// Voice-to-Build Pipeline — Stage 1 DAL
// ============================================
import { createClient } from '@/lib/supabase/client';
import { TaskBacklog } from '@/types';

const supabase = createClient();

// Fetch tasks sorted by priority_score descending, optionally filtered by status
export async function getTasks(status?: string): Promise<TaskBacklog[]> {
  let query = supabase
    .from('task_backlog')
    .select('*')
    .order('priority_score', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) { console.error('getTasks error:', error); return []; }
  return data || [];
}

// Batch insert tasks produced by the analyst, stamping them with the current user's ID
export async function insertTasks(
  tasks: Array<{
    title: string;
    description: string;
    category: string;
    priority_score: number;
    status: string;
    source_thought_ids: string[];
  }>
): Promise<boolean> {
  if (tasks.length === 0) return true;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const rows = tasks.map((t) => ({ user_id: user.id, ...t }));

  const { error } = await supabase.from('task_backlog').insert(rows);
  if (error) { console.error('insertTasks error:', error); return false; }
  return true;
}

// Update the status of a single task
export async function updateTaskStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase
    .from('task_backlog')
    .update({ status })
    .eq('id', id);

  if (error) { console.error('updateTaskStatus error:', error); return false; }
  return true;
}

// Hard-delete a single task
export async function deleteTask(id: string): Promise<boolean> {
  const { error } = await supabase.from('task_backlog').delete().eq('id', id);
  if (error) { console.error('deleteTask error:', error); return false; }
  return true;
}

// ---- Launch Dependencies ----

// Returns all non-dismissed launch tasks ordered by due_date ascending
export async function getLaunchTasks(): Promise<TaskBacklog[]> {
  const { data, error } = await supabase
    .from('task_backlog')
    .select('*')
    .eq('is_launch_task', true)
    .neq('status', 'dismissed')
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) { console.error('getLaunchTasks error:', error); return []; }
  return data || [];
}

// Direct insert bypassing the Analyst pipeline
// Sets is_launch_task = true, status = 'pending'
export async function addLaunchTask(
  title: string,
  due_date: string | null
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from('task_backlog').insert({
    user_id: user.id,
    title: title.trim(),
    description: '',
    category: 'product',
    priority_score: 5,
    status: 'pending',
    is_launch_task: true,
    due_date: due_date || null,
    source_thought_ids: [],
  });

  if (error) { console.error('addLaunchTask error:', error); return false; }
  return true;
}

// ---- Build Queue ----

// Fetch all build tasks ordered by priority_score descending
export async function getBuildQueue(): Promise<TaskBacklog[]> {
  const { data, error } = await supabase
    .from('task_backlog')
    .select('*')
    .eq('task_type', 'build')
    .neq('status', 'dismissed')
    .order('priority_score', { ascending: false });

  if (error) { console.error('getBuildQueue error:', error); return []; }
  return data || [];
}

// Create a new build task (from assistant /feature capture or direct request)
export async function createBuildTask(
  title: string,
  description: string,
  category: string,
  priority_score: number,
  build_context?: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from('task_backlog').insert({
    user_id: user.id,
    title: title.trim(),
    description: description.trim(),
    category,
    priority_score: Math.min(10, Math.max(1, priority_score)),
    status: 'pending',
    source_thought_ids: [],
    task_type: 'build',
    source: 'assistant',
    build_context: build_context || null,
  });

  if (error) { console.error('createBuildTask error:', error); return false; }
  return true;
}

// Update the priority score on any task
export async function updateBuildTaskPriority(id: string, priority_score: number): Promise<boolean> {
  const { error } = await supabase
    .from('task_backlog')
    .update({ priority_score: Math.min(10, Math.max(1, priority_score)) })
    .eq('id', id);

  if (error) { console.error('updateBuildTaskPriority error:', error); return false; }
  return true;
}

// Save (or overwrite) the execution outline for a build task
export async function saveExecutionOutline(id: string, outline: string): Promise<boolean> {
  const { error } = await supabase
    .from('task_backlog')
    .update({ execution_outline: outline })
    .eq('id', id);

  if (error) { console.error('saveExecutionOutline error:', error); return false; }
  return true;
}
