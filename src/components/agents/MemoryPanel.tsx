'use client';

// ============================================
// MemoryPanel
// Left panel showing agent info, system prompt, and memory notes.
// Includes the Memory Optimiser button (runs Claude to clean up notes).
// ============================================
import { useState } from 'react';
import { Agent, AgentMemory, OptimisedNote, OptimiseResult } from '@/types';
import { archiveAllOptimisableMemories, createMemory } from '@/lib/memories';
import { updateAgent } from '@/lib/agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import MemoryNoteCard from './MemoryNoteCard';
import OptimiseMemoryModal from './OptimiseMemoryModal';
import {
  Brain,
  Plus,
  Settings,
  ChevronUp,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react';

interface MemoryPanelProps {
  agent: Agent;
  memories: AgentMemory[];
  onCreateMemory: (memory: { title: string; content: string }) => void;
  onUpdateMemory: (id: string, updates: { title?: string; content?: string }) => void;
  onDeleteMemory: (id: string) => void;
  onUpdateAgent: (updates: Partial<Agent>) => void;
  onDeleteAgent: () => void;
  // Called after optimiser applies changes so parent can reload the list
  onMemoriesReplaced: () => void;
}

export default function MemoryPanel({
  agent,
  memories,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
  onUpdateAgent,
  onDeleteAgent,
  onMemoriesReplaced,
}: MemoryPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editPrompt, setEditPrompt] = useState(agent.system_prompt);
  const [editAutoLearn, setEditAutoLearn] = useState(agent.auto_learn);

  // Optimiser state
  const [optimising, setOptimising] = useState(false);
  const [optimiseResult, setOptimiseResult] = useState<OptimiseResult | null>(null);
  const [optimiseError, setOptimiseError] = useState<string | null>(null);

  // Only manual + auto notes can be optimised (not system_prompt type)
  const optimisableCount = memories.filter(
    (m) => m.memory_type === 'manual' || m.memory_type === 'auto'
  ).length;
  const tooFewToOptimise = optimisableCount < 3;

  function handleAddMemory() {
    if (!newTitle.trim() || !newContent.trim()) return;
    onCreateMemory({ title: newTitle.trim(), content: newContent.trim() });
    setNewTitle('');
    setNewContent('');
    setShowAddForm(false);
  }

  function handleSaveSettings() {
    onUpdateAgent({
      name: editName,
      system_prompt: editPrompt,
      auto_learn: editAutoLearn,
    });
    setShowSettings(false);
  }

  // Run the memory optimiser API
  async function handleOptimise() {
    setOptimising(true);
    setOptimiseError(null);

    try {
      const response = await fetch('/api/agents/optimise-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOptimiseError(data.error || 'Optimisation failed. Please try again.');
      } else {
        setOptimiseResult(data as OptimiseResult);
      }
    } catch {
      setOptimiseError('Network error. Please try again.');
    } finally {
      setOptimising(false);
    }
  }

  // Apply the optimised notes: archive old ones, insert new ones, stamp agent
  async function handleApplyOptimisation(optimisedNotes: OptimisedNote[]) {
    // 1. Soft-archive all current manual + auto memories
    await archiveAllOptimisableMemories(agent.id);

    // 2. Insert the optimised set
    for (const note of optimisedNotes) {
      await createMemory(agent.id, {
        title: note.title,
        content: note.content,
        memory_type: 'manual',
      });
    }

    // 3. Stamp the agent with last_optimised_at
    await updateAgent(agent.id, {
      last_optimised_at: new Date().toISOString(),
    });

    // 4. Tell parent to reload the memory list
    onMemoriesReplaced();
    setOptimiseResult(null);
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r">
      {/* Agent header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agent.icon}</span>
            <div>
              <h2 className="font-semibold text-gray-900">{agent.name}</h2>
              <p className="text-xs text-gray-500">{memories.length} memories</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Agent settings (collapsible) */}
        {showSettings && (
          <div className="mt-3 pt-3 border-t space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">System Prompt</label>
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={4}
                className="text-xs font-mono resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Use {'{memory_notes}'} to inject memories into the prompt.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Auto-learn from conversations</label>
              <button
                onClick={() => setEditAutoLearn(!editAutoLearn)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  editAutoLearn ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    editAutoLearn ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveSettings} className="flex-1">
                Save Settings
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onDeleteAgent}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Memory notes */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Toolbar row */}
        <div className="flex items-center justify-between px-4 py-3 gap-1">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 shrink-0">
            <Brain className="h-4 w-4" />
            Memory Notes
          </h3>
          <div className="flex items-center gap-1">
            {/* Optimise button */}
            <Button
              variant="ghost"
              size="sm"
              disabled={optimising || tooFewToOptimise}
              onClick={handleOptimise}
              title={
                tooFewToOptimise
                  ? `Need at least 3 notes to optimise (you have ${optimisableCount})`
                  : 'Run Claude to clean up your memory notes'
              }
              className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 disabled:opacity-40"
            >
              {optimising ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Optimising…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Optimise
                </>
              )}
            </Button>

            {/* Add note button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-indigo-600 hover:text-indigo-700"
            >
              {showAddForm ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Optimise error */}
        {optimiseError && (
          <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            {optimiseError}
          </div>
        )}

        {/* Too few notes warning */}
        {tooFewToOptimise && optimisableCount > 0 && (
          <div className="mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-600">
            Add at least {3 - optimisableCount} more note{3 - optimisableCount !== 1 ? 's' : ''} to unlock the optimiser.
          </div>
        )}

        {/* Last optimised badge */}
        {agent.last_optimised_at && (
          <div className="mx-4 mb-2">
            <p className="text-xs text-gray-400">
              Last optimised:{' '}
              {new Date(agent.last_optimised_at).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        )}

        {/* Add memory form */}
        {showAddForm && (
          <div className="px-4 pb-3 space-y-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Memory title"
              className="text-sm"
            />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="What should the agent remember? (markdown)"
              rows={3}
              className="text-sm resize-none"
            />
            <Button size="sm" onClick={handleAddMemory} disabled={!newTitle.trim() || !newContent.trim()}>
              <Plus className="h-3 w-3 mr-1" />
              Add Memory
            </Button>
            <Separator />
          </div>
        )}

        {/* Memory list */}
        <ScrollArea className="flex-1 px-4 pb-4">
          {memories.length === 0 ? (
            <div className="text-center py-8">
              <Brain className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">
                No memories yet. Add notes manually or chat to auto-learn.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((memory) => (
                <MemoryNoteCard
                  key={memory.id}
                  memory={memory}
                  onUpdate={onUpdateMemory}
                  onDelete={onDeleteMemory}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Optimise preview modal */}
      {optimiseResult && (
        <OptimiseMemoryModal
          open={!!optimiseResult}
          onOpenChange={(open) => { if (!open) setOptimiseResult(null); }}
          result={optimiseResult}
          onApply={handleApplyOptimisation}
        />
      )}
    </div>
  );
}
