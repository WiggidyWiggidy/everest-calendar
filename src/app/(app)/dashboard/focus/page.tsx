'use client';

// ============================================
// Daily Focus Control Dashboard
// Morning allocation + task prioritisation
// critical path timer + distraction blocking
// ============================================
import { useState } from 'react';
import { format } from 'date-fns';
import { Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import MorningAllocation   from '@/components/focus/MorningAllocation';
import TaskPrioritizer     from '@/components/focus/TaskPrioritizer';
import CriticalPathTimer   from '@/components/focus/CriticalPathTimer';
import DistractionBlocker  from '@/components/focus/DistractionBlocker';
import ProgressRing        from '@/components/focus/ProgressRing';
import WeeklyReview        from '@/components/focus/WeeklyReview';
import { useFocusSession } from '@/hooks/useFocusSession';
import { checkFocusLimits } from '@/lib/notifications/focus';

export default function FocusDashboardPage() {
  const {
    session,
    tasks,
    loading,
    saving,
    saveSession,
    addTask,
    toggleTask,
    removeTask,
    reorderTasks,
  } = useFocusSession();

  const [timerExpired, setTimerExpired]           = useState(false);
  const [blockerOpen, setBlockerOpen]             = useState(false);
  const [pendingFeatureTask, setPendingFeatureTask] = useState<(() => void) | null>(null);

  // Called from TaskPrioritizer when user wants to add a task
  function handleAddTask(
    title: string,
    description: string,
    isCriticalPath: boolean,
    estimatedMinutes: number
  ) {
    // If timer is running (critical path active) and task is not critical — show blocker
    if (!isCriticalPath && !timerExpired && session) {
      setPendingFeatureTask(() => () => {
        addTask(title, description, false, estimatedMinutes);
      });
      setBlockerOpen(true);
      return;
    }

    addTask(title, description, isCriticalPath, estimatedMinutes);
    checkFocusLimits(tasks, session);
  }

  function handleBlockerConfirm() {
    pendingFeatureTask?.();
    setBlockerOpen(false);
    setPendingFeatureTask(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Focus</h1>
          <p className="text-gray-500 text-sm">
            {format(new Date(), 'EEEE, MMMM d')} · control what ships today
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2">
          <Target className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-medium text-indigo-700">
            {session ? `${session.critical_path_hours}h critical · ${session.feature_limit_hours}h feature` : 'No session yet'}
          </span>
        </div>
      </div>

      {/* Main grid — mobile: stacked, desktop: 3-col */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left column (2/3 wide on desktop) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Morning allocation form */}
          <MorningAllocation
            session={session}
            saving={saving}
            onSave={saveSession}
          />

          {/* Task prioritiser — only shown once session exists */}
          {session && (
            <TaskPrioritizer
              tasks={tasks}
              sessionActive={!!session}
              onAdd={handleAddTask}
              onToggle={toggleTask}
              onRemove={removeTask}
              onReorder={reorderTasks}
            />
          )}

          {/* Placeholder if no session */}
          {!session && (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  Set your morning allocation above to unlock task prioritisation.
                </p>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Right column (1/3 on desktop) */}
        <div className="space-y-5">

          {/* Progress rings */}
          {session && tasks.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Today&apos;s Progress
                </p>
                <ProgressRing tasks={tasks} />
              </CardContent>
            </Card>
          )}

          {/* Critical path timer */}
          {session && (
            <CriticalPathTimer
              criticalPathHours={session.critical_path_hours}
              onExpire={() => setTimerExpired(true)}
            />
          )}

          {/* Weekly review */}
          <WeeklyReview />

        </div>
      </div>

      {/* Distraction blocker modal */}
      <DistractionBlocker
        open={blockerOpen}
        onClose={() => { setBlockerOpen(false); setPendingFeatureTask(null); }}
        onConfirm={handleBlockerConfirm}
      />

    </div>
  );
}
