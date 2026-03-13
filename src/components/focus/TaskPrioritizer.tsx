'use client';

// ============================================
// TaskPrioritizer — drag-and-drop task ranking
// Uses react-beautiful-dnd to let the user sort
// tasks by launch criticality
// ============================================
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Plus, Trash2, Check, ListChecks } from 'lucide-react';
import { FocusTask } from '@/types/focus';
import { cn } from '@/lib/utils';

interface Props {
  tasks: FocusTask[];
  sessionActive: boolean;
  onAdd: (
    title: string,
    description: string,
    isCriticalPath: boolean,
    estimatedMinutes: number
  ) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (reordered: FocusTask[]) => void;
}

export default function TaskPrioritizer({
  tasks,
  sessionActive,
  onAdd,
  onToggle,
  onRemove,
  onReorder,
}: Props) {
  const [title, setTitle]           = useState('');
  const [isCritical, setIsCritical] = useState(true);
  const [minutes, setMinutes]       = useState(30);
  const [showForm, setShowForm]     = useState(false);

  function handleAdd() {
    if (!title.trim()) return;
    onAdd(title, '', isCritical, minutes);
    setTitle('');
    setShowForm(false);
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(tasks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorder(reordered);
  }

  const criticalTasks = tasks.filter((t) => t.is_critical_path);
  const featureTasks  = tasks.filter((t) => !t.is_critical_path);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-indigo-500" />
            Today&apos;s Priority Tasks
          </CardTitle>
          {sessionActive && (
            <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Task
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>

        {/* Add task form */}
        {showForm && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border space-y-2">
            <Input
              placeholder="Task title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCritical}
                  onChange={(e) => setIsCritical(e.target.checked)}
                  className="accent-indigo-600"
                />
                Critical path
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-500">Est:</span>
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded px-2 py-1"
                >
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>{m}m</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={!title.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {tasks.length === 0 && !showForm && (
          <p className="text-sm text-gray-400 text-center py-8">
            {sessionActive
              ? 'No tasks yet. Add your first task above.'
              : 'Start your day in Morning Allocation to add tasks.'}
          </p>
        )}

        <DragDropContext onDragEnd={handleDragEnd}>
          {/* Critical path tasks */}
          {criticalTasks.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">
                Critical Path
              </p>
              <Droppable droppableId="critical">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {criticalTasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        index={index}
                        onToggle={onToggle}
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
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                Feature Work
              </p>
              <Droppable droppableId="feature">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {featureTasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        index={index}
                        onToggle={onToggle}
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

      </CardContent>
    </Card>
  );
}

// ── Task row sub-component ────────────────────────────────────────────────────

function TaskRow({
  task,
  index,
  onToggle,
  onRemove,
}: {
  task: FocusTask;
  index: number;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const done = task.status === 'done';

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
            snapshot.isDragging
              ? 'bg-indigo-50 border-indigo-300 shadow-md'
              : done
              ? 'bg-gray-50 border-gray-100 opacity-60'
              : 'bg-white border-gray-200 hover:border-indigo-200'
          )}
        >
          {/* Drag handle */}
          <span {...provided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab">
            <GripVertical className="h-4 w-4" />
          </span>

          {/* Checkbox */}
          <button
            onClick={() => onToggle(task.id)}
            className={cn(
              'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
              done
                ? 'bg-green-500 border-green-500'
                : task.is_critical_path
                ? 'border-indigo-400 hover:border-indigo-600'
                : 'border-gray-300 hover:border-emerald-500'
            )}
          >
            {done && <Check className="h-3 w-3 text-white" />}
          </button>

          {/* Title */}
          <span className={cn('flex-1 text-sm', done && 'line-through text-gray-400')}>
            {task.title}
          </span>

          {/* Estimated time badge */}
          <Badge variant="outline" className="text-xs shrink-0 text-gray-400">
            {task.estimated_minutes}m
          </Badge>

          {/* Remove */}
          <button
            onClick={() => onRemove(task.id)}
            className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </Draggable>
  );
}
