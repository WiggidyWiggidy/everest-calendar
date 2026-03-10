'use client';

// ============================================
// MemoryPanel
// Left panel showing agent info, system prompt, and memory notes
// ============================================
import { useState } from 'react';
import { Agent, AgentMemory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import MemoryNoteCard from './MemoryNoteCard';
import {
  Brain,
  Plus,
  Settings,
  ChevronUp,
  Trash2,
} from 'lucide-react';

interface MemoryPanelProps {
  agent: Agent;
  memories: AgentMemory[];
  onCreateMemory: (memory: { title: string; content: string }) => void;
  onUpdateMemory: (id: string, updates: { title?: string; content?: string }) => void;
  onDeleteMemory: (id: string) => void;
  onUpdateAgent: (updates: Partial<Agent>) => void;
  onDeleteAgent: () => void;
}

export default function MemoryPanel({
  agent,
  memories,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
  onUpdateAgent,
  onDeleteAgent,
}: MemoryPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editPrompt, setEditPrompt] = useState(agent.system_prompt);
  const [editAutoLearn, setEditAutoLearn] = useState(agent.auto_learn);

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
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Brain className="h-4 w-4" />
            Memory Notes
          </h3>
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
                Add Note
              </>
            )}
          </Button>
        </div>

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
    </div>
  );
}
