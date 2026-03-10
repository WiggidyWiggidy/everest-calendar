'use client';

// ============================================
// MemorySuggestionBanner
// Banner shown when auto-learn detects a memory worth saving
// ============================================
import { MemorySuggestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, X } from 'lucide-react';

interface MemorySuggestionBannerProps {
  suggestion: MemorySuggestion;
  onSave: () => void;
  onDismiss: () => void;
}

export default function MemorySuggestionBanner({
  suggestion,
  onSave,
  onDismiss,
}: MemorySuggestionBannerProps) {
  return (
    <div className="mx-4 mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-purple-700 mb-0.5">
            Memory suggestion
          </p>
          <p className="text-xs text-purple-600 font-semibold">{suggestion.title}</p>
          <p className="text-xs text-purple-500 mt-0.5 line-clamp-2">{suggestion.content}</p>
          <div className="flex gap-1.5 mt-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
              onClick={onSave}
            >
              <Check className="h-3 w-3 mr-1" />
              Save Memory
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-purple-600 hover:text-purple-700"
              onClick={onDismiss}
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
