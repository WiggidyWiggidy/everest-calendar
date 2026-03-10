'use client';

// ============================================
// AnalystDashboard
// Full-width view rendered when the System Analyst agent is active.
// Shows metrics, task backlog, and prompt settings.
// The "Run Batch Analysis" button posts to /api/process-thoughts (Stage 4).
// ============================================
import { useState, useEffect } from 'react';
import { Agent, TaskBacklog, AnalystConfig } from '@/types';
import { getUnprocessedCount } from '@/lib/thoughts';
import { getTasks, updateTaskStatus } from '@/lib/task-backlog';
import { getAnalystConfig, updateAnalystConfig } from '@/lib/analyst-config';
import TaskCard from './TaskCard';
import PromptSettingsModal from './PromptSettingsModal';
import {
  Brain,
  CheckCircle,
  ListTodo,
  Zap,
  Loader2,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AnalystDashboardProps {
  agent: Agent;
}

export default function AnalystDashboard({ agent }: AnalystDashboardProps) {
  const [unprocessedCount, setUnprocessedCount] = useState(0);
  const [tasks, setTasks] = useState<TaskBacklog[]>([]);
  const [config, setConfig] = useState<AnalystConfig | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Load all data on mount
  useEffect(() => {
    async function load() {
      const [count, allTasks, analystConfig] = await Promise.all([
        getUnprocessedCount(),
        getTasks(),
        getAnalystConfig(),
      ]);
      setUnprocessedCount(count);
      setTasks(allTasks);
      setConfig(analystConfig);
      setLoading(false);
    }
    load();
  }, []);

  // Run the processing engine
  async function handleRunAnalysis() {
    setProcessing(true);
    try {
      const res = await fetch('/api/process-thoughts', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Refetch both metrics after successful processing
        const [count, allTasks] = await Promise.all([
          getUnprocessedCount(),
          getTasks(),
        ]);
        setUnprocessedCount(count);
        setTasks(allTasks);
      } else {
        alert(data.error || 'Analysis failed. Try again.');
      }
    } catch {
      alert('Analysis failed. Check your connection.');
    } finally {
      setProcessing(false);
    }
  }

  // Soft-dismiss a task
  async function handleDismissTask(id: string) {
    const success = await updateTaskStatus(id, 'dismissed');
    if (success) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  }

  // Save updated analyst prompt
  async function handleSavePrompt(newPrompt: string) {
    const success = await updateAnalystConfig(newPrompt);
    if (success) {
      setConfig((prev) => prev ? { ...prev, master_prompt: newPrompt } : prev);
    }
  }

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{agent.icon}</span>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{agent.name}</h2>
            <p className="text-sm text-gray-400">{agent.description}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowPromptModal(true)}
          title="Edit analyst prompt"
          className="text-gray-400 hover:text-gray-700"
        >
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              icon={<Brain className="h-5 w-5 text-amber-600" />}
              value={unprocessedCount}
              label="Unprocessed Thoughts"
              className="bg-amber-50 border-amber-200"
            />
            <MetricCard
              icon={<CheckCircle className="h-5 w-5 text-blue-600" />}
              value={pendingCount}
              label="Pending Tasks"
              className="bg-blue-50 border-blue-200"
            />
            <MetricCard
              icon={<ListTodo className="h-5 w-5 text-gray-500" />}
              value={tasks.length}
              label="Total Tasks"
              className="bg-gray-50 border-gray-200"
            />
          </div>

          {/* Action bar */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleRunAnalysis}
              disabled={processing || unprocessedCount === 0}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analysing…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run Batch Analysis
                </>
              )}
            </Button>
            {unprocessedCount === 0 && !processing && (
              <p className="text-sm text-gray-400">
                No unprocessed thoughts. Use the mic button to capture ideas.
              </p>
            )}
          </div>

          {/* Task backlog */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-gray-800 text-base">Task Backlog</h3>
              {tasks.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                  {tasks.length}
                </span>
              )}
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <ListTodo className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No tasks yet. Capture some thoughts and run the analysis.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDismiss={handleDismissTask}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Prompt settings modal */}
      {config && showPromptModal && (
        <PromptSettingsModal
          open={showPromptModal}
          onClose={() => setShowPromptModal(false)}
          config={config}
          onSave={handleSavePrompt}
        />
      )}
    </div>
  );
}

// ---- Sub-component: Metric card ----
function MetricCard({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
    </div>
  );
}
