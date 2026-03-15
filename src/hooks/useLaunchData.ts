'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TaskBacklog, CalendarEvent } from '@/types';
import { calculateReadinessPercentage } from '@/lib/utils/launch';

interface LaunchData {
  readinessPercentage: number;
  priorityTasks: TaskBacklog[];
  bigMoverEvents: CalendarEvent[];
  loading: boolean;
}

export function useLaunchData(): LaunchData {
  const [data, setData] = useState<LaunchData>({
    readinessPercentage: 0,
    priorityTasks: [],
    bigMoverEvents: [],
    loading: true,
  });

  useEffect(() => {
    async function fetchAll() {
      const supabase = createClient();

      const today = new Date().toISOString().split('T')[0];
      const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [tasksResult, topTasksResult, bigMoversResult] = await Promise.all([
        // All tasks for readiness calculation
        supabase.from('task_backlog').select('*').neq('status', 'dismissed'),
        // Top 5 by priority_score
        supabase
          .from('task_backlog')
          .select('*')
          .neq('status', 'dismissed')
          .order('priority_score', { ascending: false })
          .limit(5),
        // Big mover events in the next 7 days
        supabase
          .from('calendar_events')
          .select('*')
          .eq('is_big_mover', true)
          .gte('event_date', today)
          .lte('event_date', sevenDaysLater)
          .order('event_date', { ascending: true }),
      ]);

      const allTasks: TaskBacklog[] = tasksResult.data || [];
      const priorityTasks: TaskBacklog[] = topTasksResult.data || [];
      const bigMoverEvents: CalendarEvent[] = bigMoversResult.data || [];

      setData({
        readinessPercentage: calculateReadinessPercentage(allTasks),
        priorityTasks,
        bigMoverEvents,
        loading: false,
      });
    }

    fetchAll();
  }, []);

  return data;
}
