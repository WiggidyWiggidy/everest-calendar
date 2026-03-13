'use client';

// ============================================
// useFocusSession Hook
// Manages daily focus session state and task operations
// with optimistic updates for a snappy UI
// ============================================
import { useState, useEffect, useCallback } from 'react';
import { FocusSession, FocusTask } from '@/types/focus';
import {
  getTodaySession,
  createFocusSession,
  getSessionTasks,
  addFocusTask,
  markTaskComplete,
  deleteFocusTask,
  batchUpdateTaskPriorities,
} from '@/lib/supabase/focus';

export function useFocusSession() {
  const [session, setSession]   = useState<FocusSession | null>(null);
  const [tasks, setTasks]       = useState<FocusTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // Load today's session and its tasks
  const refresh = useCallback(async () => {
    const s = await getTodaySession();
    setSession(s);
    if (s) {
      const t = await getSessionTasks(s.id);
      setTasks(t);
    } else {
      setTasks([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Create / update the focus session for today
  async function saveSession(critical_path_hours: number, feature_limit_hours: number) {
    setSaving(true);
    const s = await createFocusSession(critical_path_hours, feature_limit_hours);
    if (s) {
      setSession(s);
      // Reload tasks in case session changed
      const t = await getSessionTasks(s.id);
      setTasks(t);
    }
    setSaving(false);
    return s;
  }

  // Add a task — optimistic insert then reconcile
  async function addTask(
    title: string,
    description: string,
    is_critical_path: boolean,
    estimated_minutes: number
  ) {
    if (!session) return null;

    const nextOrder = tasks.length > 0
      ? Math.max(...tasks.map((t) => t.priority_order)) + 1
      : 0;

    const optimisticTask: FocusTask = {
      id: `optimistic-${Date.now()}`,
      user_id: '',
      session_id: session.id,
      title,
      description: description || null,
      priority_order: nextOrder,
      is_critical_path,
      status: 'pending',
      estimated_minutes,
    };

    setTasks((prev) => [...prev, optimisticTask]);

    const created = await addFocusTask(
      session.id, title, description, is_critical_path, estimated_minutes, nextOrder
    );

    if (created) {
      // Replace optimistic entry with real row
      setTasks((prev) => prev.map((t) => t.id === optimisticTask.id ? created : t));
    } else {
      // Rollback
      setTasks((prev) => prev.filter((t) => t.id !== optimisticTask.id));
    }
    return created;
  }

  // Toggle done/pending — optimistic
  async function toggleTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const nextDone = task.status !== 'done';
    // Optimistic update
    setTasks((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: nextDone ? 'done' : 'pending' } : t
    ));

    const ok = await markTaskComplete(id, nextDone);
    if (!ok) {
      // Rollback
      setTasks((prev) => prev.map((t) =>
        t.id === id ? { ...t, status: task.status } : t
      ));
    }
  }

  // Remove a task — optimistic
  async function removeTask(id: string) {
    const original = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const ok = await deleteFocusTask(id);
    if (!ok && original) {
      setTasks((prev) => [...prev, original].sort((a, b) => a.priority_order - b.priority_order));
    }
  }

  // Reorder tasks after drag-and-drop, persist new priority_order values
  async function reorderTasks(reordered: FocusTask[]) {
    const withNewOrder = reordered.map((t, i) => ({ ...t, priority_order: i }));
    setTasks(withNewOrder); // optimistic
    await batchUpdateTaskPriorities(withNewOrder.map(({ id, priority_order }) => ({ id, priority_order })));
  }

  return {
    session,
    tasks,
    loading,
    saving,
    refresh,
    saveSession,
    addTask,
    toggleTask,
    removeTask,
    reorderTasks,
  };
}
