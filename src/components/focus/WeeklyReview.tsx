'use client';

// ============================================
// WeeklyReview — 7-day focus adherence metrics
// Shows critical path completion rates and
// feature work adherence over the past week
// ============================================
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2 } from 'lucide-react';
import { WeeklyFocusStats } from '@/types/focus';
import { getWeeklyStats } from '@/lib/supabase/focus';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

export default function WeeklyReview() {
  const [stats, setStats]   = useState<WeeklyFocusStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWeeklyStats().then((s) => { setStats(s); setLoading(false); });
  }, []);

  if (loading) return null;

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            Weekly Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 text-center py-6">
            No focus sessions in the past 7 days yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Compute overall adherence
  const totalCritical = stats.reduce((a, s) => a + s.critical_tasks_total, 0);
  const doneCritical  = stats.reduce((a, s) => a + s.critical_tasks_done, 0);
  const adherencePct  = totalCritical > 0 ? Math.round((doneCritical / totalCritical) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            Weekly Review
          </CardTitle>
          <div className="text-right">
            <p className="text-2xl font-bold text-indigo-600">{adherencePct}%</p>
            <p className="text-xs text-gray-400">critical path adherence</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>

        {/* Bar chart */}
        <div className="space-y-3">
          {stats.map((s) => {
            const dayLabel    = format(parseISO(s.date), 'EEE d');
            const critPct     = s.critical_tasks_total > 0
              ? Math.round((s.critical_tasks_done / s.critical_tasks_total) * 100)
              : 0;
            const featPct     = s.tasks_total > 0
              ? Math.round(((s.tasks_done - s.critical_tasks_done) /
                  Math.max(1, s.tasks_total - s.critical_tasks_total)) * 100)
              : 0;

            return (
              <div key={s.date}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-600 w-12">{dayLabel}</p>
                  <p className="text-xs text-gray-400">
                    {s.critical_path_hours}h crit · {s.feature_limit_hours}h feat
                  </p>
                </div>
                <div className="flex gap-1 h-3">
                  {/* Critical path bar */}
                  <div className="flex-1 bg-indigo-100 rounded overflow-hidden">
                    <div
                      className={cn('h-full rounded transition-all', critPct === 100 ? 'bg-indigo-500' : 'bg-indigo-300')}
                      style={{ width: `${critPct}%` }}
                    />
                  </div>
                  {/* Feature bar */}
                  <div className="flex-1 bg-emerald-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded transition-all"
                      style={{ width: `${featPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-4 pt-3 border-t">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-indigo-400" />
            <span className="text-xs text-gray-500">Critical path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-400" />
            <span className="text-xs text-gray-500">Feature work</span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
