'use client';

// ============================================
// Calendar Grid Component
// Monthly view with day cells showing event pills
// ============================================
import { useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from 'date-fns';
import { CalendarEvent, CATEGORY_COLORS } from '@/types';
import { cn } from '@/lib/utils';

interface CalendarGridProps {
  currentMonth: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarGrid({
  currentMonth,
  events,
  onDayClick,
  onEventClick,
}: CalendarGridProps) {
  // Build array of all days visible in the grid (includes padding from prev/next months)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  // Map events by date for quick lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
      const key = event.event_date; // Already 'YYYY-MM-DD'
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [events]);

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="p-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const inCurrentMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <div
              key={dateKey}
              className={cn(
                'min-h-[100px] lg:min-h-[120px] border-b border-r p-1.5 cursor-pointer transition-colors hover:bg-gray-50',
                !inCurrentMonth && 'bg-gray-50/50'
              )}
              onClick={() => onDayClick(day)}
            >
              {/* Day number + X/Y completion ratio */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full',
                    !inCurrentMonth && 'text-gray-300',
                    today && 'bg-indigo-600 text-white',
                    inCurrentMonth && !today && 'text-gray-700'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {dayEvents.filter(e => e.status === 'done').length}/{dayEvents.length}
                  </span>
                )}
              </div>

              {/* Event pills (show up to 3, then "+N more") — big movers sorted first */}
              <div className="space-y-0.5">
                {(() => {
                  const sortedDayEvents = [...dayEvents].sort((a, b) =>
                    (b.is_big_mover ? 1 : 0) - (a.is_big_mover ? 1 : 0)
                  );
                  return (
                    <>
                      {sortedDayEvents.slice(0, 3).map((event) => {
                        const colors = CATEGORY_COLORS[event.category];
                        return (
                          <button
                            key={event.id}
                            className={cn(
                              'w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium transition-opacity',
                              colors.bg,
                              colors.text,
                              event.status === 'done'
                                ? 'opacity-40 line-through'
                                : 'opacity-100',
                              event.is_big_mover
                                ? 'border-l-[3px] border-amber-500 pl-1'
                                : 'border-l-0'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick(event);
                            }}
                          >
                            {event.event_time && (
                              <span className="opacity-60 mr-0.5">
                                {event.event_time.slice(0, 5)}
                              </span>
                            )}
                            {event.is_big_mover && (
                              <span className="mr-0.5">🎯</span>
                            )}
                            {event.title}
                            {event.status === 'done' && (
                              <span className="ml-1 opacity-60">✓</span>
                            )}
                          </button>
                        );
                      })}
                      {sortedDayEvents.length > 3 && (
                        <p className="text-xs text-gray-400 px-1">
                          +{sortedDayEvents.length - 3} more
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
