'use client';

// ============================================
// useFocusSession — manages today's focus session with optimistic updates
// ============================================
import { useState, useEffect, useCallback } from 'react';
import { FocusSession, FocusTask, TaskPriority } from '@/types/focus';
import {
  getTodaySession,
  createFocusSession,
  addFocusTask,
  updateTaskPriority,
  markTaskComplete,
  updateTaskStatus,
  deleteFocusTask,
} from '@/lib/supabase/focus';

export interface UseFocusSessionReturn {
  session: FocusSession | null;
  tasks: FocusTask[];
  loading: boolean;
  saving: boolean;
  saveSession: (criticalHours: number, featureHours: number) => Promise<void>;
  addTask: (
    title: string,
    description: string | null,
    isCritical: boolean,
    estimatedMinutes: number | null,
  ) => Promise<void>;
  reorderTasks: (priorities: TaskPriority[]) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  setTaskStatus: (taskId: string, status: FocusTask['status']) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useFocusSession(): UseFocusSessionReturn {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [tasks,   setTasks]   = useState<FocusTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const refresh = useCallback(async () => {
    const result = await getTodaySession();
    setSession(result.session);
    setTasks(result.tasks);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const saveSession = useCallback(async (criticalHours: number, featureHours: number) => {
    setSaving(true);
    const s = await createFocusSession(criticalHours, featureHours);
    if (s) setSession(s);
    setSaving(false);
  }, []);

  const addTask = useCallback(async (
    title: string,
    description: string | null,
    isCritical: boolean,
    estimatedMinutes: number | null,
  ) => {
    if (!session) return;
    const priorityOrder = tasks.length;

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const tempTask: FocusTask = {
      id: tempId,
      user_id: '',
      session_id: session.id,
      title,
      description,
      priority_order: priorityOrder,
      is_critical_path: isCritical,
      status: 'pending',
      estimated_minutes: estimatedMinutes,
      created_at: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, tempTask]);

    const created = await addFocusTask(
      session.id, title, description, isCritical, estimatedMinutes, priorityOrder,
    );
    if (created) {
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    }
  }, [session, tasks.length]);

  const reorderTasks = useCallback(async (priorities: TaskPriority[]) => {
    // Optimistic reorder
    setTasks((prev) => {
      const map = new Map(priorities.map(({ task_id, priority_order }) => [task_id, priority_order]));
      return [...prev]
        .map((t) => ({ ...t, priority_order: map.get(t.id) ?? t.priority_order }))
        .sort((a, b) => a.priority_order - b.priority_order);
    });
    await updateTaskPriority(priorities);
  }, []);

  const completeTask = useCallback(async (taskId: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'done' } : t)));
    await markTaskComplete(taskId);
  }, []);

  const setTaskStatus = useCallback(async (taskId: string, status: FocusTask['status']) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await updateTaskStatus(taskId, status);
  }, []);

  const removeTask = useCallback(async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteFocusTask(taskId);
  }, []);

  return {
    session,
    tasks,
    loading,
    saving,
    saveSession,
    addTask,
    reorderTasks,
    completeTask,
    setTaskStatus,
    removeTask,
    refresh,
  };
}
