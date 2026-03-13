'use client';

import { useRouter } from 'next/navigation';
import CountdownTimer from '@/components/dashboard/CountdownTimer';
import ReadinessIndicator from '@/components/dashboard/ReadinessIndicator';
import PriorityTasksList from '@/components/dashboard/PriorityTasksList';
import UpcomingBigMovers from '@/components/dashboard/UpcomingBigMovers';
import { Button } from '@/components/ui/button';
import { useLaunchData } from '@/hooks/useLaunchData';
import { MessageSquare } from 'lucide-react';

export default function LaunchDashboard() {
  const router = useRouter();
  const { readinessPercentage, priorityTasks, bigMoverEvents, loading } = useLaunchData();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Launch Command Centre</h1>
        <p className="text-sm text-slate-400 mt-1">Ice Showers · March 29, 2026</p>
      </div>

      {/* Hero countdown */}
      <CountdownTimer />

      {/* Readiness */}
      <ReadinessIndicator percentage={readinessPercentage} loading={loading} />

      {/* Priority tasks + big movers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PriorityTasksList tasks={priorityTasks} loading={loading} />
        <UpcomingBigMovers events={bigMoverEvents} loading={loading} />
      </div>

      {/* Quick action */}
      <div className="flex justify-end">
        <Button onClick={() => router.push('/agents')} className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Open AI Assistant
        </Button>
      </div>
    </div>
  );
}
