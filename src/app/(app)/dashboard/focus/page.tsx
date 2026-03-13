'use client';

// ============================================
// Daily Focus Control Dashboard
// Answers: "Am I protecting my critical path today?"
// ============================================
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Target, Loader2 } from 'lucide-react';
import { useFocusSession } from '@/hooks/useFocusSession';
import MorningAllocation from '@/components/focus/MorningAllocation';
import TaskPrioritizer    from '@/components/focus/TaskPrioritizer';
import CriticalPathTimer  from '@/components/focus/CriticalPathTimer';
import DistractionBlocker from '@/components/focus/DistractionBlocker';
import ProgressRing       from '@/components/focus/ProgressRing';
import WeeklyReview       from '@/components/focus/WeeklyReview';

export default function FocusDashboardPage() {
  const {
    session,
    tasks,
    loading,
    saving,
    saveSession,
    addTask,
    reorderTasks,
    completeTask,
    removeTask,
  } = useFocusSession();

  // Timer state
  const [criticalExpired,       setCriticalExpired]       = useState(false);
  const [featureMinutesElapsed, setFeatureMinutesElapsed] = useState(0);

  // Distraction blocker state
  const [blockerOpen,   setBlockerOpen]   = useState(false);
  const [pendingTask,   setPendingTask]   = useState<{
    title: string;
    description: string | null;
    isCritical: boolean;
    estimatedMinutes: number | null;
  } | null>(null);

  const handleCriticalExpired = useCallback(() => {
    setCriticalExpired(true);
  }, []);

  // Called when user tries to add a non-critical task during critical block
  function handleNonCriticalAttempt() {
    setBlockerOpen(true);
  }

  // Force-add the pending non-critical task despite the blocker
  async function handleForceAdd() {
    setBlockerOpen(false);
    if (pendingTask) {
      await addTask(
        pendingTask.title,
        pendingTask.description,
        false,
        pendingTask.estimatedMinutes,
      );
      setPendingTask(null);
    }
  }

  // Derived progress stats
  const criticalTasks = tasks.filter((t) => t.is_critical_path);
  const featureTasks  = tasks.filter((t) => !t.is_critical_path);
  const criticalDone  = criticalTasks.filter((t) => t.status === 'done').length;
  const featureDone   = featureTasks.filter((t) => t.status === 'done').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="h-6 w-6 text-indigo-600" />
            Daily Focus
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {format(new Date(), 'EEEE, MMMM d')} — protect the critical path
          </p>
        </div>

        {/* Today's at-a-glance ring — mobile top bar */}
        <div className="hidden sm:block">
          <ProgressRing
            criticalDone={criticalDone}
            criticalTotal={criticalTasks.length}
            featureDone={featureDone}
            featureTotal={featureTasks.length}
            size={100}
          />
        </div>
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column — task management (2/3 wide on desktop) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Morning allocation form */}
          <MorningAllocation
            session={session}
            saving={saving}
            onSave={saveSession}
          />

          {/* Drag-and-drop task prioritizer */}
          <TaskPrioritizer
            tasks={tasks}
            sessionReady={session !== null}
            onReorder={reorderTasks}
            onAdd={addTask}
            onComplete={completeTask}
            onRemove={removeTask}
            onNonCriticalAttempt={handleNonCriticalAttempt}
            criticalPathActive={session !== null && !criticalExpired}
          />

        </div>

        {/* Right column — timer, ring, weekly review */}
        <div className="space-y-6">

          {/* Progress ring (mobile shows here, desktop hidden above) */}
          <div className="sm:hidden flex justify-center">
            <ProgressRing
              criticalDone={criticalDone}
              criticalTotal={criticalTasks.length}
              featureDone={featureDone}
              featureTotal={featureTasks.length}
            />
          </div>

          {/* Pomodoro-style critical path timer */}
          <CriticalPathTimer
            session={session}
            onCriticalExpired={handleCriticalExpired}
            featureMinutesElapsed={featureMinutesElapsed}
          />

          {/* 7-day adherence chart */}
          <WeeklyReview />

        </div>

      </div>

      {/* ── Distraction blocker modal ────────────────────────────────────────── */}
      <DistractionBlocker
        open={blockerOpen}
        onClose={() => { setBlockerOpen(false); setPendingTask(null); }}
        onForce={handleForceAdd}
      />

    </div>
  );
}
