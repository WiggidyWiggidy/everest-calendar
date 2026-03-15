'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarEvent } from '@/types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface UpcomingBigMoversProps {
  events: CalendarEvent[];
  loading: boolean;
}

export default function UpcomingBigMovers({ events, loading }: UpcomingBigMoversProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">
          Big Movers — Next 7 Days
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-400">No big mover events this week.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-800 truncate flex-1">{event.title}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {formatDate(event.event_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
