'use client';

// ============================================
// WeeklyReview — 7-day focus adherence chart
// Shows critical path & feature completion rates per day
// ============================================
import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getWeeklyStats } from '@/lib/supabase/focus';
import { WeeklyFocusStats } from '@/types/focus';
import { cn } from '@/lib/utils';

export default function WeeklyReview() {
  const [stats,   setStats]   = useState<WeeklyFocusStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWeeklyStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            Weekly Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 text-center py-6">
            No data yet — your 7-day adherence metrics will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Compute aggregate stats
  const avgCriticalPct = Math.round(
    stats.reduce((sum, s) => {
      const pct = s.critical_total > 0 ? (s.critical_done / s.critical_total) * 100 : 0;
      return sum + pct;
    }, 0) / stats.length,
  );

  const totalCriticalDone  = stats.reduce((s, d) => s + d.critical_done, 0);
  const totalCriticalTasks = stats.reduce((s, d) => s + d.critical_total, 0);
  const totalFeatureDone   = stats.reduce((s, d) => s + d.feature_done, 0);
  const totalFeatureTasks  = stats.reduce((s, d) => s + d.feature_total, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-indigo-600" />
          Weekly Review
          <span className="ml-auto text-xs font-normal text-gray-400">Last 7 days</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-indigo-50 rounded-lg p-2">
            <p className="text-xl font-black text-indigo-600">{avgCriticalPct}%</p>
            <p className="text-xs text-gray-500">avg critical</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2">
            <p className="text-xl font-black text-green-600">{totalCriticalDone}/{totalCriticalTasks}</p>
            <p className="text-xs text-gray-500">critical tasks</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-2">
            <p className="text-xl font-black text-amber-600">{totalFeatureDone}/{totalFeatureTasks}</p>
            <p className="text-xs text-gray-500">feature tasks</p>
          </div>
        </div>

        {/* Daily bar chart */}
        <div className="space-y-2">
          {stats.map((day) => {
            const criticalPct = day.critical_total > 0
              ? Math.round((day.critical_done / day.critical_total) * 100)
              : 0;
            const featurePct = day.feature_total > 0
              ? Math.round((day.feature_done / day.feature_total) * 100)
              : 0;
            const dayLabel = format(parseISO(day.date), 'EEE');
            const isToday = day.date === format(new Date(), 'yyyy-MM-dd');

            return (
              <div key={day.date} className="flex items-center gap-3">
                <span className={cn(
                  'text-xs w-8 text-right shrink-0',
                  isToday ? 'font-bold text-indigo-600' : 'text-gray-400',
                )}>
                  {dayLabel}
                </span>

                <div className="flex-1 space-y-1">
                  {/* Critical bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${criticalPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">
                      {day.critical_total > 0 ? `${criticalPct}%` : '—'}
                    </span>
                  </div>
                  {/* Feature bar */}
                  {day.feature_total > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${featurePct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{featurePct}%</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-500 pt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-full bg-indigo-500 inline-block" />
            Critical path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-amber-400 inline-block" />
            Feature work
          </span>
        </div>

      </CardContent>
    </Card>
  );
}
