'use client';

// ============================================
// AnalystDashboard
// Full-width view rendered when the System Analyst agent is active.
// Shows metrics, filter tabs, task backlog, and prompt settings.
// The "Run Batch Analysis" button posts to /api/process-thoughts (Stage 4).
// ============================================
import { useState, useEffect } from 'react';
import { Agent, TaskBacklog, AnalystConfig } from '@/types';
import { getUnprocessedCount } from '@/lib/thoughts';
import { getTasks, updateTaskStatus } from '@/lib/task-backlog';
import { getAnalystConfig, updateAnalystConfig } from '@/lib/analyst-config';
import TaskCard from './TaskCard';
import PromptSettingsModal from './PromptSettingsModal';
import { cn } from '@/lib/utils';
import {
  Brain,
  CheckCircle,
  ListTodo,
  ClipboardCheck,
  Zap,
  Loader2,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AnalystDashboardProps {
  agent: Agent;
}

const FILTER_TABS = [
  { key: 'pending',     label: 'Pending' },
  { key: 'approved',    label: 'Approved' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done',        label: 'Done' },
  { key: 'dismissed',   label: 'Dismissed' },
  { key: 'all',         label: 'All' },
];

export default function AnalystDashboard({ agent }: AnalystDashboardProps) {
  const [unprocessedCount, setUnprocessedCount] = useState(0);
  const [tasks, setTasks] = useState<TaskBacklog[]>([]);
  const [config, setConfig] = useState<AnalystConfig | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('pending');

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
        // Switch to pending tab to surface the newly created tasks
        setActiveFilter('pending');
      } else {
        alert(data.error || 'Analysis failed. Try again.');
      }
    } catch {
      alert('Analysis failed. Check your connection.');
    } finally {
      setProcessing(false);
    }
  }

  // Dismiss: keeps task in state, changes status to 'dismissed'
  async function handleDismissTask(id: string) {
    const success = await updateTaskStatus(id, 'dismissed');
    if (success) {
      setTasks((prev) =>
        prev.map((t) => t.id === id ? { ...t, status: 'dismissed' as TaskBacklog['status'] } : t)
      );
    }
  }

  // Approve a pending task
  async function handleApproveTask(id: string) {
    const success = await updateTaskStatus(id, 'approved');
    if (success) {
      setTasks((prev) =>
        prev.map((t) => t.id === id ? { ...t, status: 'approved' as TaskBacklog['status'] } : t)
      );
    }
  }

  // Generic status change from the dropdown on approved/in-progress tasks
  async function handleStatusChange(id: string, newStatus: string) {
    const success = await updateTaskStatus(id, newStatus);
    if (success) {
      setTasks((prev) =>
        prev.map((t) => t.id === id ? { ...t, status: newStatus as TaskBacklog['status'] } : t)
      );
    }
  }

  // Save updated analyst prompt
  async function handleSavePrompt(newPrompt: string) {
    const success = await updateAnalystConfig(newPrompt);
    if (success) {
      setConfig((prev) => prev ? { ...prev, master_prompt: newPrompt } : prev);
    }
  }

  // Derived counts for metrics and filter badges
  const pendingCount  = tasks.filter((t) => t.status === 'pending').length;
  const approvedCount = tasks.filter((t) => t.status === 'approved').length;
  const doneCount     = tasks.filter((t) => t.status === 'done').length;

  const filteredTasks = activeFilter === 'all'
    ? tasks
    : tasks.filter((t) => t.status === activeFilter);

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
          {/* Metrics row — 4 cards showing the full pipeline state */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              icon={<Brain className="h-5 w-5 text-amber-600" />}
              value={unprocessedCount}
              label="Unprocessed"
              className="bg-amber-50 border-amber-200"
            />
            <MetricCard
              icon={<ListTodo className="h-5 w-5 text-blue-600" />}
              value={pendingCount}
              label="Pending Review"
              className="bg-blue-50 border-blue-200"
            />
            <MetricCard
              icon={<CheckCircle className="h-5 w-5 text-green-600" />}
              value={approvedCount}
              label="Approved"
              className="bg-green-50 border-green-200"
            />
            <MetricCard
              icon={<ClipboardCheck className="h-5 w-5 text-gray-500" />}
              value={doneCount}
              label="Done"
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
            <h3 className="font-semibold text-gray-800 text-base mb-3">Task Backlog</h3>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 border-b pb-3 mb-4 overflow-x-auto">
              {FILTER_TABS.map((tab) => {
                const count = tab.key === 'all'
                  ? tasks.length
                  : tasks.filter((t) => t.status === tab.key).length;
                const isActive = activeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                      isActive
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    )}
                  >
                    {tab.label}
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded-full',
                      isActive ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-500'
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Task list or empty state */}
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ListTodo className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {activeFilter === 'all' && tasks.length === 0
                    ? 'No tasks yet. Capture some thoughts and run the analysis.'
                    : `No ${activeFilter} tasks.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDismiss={handleDismissTask}
                    onApprove={handleApproveTask}
                    onStatusChange={handleStatusChange}
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
