import { TaskBacklog } from '@/types';

// Returns completion percentage based on build_status values.
// Completed = pr_raised or done. Total = all non-null statuses.
export function calculateReadinessPercentage(tasks: TaskBacklog[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(
    (t) => t.build_status === 'pr_raised' || t.build_status === 'approved' || t.status === 'done'
  ).length;
  return Math.round((completed / tasks.length) * 100);
}
