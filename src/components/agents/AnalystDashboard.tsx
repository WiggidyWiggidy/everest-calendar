'use client';

// ============================================
// AnalystDashboard
// Full-width view rendered when the System Analyst agent is active.
// Shows metrics, tabbed task backlog (All / Business / Build Queue),
// and prompt settings.
// The "Run Batch Analysis" button posts to /api/process-thoughts (Stage 4).
// Build tasks show a "Generate Outline" button that calls /api/generate-outline.
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
  Code2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type TabKey = 'all' | 'business' | 'build';

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
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [generatingOutlineId, setGeneratingOutlineId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
        const [count, allTasks] = await Promise.all([getUnprocessedCount(), getTasks()]);
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

  // Generate (or regenerate) an execution outline for a build task
  async function handleGenerateOutline(taskId: string) {
    setGeneratingOutlineId(taskId);
    try {
      const res = await fetch('/api/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      });
      const data = await res.json();
      if (data.success) {
        setTasks((prev) =>
          prev.map((t) => t.id === taskId ? { ...t, execution_outline: data.outline } : t)
        );
      } else {
        alert(data.error || 'Failed to generate outline. Try again.');
      }
    } catch {
      alert('Failed to generate outline. Check your connection.');
    } finally {
      setGeneratingOutlineId(null);
    }
  }

  // Copy outline to clipboard with brief visual feedback
  function handleCopyOutline(taskId: string, outline: string) {
    navigator.clipboard.writeText(outline);
    setCopiedId(taskId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Derived lists
  const businessTasks = tasks.filter((t) => !t.task_type || t.task_type === 'business');
  const buildTasks    = tasks.filter((t) => t.task_type === 'build');
  const pendingCount  = tasks.filter((t) => t.status === 'pending').length;

  const displayTasks =
    activeTab === 'all'      ? tasks :
    activeTab === 'business' ? businessTasks :
    buildTasks;

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              value={businessTasks.length}
              label="Business Tasks"
              className="bg-gray-50 border-gray-200"
            />
            <MetricCard
              icon={<Code2 className="h-5 w-5 text-indigo-600" />}
              value={buildTasks.length}
              label="Build Queue"
              className="bg-indigo-50 border-indigo-200"
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing…</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Run Batch Analysis</>
              )}
            </Button>
            {unprocessedCount === 0 && !processing && (
              <p className="text-sm text-gray-400">
                No unprocessed thoughts. Use the command bar to capture ideas.
              </p>
            )}
          </div>

          {/* Task backlog */}
          <div>
            {/* Header + tab pills */}
            <div className="flex items-center justify-between mb-4 gap-3">
              <h3 className="font-semibold text-gray-800 text-base shrink-0">Task Backlog</h3>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {(['all', 'business', 'build'] as TabKey[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap',
                      activeTab === tab
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {tab === 'all' ? `All (${tasks.length})` : tab === 'business' ? `Business (${businessTasks.length})` : `Build Queue (${buildTasks.length})`}
                  </button>
                ))}
              </div>
            </div>

            {displayTasks.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <ListTodo className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {activeTab === 'build'
                    ? 'No build tasks yet. Use /feature in the command bar to log one.'
                    : 'No tasks yet. Capture some thoughts and run the analysis.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayTasks.map((task) =>
                  task.task_type === 'build' ? (
                    <BuildTaskCard
                      key={task.id}
                      task={task}
                      onDismiss={handleDismissTask}
                      onGenerateOutline={handleGenerateOutline}
                      onCopyOutline={handleCopyOutline}
                      generatingOutlineId={generatingOutlineId}
                      copiedId={copiedId}
                    />
                  ) : (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDismiss={handleDismissTask}
                    />
                  )
                )}
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

// ---- Sub-component: Build task card ----
function BuildTaskCard({
  task,
  onDismiss,
  onGenerateOutline,
  onCopyOutline,
  generatingOutlineId,
  copiedId,
}: {
  task: TaskBacklog;
  onDismiss: (id: string) => void;
  onGenerateOutline: (id: string) => void;
  onCopyOutline: (id: string, outline: string) => void;
  generatingOutlineId: string | null;
  copiedId: string | null;
}) {
  const isGenerating = generatingOutlineId === task.id;
  const isCopied     = copiedId === task.id;

  return (
    <div className="bg-white rounded-xl border border-indigo-100 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              Build
            </span>
            <span className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              task.priority_score >= 8
                ? 'bg-red-100 text-red-700'
                : task.priority_score >= 5
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-600'
            )}>
              P{task.priority_score}
            </span>
            {task.source && (
              <span className="text-[10px] text-gray-400 capitalize">{task.source}</span>
            )}
          </div>
          {task.build_status && (
            <div className="mt-1 mb-1 flex items-center gap-2 flex-wrap">
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                task.build_status === 'queued'    && 'bg-yellow-50 text-yellow-700',
                task.build_status === 'building'  && 'bg-blue-50 text-blue-700 animate-pulse',
                task.build_status === 'pr_raised' && 'bg-purple-50 text-purple-700',
                task.build_status === 'approved'  && 'bg-green-50 text-green-700',
                task.build_status === 'rejected'  && 'bg-red-50 text-red-700',
                task.build_status === 'failed'    && 'bg-red-50 text-red-700',
              )}>
                {task.build_status === 'queued'    && '⏳ Queued for build'}
                {task.build_status === 'building'  && '⚙️ Building...'}
                {task.build_status === 'pr_raised' && '🔀 PR raised — awaiting review'}
                {task.build_status === 'approved'  && '✅ Merged to main'}
                {task.build_status === 'rejected'  && '✗ Rejected'}
                {task.build_status === 'failed'    && '⚠️ Build failed'}
              </span>
              {task.pr_url && task.build_status === 'pr_raised' && (
                <a
                  href={task.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View PR &amp; Preview
                </a>
              )}
            </div>
          )}
          <h4 className="font-semibold text-gray-900 text-sm leading-snug">{task.title}</h4>
        </div>
        <button
          onClick={() => onDismiss(task.id)}
          className="text-xs text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
        >
          Dismiss
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
      )}

      {task.build_context && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 border border-gray-100">
          <span className="font-medium text-gray-700">Context: </span>
          {task.build_context}
        </div>
      )}

      {/* Execution outline */}
      {task.execution_outline ? (
        <div className="space-y-2">
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 max-h-52 overflow-y-auto">
            <pre className="text-xs text-indigo-900 whitespace-pre-wrap font-mono leading-relaxed">
              {task.execution_outline}
            </pre>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onCopyOutline(task.id, task.execution_outline!)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
            >
              {isCopied ? (
                <><Check className="w-3 h-3" />Copied!</>
              ) : (
                <><Copy className="w-3 h-3" />Copy Outline</>
              )}
            </button>
            <button
              onClick={() => onGenerateOutline(task.id)}
              disabled={isGenerating}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isGenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onGenerateOutline(task.id)}
          disabled={isGenerating}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
        >
          {isGenerating ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Generating outline…</>
          ) : (
            <><Zap className="w-3 h-3" />Generate Outline</>
          )}
        </button>
      )}
    </div>
  );
}
