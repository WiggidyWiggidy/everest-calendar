'use client';

// ============================================
// TaskCard
// Displays a single task backlog item with priority score,
// "Format for Opus" clipboard copy, and dismiss action.
// ============================================
import { useState } from 'react';
import { TaskBacklog } from '@/types';
import { Button } from '@/components/ui/button';
import { Copy, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: TaskBacklog;
  onDismiss: (id: string) => void;
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
    case 'in-progress': return 'bg-indigo-100 text-indigo-700';
    case 'done':        return 'bg-gray-100 text-gray-600';
    case 'dismissed':   return 'bg-gray-100 text-gray-400';
    default:            return 'bg-gray-100 text-gray-600';
  }
}

export default function TaskCard({ task, onDismiss }: TaskCardProps) {
  const [copied, setCopied] = useState(false);

  function handleFormatForOpus() {
    const text = `I need an Execution Outline for Claude Code to build the following approved task: ${task.title} - ${task.description}. Review our current database schema and stack context. Generate the Execution Outline following our strict Blueprint Format.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-4 p-4 bg-white border rounded-xl shadow-sm hover:border-gray-300 transition-colors">
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
          <p className="font-semibold text-gray-900 text-base leading-tight">{task.title}</p>
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

          <div className="ml-auto flex items-center gap-1.5">
            {/* Format for Opus */}
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

            {/* Dismiss */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(task.id)}
              className="h-7 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 gap-1"
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
