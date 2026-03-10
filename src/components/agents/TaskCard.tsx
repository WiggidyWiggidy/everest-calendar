'use client';

// ============================================
// TaskCard
// Displays a single task backlog item with priority score,
// Approve button (pending tasks), status dropdown (approved/in-progress/done),
// "Format for Opus" clipboard copy, and Dismiss action.
// ============================================
import { useState } from 'react';
import { TaskBacklog } from '@/types';
import { Button } from '@/components/ui/button';
import { Copy, Check, X, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: TaskBacklog;
  onDismiss: (id: string) => void;
  onApprove: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

// Priority score circle colour
function priorityColor(score: number) {
  if (score >= 8) return 'bg-green-500';
  if (score >= 5) return 'bg-yellow-500';
  return 'bg-red-500';
}

// Status badge colour
function statusClass(status: string) {
  switch (status) {
    case 'pending':     return 'bg-blue-100 text-blue-700';
    case 'approved':    return 'bg-green-100 text-green-700';
    case 'in-progress': return 'bg-amber-100 text-amber-700';
    case 'done':        return 'bg-gray-100 text-gray-500';
    case 'dismissed':   return 'bg-red-100 text-red-500';
    default:            return 'bg-gray-100 text-gray-600';
  }
}

export default function TaskCard({ task, onDismiss, onApprove, onStatusChange }: TaskCardProps) {
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);

  function handleFormatForOpus() {
    const text = `I need an Execution Outline for Claude Code to build the following approved task: ${task.title} - ${task.description}. Review our current database schema and stack context. Generate the Execution Outline following our strict Blueprint Format.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleApprove() {
    setApproved(true);
    setTimeout(() => setApproved(false), 2000);
    onApprove(task.id);
  }

  const isDone = task.status === 'done';
  const isDismissed = task.status === 'dismissed';
  const isPending = task.status === 'pending';
  const isActionable = !isDone && !isDismissed;

  return (
    <div
      className={cn(
        'flex gap-4 p-4 bg-white border rounded-xl shadow-sm hover:border-gray-300 transition-colors',
        isDismissed && 'opacity-60'
      )}
    >
      {/* Priority score circle */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
          priorityColor(task.priority_score)
        )}
      >
        <span className="text-white font-bold text-sm">{task.priority_score}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p
            className={cn(
              'font-semibold text-gray-900 text-base leading-tight',
              isDone && 'line-through text-gray-400'
            )}
          >
            {task.title}
          </p>
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
            {task.category}
          </span>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-3">{task.description}</p>

        {/* Footer row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusClass(task.status))}>
            {task.status}
          </span>

          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {/* Approve button — pending tasks only */}
            {isPending && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleApprove}
                className={cn(
                  'h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50',
                  approved && 'border-green-300'
                )}
              >
                {approved ? (
                  <>
                    <Check className="h-3 w-3 text-green-600" />
                    <span>Approved!</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Approve
                  </>
                )}
              </Button>
            )}

            {/* Status dropdown — non-pending, non-dismissed tasks */}
            {!isPending && !isDismissed && (
              <select
                value={task.status}
                onChange={(e) => onStatusChange(task.id, e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-white text-gray-600 h-7 cursor-pointer"
              >
                <option value="approved">Approved</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            )}

            {/* Format for Opus — hidden when done or dismissed */}
            {isActionable && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleFormatForOpus}
                className="h-7 text-xs gap-1"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-600" />
                    <span className="text-green-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Format for Opus
                  </>
                )}
              </Button>
            )}

            {/* Dismiss — hidden when done or dismissed */}
            {isActionable && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(task.id)}
                className="h-7 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 gap-1"
              >
                <X className="h-3 w-3" />
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
