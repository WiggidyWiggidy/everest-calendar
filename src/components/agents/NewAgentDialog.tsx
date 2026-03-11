'use client';

// ============================================
// NewAgentDialog
// Modal dialog for creating a new agent
// ============================================
import { useState } from 'react';
import { DEFAULT_AGENT_PROMPT } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (agent: {
    name: string;
    description?: string;
    icon?: string;
    system_prompt: string;
    auto_learn?: boolean;
  }) => void;
}

const ICON_OPTIONS = ['🤖', '🧠', '🚀', '📊', '💡', '🎯', '📝', '🔬'];

export default function NewAgentDialog({ open, onOpenChange, onCreate }: NewAgentDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🤖');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_AGENT_PROMPT);
  const [autoLearn, setAutoLearn] = useState(true);

  function handleCreate() {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      icon,
      system_prompt: systemPrompt,
      auto_learn: autoLearn,
    });
    // Reset form
    setName('');
    setDescription('');
    setIcon('🤖');
    setSystemPrompt(DEFAULT_AGENT_PROMPT);
    setAutoLearn(true);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
          <DialogDescription>
            Build an AI agent with its own personality and persistent memory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Icon picker */}
          <div>
            <Label className="text-sm">Icon</Label>
            <div className="flex gap-1.5 mt-1.5">
              {ICON_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                    icon === emoji
                      ? 'bg-indigo-100 ring-2 ring-indigo-500'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <Label htmlFor="agent-name" className="text-sm">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing Strategist"
              className="mt-1.5"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="agent-desc" className="text-sm">Description (optional)</Label>
            <Input
              id="agent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this agent does"
              className="mt-1.5"
            />
          </div>

          {/* System prompt */}
          <div>
            <Label htmlFor="agent-prompt" className="text-sm">System Prompt</Label>
            <Textarea
              id="agent-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="mt-1.5 text-xs font-mono resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Use {'{memory_notes}'} where memories should be injected.
            </p>
          </div>

          {/* Auto-learn toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-learn</Label>
              <p className="text-xs text-gray-400">
                Agent suggests memories from conversations
              </p>
            </div>
            <button
              onClick={() => setAutoLearn(!autoLearn)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                autoLearn ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoLearn ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
