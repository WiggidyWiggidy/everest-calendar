'use client';

// ============================================
// Week View Component
// Shows 7 days in a vertical list with full event details
// ============================================
import {
  startOfWeek,
  addDays,
  format,
  isToday,
} from 'date-fns';
import { CalendarEvent, CATEGORY_COLORS, CATEGORY_LABELS } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function WeekView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
}: WeekViewProps) {
  // Build 7 days starting from the week containing currentDate
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group events by date
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach((event) => {
    if (!eventsByDate[event.event_date]) eventsByDate[event.event_date] = [];
    eventsByDate[event.event_date].push(event);
  });

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {weekDays.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDate[dateKey] || [];
        const today = isToday(day);

        return (
          <div
            key={dateKey}
            className={cn(
              'border-b last:border-b-0 p-4 cursor-pointer hover:bg-gray-50 transition-colors',
              today && 'bg-indigo-50/50'
            )}
            onClick={() => onDayClick(day)}
          >
            {/* Day header */}
            <div className="flex items-center gap-3 mb-2">
              <span
                className={cn(
                  'text-2xl font-bold',
                  today ? 'text-indigo-600' : 'text-gray-900'
                )}
              >
                {format(day, 'd')}
              </span>
              <div>
                <p className={cn('text-sm font-medium', today ? 'text-indigo-600' : 'text-gray-600')}>
                  {format(day, 'EEEE')}
                </p>
                <p className="text-xs text-gray-400">{format(day, 'MMMM yyyy')}</p>
              </div>
              {today && (
                <Badge variant="secondary" className="ml-auto bg-indigo-100 text-indigo-700">
                  Today
                </Badge>
              )}
            </div>

            {/* Events for this day */}
            {dayEvents.length > 0 ? (
              <div className="space-y-2 ml-10">
                {dayEvents.map((event) => {
                  const colors = CATEGORY_COLORS[event.category];
                  return (
                    <button
                      key={event.id}
                      className={cn(
                        'w-full text-left p-2 rounded-lg border transition-colors hover:shadow-sm',
                        event.status === 'done' && 'opacity-60'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', colors.dot)} />
                        <span className={cn('font-medium text-sm', event.status === 'done' && 'line-through')}>
                          {event.title}
                        </span>
                        <Badge variant="outline" className={cn('text-xs ml-auto', colors.bg, colors.text)}>
                          {CATEGORY_LABELS[event.category]}
                        </Badge>
                      </div>
                      {event.event_time && (
                        <p className="text-xs text-gray-400 ml-4 mt-0.5">
                          {event.event_time.slice(0, 5)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-300 ml-10">No events</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
