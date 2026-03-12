'use client';

// ============================================
// DayPanel
// Right-side slide panel showing all events for a selected day.
// Supports one-tap completion, Big Mover pinning, and inline event creation.
// ============================================
import { format, differenceInDays } from 'date-fns';
import { X, Plus, Check, Pencil } from 'lucide-react';
import { CalendarEvent, EventFormData, CATEGORY_COLORS, CATEGORY_LABELS } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DayPanelProps {
  date: Date;
  events: CalendarEvent[];
  launchDate: Date | null;
  onClose: () => void;
  onUpdateEvent: (id: string, data: EventFormData) => Promise<void>;
  onEditEvent: (event: CalendarEvent) => void;
  onAddEvent: (defaultDate: string) => void;
}

// ── EventRow ─────────────────────────────────────────────────────────────────
function EventRow({
  event,
  onToggle,
  onEdit,
  highlighted,
}: {
  event: CalendarEvent;
  onToggle: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  highlighted?: boolean;
}) {
  const colors = CATEGORY_COLORS[event.category];
  const isDone = event.status === 'done';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border mb-2 group transition-colors',
        isDone
          ? 'bg-green-50 border-green-100 opacity-70'
          : highlighted
          ? 'bg-amber-50 border-amber-200 border-l-4 border-l-amber-400'
          : 'border-gray-100 hover:border-indigo-200 hover:bg-gray-50'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(event)}
        className={cn(
          'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          isDone
            ? 'bg-green-500 border-green-500'
            : 'border-gray-300 hover:border-indigo-500'
        )}
        title={isDone ? 'Mark as planned' : 'Mark as done'}
      >
        {isDone && <Check className="h-3 w-3 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium truncate',
          isDone ? 'line-through text-gray-400' : 'text-gray-900'
        )}>
          {event.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {event.event_time && (
            <span className="text-xs text-gray-400">{event.event_time.slice(0, 5)}</span>
          )}
          <Badge
            variant="outline"
            className={cn('text-xs px-1.5 py-0', colors.bg, colors.text)}
          >
            {CATEGORY_LABELS[event.category]}
          </Badge>
        </div>
      </div>

      {/* Priority dot */}
      <div className={cn(
        'w-2 h-2 rounded-full shrink-0',
        event.priority === 'high'   ? 'bg-red-500'    :
        event.priority === 'medium' ? 'bg-amber-400'  : 'bg-gray-300'
      )} />

      {/* Edit button (visible on hover) */}
      <button
        onClick={() => onEdit(event)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200"
        title="Edit event"
      >
        <Pencil className="h-3.5 w-3.5 text-gray-500" />
      </button>
    </div>
  );
}

// ── DayPanel ──────────────────────────────────────────────────────────────────
export default function DayPanel({
  date,
  events,
  launchDate,
  onClose,
  onUpdateEvent,
  onEditEvent,
  onAddEvent,
}: DayPanelProps) {
  const dateKey = format(date, 'yyyy-MM-dd');

  // Filter to this day and sort: Big Movers first, then by time, then untimed last
  const dayEvents = events
    .filter((e) => e.event_date === dateKey)
    .sort((a, b) => {
      if (a.is_big_mover && !b.is_big_mover) return -1;
      if (!a.is_big_mover && b.is_big_mover) return 1;
      if (a.event_time && b.event_time) return a.event_time.localeCompare(b.event_time);
      if (a.event_time && !b.event_time) return -1;
      if (!a.event_time && b.event_time) return 1;
      return 0;
    });

  const bigMovers = dayEvents.filter((e) => e.is_big_mover);
  const regular   = dayEvents.filter((e) => !e.is_big_mover);

  // Days until launch badge
  const daysToLaunch = launchDate ? differenceInDays(launchDate, date) : null;

  async function handleToggleComplete(event: CalendarEvent) {
    const newStatus = event.status === 'done' ? 'planned' : 'done';
    await onUpdateEvent(event.id, {
      title:        event.title,
      description:  event.description || '',
      event_date:   event.event_date,
      event_time:   event.event_time || '',
      category:     event.category,
      priority:     event.priority,
      status:       newStatus,
      is_big_mover: event.is_big_mover ?? false,
    });
  }

  return (
    <>
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-2xl border-l z-50 flex flex-col animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {format(date, 'EEEE, MMMM d')}
            </h2>
            {daysToLaunch !== null && (
              <span className={cn(
                'inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full',
                daysToLaunch > 3
                  ? 'bg-indigo-100 text-indigo-700'
                  : daysToLaunch >= 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              )}>
                {daysToLaunch >= 0
                  ? `${daysToLaunch} days to launch`
                  : `${Math.abs(daysToLaunch)} days past launch`}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0 mt-0.5"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Big Movers section */}
          {bigMovers.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                🎯 Big Movers
              </p>
              {bigMovers.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onToggle={handleToggleComplete}
                  onEdit={onEditEvent}
                  highlighted
                />
              ))}
            </div>
          )}

          {/* Schedule section */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Schedule
            </p>
            {regular.length === 0 && bigMovers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">
                Nothing scheduled. Add an event below.
              </p>
            ) : regular.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No other events.</p>
            ) : (
              regular.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onToggle={handleToggleComplete}
                  onEdit={onEditEvent}
                />
              ))
            )}
          </div>
        </div>

        {/* Footer — Add Event */}
        <div className="px-5 py-4 border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onAddEvent(dateKey)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        </div>

      </div>
    </>
  );
}
