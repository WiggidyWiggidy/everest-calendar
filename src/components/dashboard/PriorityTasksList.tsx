'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TaskBacklog } from '@/types';

const BUILD_STATUS_STYLES: Record<string, string> = {
  queued:    'bg-slate-100 text-slate-600',
  building:  'bg-yellow-100 text-yellow-700',
  pr_raised: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  failed:    'bg-red-100 text-red-700',
};

interface PriorityTasksListProps {
  tasks: TaskBacklog[];
  loading: boolean;
}

export default function PriorityTasksList({ tasks, loading }: PriorityTasksListProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">
          Top Priority Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks in backlog.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-800 truncate flex-1">{task.title}</span>
                {task.build_status ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      BUILD_STATUS_STYLES[task.build_status] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {task.build_status.replace('_', ' ')}
                  </span>
                ) : (
                  <Badge variant="outline" className="text-xs whitespace-nowrap">
                    {task.status}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
