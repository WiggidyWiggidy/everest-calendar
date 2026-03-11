'use client';

// ============================================
// PromptSettingsModal
// Lets the user view and edit the System Analyst's master prompt.
// "Reset to Default" restores the original prompt text.
// ============================================
import { useState } from 'react';
import { AnalystConfig } from '@/types';
import { DEFAULT_MASTER_PROMPT } from '@/lib/analyst-config';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface PromptSettingsModalProps {
  open: boolean;
  onClose: () => void;
  config: AnalystConfig;
  onSave: (newPrompt: string) => void;
}

export default function PromptSettingsModal({
  open,
  onClose,
  config,
  onSave,
}: PromptSettingsModalProps) {
  const [prompt, setPrompt] = useState(config.master_prompt);

  function handleReset() {
    setPrompt(DEFAULT_MASTER_PROMPT);
  }

  function handleSave() {
    onSave(prompt);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Analyst Prompt Settings</DialogTitle>
          <DialogDescription>
            Edit the master instruction prompt used when processing raw thoughts.
            This controls how tasks are categorised and scored.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={14}
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 bg-gray-50"
        />

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleReset}>
            Reset to Default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
