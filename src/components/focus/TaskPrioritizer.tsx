'use client';

// ============================================
// TaskPrioritizer — drag-and-drop ranked task list
// Uses @hello-pangea/dnd (React 18-compatible fork of react-beautiful-dnd)
// ============================================
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  GripVertical,
  Plus,
  Check,
  Trash2,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FocusTask, TaskPriority } from '@/types/focus';
import { cn } from '@/lib/utils';

interface Props {
  tasks: FocusTask[];
  sessionReady: boolean;
  onReorder: (priorities: TaskPriority[]) => Promise<void>;
  onAdd: (
    title: string,
    description: string | null,
    isCritical: boolean,
    estimatedMinutes: number | null,
  ) => Promise<void>;
  onComplete: (taskId: string) => Promise<void>;
  onRemove: (taskId: string) => Promise<void>;
  onNonCriticalAttempt?: () => void;
  criticalPathActive?: boolean;
}

export default function TaskPrioritizer({
  tasks,
  sessionReady,
  onReorder,
  onAdd,
  onComplete,
  onRemove,
  onNonCriticalAttempt,
  criticalPathActive = false,
}: Props) {
  const [newTitle,      setNewTitle]      = useState('');
  const [isCritical,    setIsCritical]    = useState(true);
  const [estMinutes,    setEstMinutes]    = useState('');
  const [adding,        setAdding]        = useState(false);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const reordered = Array.from(tasks);
    const [moved]   = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    const priorities: TaskPriority[] = reordered.map((t, i) => ({
      task_id: t.id,
      priority_order: i,
    }));
    onReorder(priorities);
  }

  async function handleAdd() {
    if (!newTitle.trim()) return;

    // If timer is in critical-path mode and user tries to add a non-critical task, warn them
    if (criticalPathActive && !isCritical && onNonCriticalAttempt) {
      onNonCriticalAttempt();
      return;
    }

    setAdding(true);
    await onAdd(
      newTitle.trim(),
      null,
      isCritical,
      estMinutes ? parseInt(estMinutes, 10) : null,
    );
    setNewTitle('');
    setEstMinutes('');
    setAdding(false);
  }

  const criticalTasks = tasks.filter((t) => t.is_critical_path);
  const featureTasks  = tasks.filter((t) => !t.is_critical_path);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          Today&apos;s Tasks
          <span className="ml-auto text-xs font-normal text-gray-400">
            {tasks.filter((t) => t.status === 'done').length}/{tasks.length} done
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">

        {!sessionReady ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Set your morning allocation above to unlock the task list.
          </p>
        ) : (
          <>
            {/* Add task form */}
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <Input
                placeholder="Add a task..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1 min-w-0"
              />
              <Input
                type="number"
                placeholder="min"
                value={estMinutes}
                onChange={(e) => setEstMinutes(e.target.value)}
                className="w-20 shrink-0"
                min={5}
                max={480}
              />
              {/* Toggle critical / feature */}
              <button
                onClick={() => setIsCritical((p) => !p)}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium border transition-colors shrink-0',
                  isCritical
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-amber-100 border-amber-300 text-amber-700',
                )}
                title={isCritical ? 'Critical path' : 'Feature work'}
              >
                {isCritical ? <Zap className="h-3.5 w-3.5" /> : <span>✨</span>}
              </button>
              <Button size="sm" onClick={handleAdd} disabled={!newTitle.trim() || adding} className="shrink-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No tasks yet — add your #1 critical path task above.
              </p>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                {/* Critical path tasks */}
                {criticalTasks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Critical Path
                    </p>
                    <Droppable droppableId="critical">
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="space-y-1"
                        >
                          {criticalTasks.map((task, index) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              index={index}
                              onComplete={onComplete}
                              onRemove={onRemove}
                            />
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )}

                {/* Feature tasks */}
                {featureTasks.length > 0 && (
                  <div className={cn(criticalTasks.length > 0 && 'mt-3')}>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <span>✨</span> Feature Work
                    </p>
                    <Droppable droppableId="feature">
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="space-y-1"
                        >
                          {featureTasks.map((task, index) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              index={index}
                              onComplete={onComplete}
                              onRemove={onRemove}
                            />
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )}
              </DragDropContext>
            )}
          </>
        )}

      </CardContent>
    </Card>
  );
}

// ─── Individual task row ──────────────────────────────────────────────────────

interface TaskRowProps {
  task: FocusTask;
  index: number;
  onComplete: (id: string) => Promise<void>;
  onRemove:   (id: string) => Promise<void>;
}

function TaskRow({ task, index, onComplete, onRemove }: TaskRowProps) {
  const done = task.status === 'done';

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={done}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'flex items-center gap-2 p-2.5 rounded-lg border transition-colors group',
            done
              ? 'bg-gray-50 border-gray-100 opacity-60'
              : snapshot.isDragging
                ? 'bg-indigo-50 border-indigo-300 shadow-md'
                : 'bg-white border-gray-100 hover:border-gray-200',
          )}
        >
          {/* Drag handle */}
          <div
            {...provided.dragHandleProps}
            className={cn(
              'text-gray-300 cursor-grab active:cursor-grabbing shrink-0',
              done && 'invisible',
            )}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Complete checkbox */}
          <button
            onClick={() => !done && onComplete(task.id)}
            disabled={done}
            className={cn(
              'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
              done
                ? 'bg-green-500 border-green-500 cursor-default'
                : task.is_critical_path
                  ? 'border-indigo-300 hover:border-indigo-500'
                  : 'border-amber-300 hover:border-amber-500',
            )}
          >
            {done && <Check className="h-3 w-3 text-white" />}
          </button>

          {/* Title */}
          <span className={cn(
            'flex-1 text-sm',
            done ? 'line-through text-gray-400' : 'text-gray-800',
          )}>
            {task.title}
          </span>

          {/* Estimated minutes */}
          {task.estimated_minutes && !done && (
            <Badge variant="outline" className="text-xs shrink-0 text-gray-400 border-gray-200">
              {task.estimated_minutes}m
            </Badge>
          )}

          {/* Remove */}
          <button
            onClick={() => onRemove(task.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-gray-300 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </Draggable>
  );
}
