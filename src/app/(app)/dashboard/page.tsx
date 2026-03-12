'use client';

// ============================================
// Dashboard Page — Sprint 0: Launch Readiness + Fixes
// Answers in under 5 seconds: "Am I on track for March 29th?"
//
// Fixes applied:
//   1. Mobile countdown banner (lg:hidden) above stat cards
//   2. Stat cards are clickable → drill-down modal showing filtered events
//   3. Upcoming events are clickable → opens edit dialog
//   4. Big Movers plural, each has a mark-done + edit button
//   5. Launch dep input auto-focuses after adding a task
//   6. Completion rate = (calendar done + launch done) / (calendar total + launch total)
// ============================================
import { useState, useMemo, useEffect, useRef } from 'react';
import { format, isAfter, isBefore, addDays, startOfDay, differenceInDays, parseISO } from 'date-fns';
import {
  Rocket,
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  TrendingUp,
  CheckSquare,
  Loader2,
  Check,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EventDialog from '@/components/calendar/EventDialog';
import { useEvents } from '@/lib/hooks/useEvents';
import { getLaunchTasks, addLaunchTask, updateTaskStatus } from '@/lib/task-backlog';
import { CATEGORY_COLORS, CATEGORY_LABELS, CalendarEvent, EventFormData, TaskBacklog } from '@/types';
import { cn } from '@/lib/utils';

type StatModalFilter = 'total' | 'planned' | 'in-progress' | 'done' | 'overdue';

export default function DashboardPage() {
  const { events, loading, createEvent, updateEvent, deleteEvent } = useEvents();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [eventToEdit, setEventToEdit]   = useState<CalendarEvent | null>(null);
  const [statModal, setStatModal]       = useState<{ filter: StatModalFilter; label: string } | null>(null);

  // ── Launch date ──────────────────────────────────────────────────────────────
  const [launchDate, setLaunchDate]     = useState<Date | null>(null);

  // ── Launch task state ────────────────────────────────────────────────────────
  const [launchTasks, setLaunchTasks]   = useState<TaskBacklog[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [addingTask, setAddingTask]     = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const launchDepsRef      = useRef<HTMLDivElement>(null);
  const taskTitleInputRef  = useRef<HTMLInputElement>(null);

  // Read the launch date saved in Settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('everest_launch_date');
    if (stored) setLaunchDate(parseISO(stored));
  }, []);

  // Fetch launch dependency tasks
  useEffect(() => {
    async function fetchLaunchTasks() {
      const tasks = await getLaunchTasks();
      setLaunchTasks(tasks);
    }
    fetchLaunchTasks();
  }, []);

  // ── Computed stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today    = startOfDay(new Date());
    const nextWeek = addDays(today, 7);

    const upcoming = events
      .filter((e) => {
        const date = new Date(e.event_date + 'T00:00:00');
        return isAfter(date, today) || format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
      })
      .filter((e) => isBefore(new Date(e.event_date + 'T00:00:00'), nextWeek))
      .sort((a, b) => a.event_date.localeCompare(b.event_date));

    const planned    = events.filter((e) => e.status === 'planned').length;
    const inProgress = events.filter((e) => e.status === 'in-progress').length;
    const done       = events.filter((e) => e.status === 'done').length;
    const overdue    = events.filter(
      (e) => e.status === 'planned' && isBefore(new Date(e.event_date + 'T00:00:00'), startOfDay(new Date()))
    ).length;

    return { upcoming, planned, inProgress, done, overdue, total: events.length };
  }, [events]);

  // Events shown inside the stat drill-down modal
  const statModalEvents = useMemo<CalendarEvent[]>(() => {
    if (!statModal) return [];
    const today = startOfDay(new Date());
    const sort  = (arr: CalendarEvent[]) => [...arr].sort((a, b) => a.event_date.localeCompare(b.event_date));
    switch (statModal.filter) {
      case 'total':       return sort(events);
      case 'planned':     return sort(events.filter((e) => e.status === 'planned'));
      case 'in-progress': return sort(events.filter((e) => e.status === 'in-progress'));
      case 'done':        return sort(events.filter((e) => e.status === 'done'));
      case 'overdue':     return sort(
        events.filter((e) => e.status === 'planned' && isBefore(new Date(e.event_date + 'T00:00:00'), today))
      );
      default: return [];
    }
  }, [statModal, events]);

  // Fix 6: combined completion rate
  const launchTasksDone = launchTasks.filter((t) => t.status === 'done').length;
  const totalItems      = stats.total + launchTasks.length;
  const doneItems       = stats.done + launchTasksDone;
  const completionPct   = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const daysUntilLaunch      = launchDate ? differenceInDays(launchDate, new Date()) : null;
  const incompleteLaunchTasks = launchTasks.filter((t) => t.status !== 'done').length;

  // Fix 4: plural big movers
  const todaysBigMovers = events.filter(
    (e) => e.is_big_mover && e.event_date === format(new Date(), 'yyyy-MM-dd')
  );

  // Sort launch tasks: overdue → future/no-date → done
  const sortedLaunchTasks = [...launchTasks].sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    const today    = startOfDay(new Date());
    const aOverdue = a.due_date && isBefore(new Date(a.due_date + 'T00:00:00'), today);
    const bOverdue = b.due_date && isBefore(new Date(b.due_date + 'T00:00:00'), today);
    if (aOverdue && !bOverdue) return -1;
    if (bOverdue && !aOverdue) return 1;
    return 0;
  });

  // ── Event handlers ────────────────────────────────────────────────────────────
  async function handleQuickAdd(data: EventFormData) {
    await createEvent(data);
  }

  async function handleEventUpdate(data: EventFormData) {
    if (!eventToEdit) return;
    await updateEvent(eventToEdit.id, data);
  }

  async function handleEventDelete() {
    if (!eventToEdit) return;
    await deleteEvent(eventToEdit.id);
  }

  // Mark a calendar event done directly from the Big Movers banner
  async function handleMarkEventDone(event: CalendarEvent) {
    await updateEvent(event.id, {
      title:        event.title,
      description:  event.description || '',
      event_date:   event.event_date,
      event_time:   event.event_time || '',
      category:     event.category,
      priority:     event.priority,
      status:       'done',
      is_big_mover: event.is_big_mover ?? false,
    });
  }

  async function handleAddLaunchTask() {
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    const success = await addLaunchTask(newTaskTitle, newTaskDueDate || null);
    if (success) {
      setNewTaskTitle('');
      setNewTaskDueDate('');
      const updated = await getLaunchTasks();
      setLaunchTasks(updated);
      // Fix 5: auto-focus the input so the user can keep typing
      setTimeout(() => taskTitleInputRef.current?.focus(), 50);
    }
    setAddingTask(false);
  }

  async function handleCompleteLaunchTask(id: string) {
    await updateTaskStatus(id, 'done');
    const updated = await getLaunchTasks();
    setLaunchTasks(updated);
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

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">
            Welcome back! Here&apos;s your launch overview.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Quick Add
        </Button>
      </div>

      {/* Fix 1: Mobile-only countdown banner ──────────────────────────────────── */}
      {daysUntilLaunch !== null && (
        <div className="lg:hidden mb-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-700 px-4 py-3 flex items-center gap-3 text-white">
          <Rocket className="h-5 w-5 shrink-0 opacity-80" />
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black">{daysUntilLaunch}</span>
            <span className="text-sm text-indigo-200">days until launch</span>
          </div>
          <span className="ml-auto text-xs text-indigo-200">
            {format(launchDate!, 'MMM d')}
          </span>
        </div>
      )}

      {/* ── Fix 2: Clickable stat cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatModal({ filter: 'total', label: 'All Events' })}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Events</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatModal({ filter: 'planned', label: 'Planned Events' })}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Planned</p>
                <p className="text-3xl font-bold text-gray-900">{stats.planned}</p>
              </div>
              <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatModal({ filter: 'in-progress', label: 'In Progress' })}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.inProgress}</p>
              </div>
              <div className="h-10 w-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatModal({ filter: 'done', label: 'Completed Events' })}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Done</p>
                <p className="text-3xl font-bold text-green-600">{stats.done}</p>
              </div>
              <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue — red when > 0 */}
        <Card
          className={cn(
            'transition-shadow',
            stats.overdue > 0 ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
          )}
          onClick={() => stats.overdue > 0 && setStatModal({ filter: 'overdue', label: 'Overdue Events' })}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overdue</p>
                <p className={cn('text-3xl font-bold', stats.overdue > 0 ? 'text-red-600' : 'text-gray-400')}>
                  {stats.overdue}
                </p>
              </div>
              <div className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center',
                stats.overdue > 0 ? 'bg-red-100' : 'bg-gray-100'
              )}>
                <AlertCircle className={cn('h-5 w-5', stats.overdue > 0 ? 'text-red-600' : 'text-gray-400')} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Launch Tasks — scrolls to the section below */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => launchDepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Launch Tasks</p>
                <p className="text-3xl font-bold text-gray-900">{incompleteLaunchTasks}</p>
              </div>
              <div className="h-10 w-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <CheckSquare className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Fix 4: Today's Big Movers — actionable list (plural) ─────────────────── */}
      {todaysBigMovers.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎯</span>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
              Today&apos;s Big Mover{todaysBigMovers.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-2">
            {todaysBigMovers.map((mover) => (
              <div key={mover.id} className="flex items-center gap-3">
                {/* Mark done */}
                <button
                  onClick={() => handleMarkEventDone(mover)}
                  disabled={mover.status === 'done'}
                  className={cn(
                    'h-6 w-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                    mover.status === 'done'
                      ? 'bg-green-500 border-green-500 cursor-default'
                      : 'border-amber-400 hover:border-green-500 hover:bg-green-50'
                  )}
                  title={mover.status === 'done' ? 'Done' : 'Mark as done'}
                >
                  {mover.status === 'done' && <Check className="h-3.5 w-3.5 text-white" />}
                </button>

                <p className={cn(
                  'flex-1 font-bold text-amber-900',
                  mover.status === 'done' && 'line-through text-amber-600 opacity-60'
                )}>
                  {mover.title}
                </p>

                {/* Edit button */}
                <button
                  onClick={() => setEventToEdit(mover)}
                  className="p-1.5 rounded hover:bg-amber-200 text-amber-600 transition-colors"
                  title="Edit event"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Left col (2/3): Fix 3 — Upcoming Events clickable to edit ──────────── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-indigo-600" />
                Upcoming Events (Next 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.upcoming.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">
                  No upcoming events this week. Click &quot;Quick Add&quot; to create one!
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.upcoming.map((event) => {
                    const colors = CATEGORY_COLORS[event.category];
                    return (
                      <button
                        key={event.id}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 hover:border-indigo-200 transition-colors group"
                        onClick={() => setEventToEdit(event)}
                      >
                        <div className={cn('w-2 h-10 rounded-full shrink-0', colors.dot)} />
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'font-medium text-sm text-gray-900 truncate',
                            event.status === 'done' && 'line-through text-gray-400'
                          )}>
                            {event.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(event.event_date + 'T00:00:00'), 'EEE, MMM d')}
                            {event.event_time && ` at ${event.event_time.slice(0, 5)}`}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn('text-xs shrink-0', colors.bg, colors.text)}>
                          {CATEGORY_LABELS[event.category]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs shrink-0',
                            event.priority === 'high'   && 'border-red-200 text-red-600',
                            event.priority === 'medium' && 'border-yellow-200 text-yellow-600',
                            event.priority === 'low'    && 'border-gray-200 text-gray-500'
                          )}
                        >
                          {event.priority}
                        </Badge>
                        <Pencil className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right col (1/3): Launch Countdown + Fix 6 combined Completion Rate ──── */}
        <div>
          <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-0">
            <CardContent className="p-6 text-center">
              <Rocket className="h-10 w-10 mx-auto mb-3 opacity-80" />
              <h3 className="text-lg font-bold mb-1">Launch Countdown</h3>
              {daysUntilLaunch !== null ? (
                <>
                  <p className="text-5xl font-black my-4">{daysUntilLaunch}</p>
                  <p className="text-indigo-200">days until launch</p>
                  <p className="text-sm text-indigo-200 mt-2">
                    {format(launchDate!, 'MMMM d, yyyy')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-indigo-200 text-sm mt-2">
                    Set your launch date in Settings to start the countdown!
                  </p>
                  <a
                    href="/settings"
                    className="inline-block mt-4 px-4 py-2 bg-white/20 rounded-lg text-sm font-medium hover:bg-white/30 transition-colors"
                  >
                    Set Launch Date →
                  </a>
                </>
              )}
            </CardContent>
          </Card>

          {/* Fix 6: Completion rate includes launch tasks */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Completion Rate</h3>
              <p className="text-xs text-gray-400 mb-3">Calendar events + launch tasks</p>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {doneItems} of {totalItems} items completed
                {totalItems > 0 && ` (${completionPct}%)`}
              </p>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* ── Fix 5: Launch Dependencies with auto-focus ref ───────────────────── */}
      <div ref={launchDepsRef}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Launch Dependencies</CardTitle>
          </CardHeader>
          <CardContent>

            {/* Quick-add form */}
            <div className="flex gap-2 mb-4">
              <Input
                ref={taskTitleInputRef}
                placeholder="Add a launch dependency..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddLaunchTask()}
                className="flex-1"
              />
              <Input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="w-40"
              />
              <Button
                onClick={handleAddLaunchTask}
                disabled={!newTaskTitle.trim() || addingTask}
              >
                {addingTask
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Plus className="h-4 w-4 mr-1" />
                }
                Add
              </Button>
            </div>

            {/* Task list */}
            {sortedLaunchTasks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No launch dependencies yet. Add your first one above.
              </p>
            ) : (
              <div>
                {sortedLaunchTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">

                    {/* Checkbox */}
                    <button
                      onClick={() => handleCompleteLaunchTask(task.id)}
                      disabled={task.status === 'done'}
                      className={cn(
                        'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        task.status === 'done'
                          ? 'bg-green-500 border-green-500 cursor-default'
                          : 'border-gray-300 hover:border-indigo-500'
                      )}
                    >
                      {task.status === 'done' && <Check className="h-3 w-3 text-white" />}
                    </button>

                    {/* Title */}
                    <span className={cn(
                      'flex-1 text-sm',
                      task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'
                    )}>
                      {task.title}
                    </span>

                    {/* Due date */}
                    {task.due_date && (
                      <span className={cn(
                        'text-xs font-medium shrink-0',
                        task.status !== 'done' &&
                        isBefore(new Date(task.due_date + 'T00:00:00'), startOfDay(new Date()))
                          ? 'text-red-600'
                          : 'text-gray-400'
                      )}>
                        {task.status !== 'done' &&
                         isBefore(new Date(task.due_date + 'T00:00:00'), startOfDay(new Date()))
                          ? '⚠ '
                          : ''}
                        {format(new Date(task.due_date + 'T00:00:00'), 'MMM d')}
                      </span>
                    )}
                    {!task.due_date && task.status !== 'done' && (
                      <span className="text-xs text-gray-300 shrink-0">No due date</span>
                    )}

                  </div>
                ))}
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}

      {/* Quick-add new calendar event */}
      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleQuickAdd}
        defaultDate={format(new Date(), 'yyyy-MM-dd')}
      />

      {/* Edit event (from upcoming list, big movers banner, or stat modal) */}
      <EventDialog
        open={!!eventToEdit}
        event={eventToEdit}
        onClose={() => setEventToEdit(null)}
        onSave={handleEventUpdate}
        onDelete={handleEventDelete}
      />

      {/* Stat card drill-down modal */}
      <Dialog open={!!statModal} onOpenChange={() => setStatModal(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{statModal?.label ?? ''}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">
            {statModalEvents.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">No events in this category.</p>
            ) : (
              <div className="space-y-2 py-1">
                {statModalEvents.map((event) => {
                  const colors = CATEGORY_COLORS[event.category];
                  return (
                    <button
                      key={event.id}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 hover:border-indigo-200 transition-colors group"
                      onClick={() => {
                        setStatModal(null);
                        setEventToEdit(event);
                      }}
                    >
                      <div className={cn('w-2 h-8 rounded-full shrink-0', colors.dot)} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'font-medium text-sm truncate',
                          event.status === 'done' && 'line-through text-gray-400'
                        )}>
                          {event.title}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(event.event_date + 'T00:00:00'), 'EEE, MMM d')}
                          {event.event_time && ` at ${event.event_time.slice(0, 5)}`}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn('text-xs shrink-0', colors.bg, colors.text)}>
                        {CATEGORY_LABELS[event.category]}
                      </Badge>
                      <Pencil className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
