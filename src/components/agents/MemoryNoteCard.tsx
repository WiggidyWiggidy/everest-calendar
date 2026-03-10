'use client';

// ============================================
// MemoryNoteCard
// Displays a single memory note with edit/delete actions
// ============================================
import { useState } from 'react';
import { AgentMemory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, Check, X, Brain, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface MemoryNoteCardProps {
  memory: AgentMemory;
  onUpdate: (id: string, updates: { title?: string; content?: string }) => void;
  onDelete: (id: string) => void;
}

export default function MemoryNoteCard({ memory, onUpdate, onDelete }: MemoryNoteCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memory.title);
  const [content, setContent] = useState(memory.content);

  function handleSave() {
    onUpdate(memory.id, { title, content });
    setEditing(false);
  }

  function handleCancel() {
    setTitle(memory.title);
    setContent(memory.content);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="border rounded-lg p-3 bg-white space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="text-sm"
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Memory content (markdown)"
          rows={3}
          className="text-sm resize-none"
        />
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-white group hover:border-indigo-200 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-sm text-gray-900 truncate">{memory.title}</p>
            {memory.memory_type === 'auto' && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200 shrink-0">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                Auto
              </Badge>
            )}
            {memory.memory_type === 'manual' && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200 shrink-0">
                <Brain className="h-2.5 w-2.5 mr-0.5" />
                Manual
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3">{memory.content}</p>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => onDelete(memory.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
