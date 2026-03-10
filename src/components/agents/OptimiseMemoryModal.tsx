'use client';

// ============================================
// OptimiseMemoryModal
// Shows a before/after diff of memory optimisation results.
// User reviews and chooses to Apply or Discard.
// ============================================
import { useState } from 'react';
import { OptimisedNote, OptimiseResult } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';

interface OptimiseMemoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: OptimiseResult;
  onApply: (optimisedNotes: OptimisedNote[]) => Promise<void>;
}

export default function OptimiseMemoryModal({
  open,
  onOpenChange,
  result,
  onApply,
}: OptimiseMemoryModalProps) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const { original, optimised, stats } = result;

  // Work out a human-readable stat line
  function statLine() {
    const delta = stats.delta; // negative = fewer notes (merged/removed)

    if (delta === 0) {
      return `${stats.originalCount} notes rewritten and cleaned.`;
    } else if (delta < 0) {
      const reduction = Math.abs(delta);
      return `${reduction} note${reduction > 1 ? 's' : ''} merged or removed. ${stats.optimisedCount} notes remaining.`;
    } else {
      // delta > 0 means Claude split notes (unlikely, but handle it)
      return `${stats.originalCount} notes expanded to ${stats.optimisedCount}.`;
    }
  }

  async function handleApply() {
    setApplying(true);
    await onApply(optimised);
    setApplied(true);
    setApplying(false);
  }

  function handleClose() {
    setApplied(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Memory Optimisation Preview
          </DialogTitle>
          <DialogDescription>
            Review the changes before applying. This will archive your current notes
            and replace them with the optimised set.
          </DialogDescription>
        </DialogHeader>

        {/* Success state */}
        {applied ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="font-semibold text-gray-800">Memories optimised!</p>
            <p className="text-sm text-gray-500">
              Old notes have been archived and the new set is active.
            </p>
            <Button onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-purple-50 rounded-lg text-sm">
              <TrendingDown className="h-4 w-4 text-purple-600 shrink-0" />
              <p className="text-purple-700 font-medium">{statLine()}</p>
              <span className="ml-auto text-purple-500 text-xs whitespace-nowrap">
                {stats.originalCount} → {stats.optimisedCount} notes
              </span>
            </div>

            {/* Before / After diff */}
            <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
              {/* Before */}
              <div className="flex-1 flex flex-col min-w-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Before ({stats.originalCount})
                </p>
                <ScrollArea className="flex-1 border rounded-lg bg-gray-50">
                  <div className="p-3 space-y-2">
                    {original.map((note, i) => (
                      <NotePreview key={i} note={note} variant="before" />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Arrow */}
              <div className="flex items-center pt-6 shrink-0">
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>

              {/* After */}
              <div className="flex-1 flex flex-col min-w-0">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">
                  After ({stats.optimisedCount})
                </p>
                <ScrollArea className="flex-1 border border-purple-200 rounded-lg bg-purple-50/30">
                  <div className="p-3 space-y-2">
                    {optimised.map((note, i) => (
                      <NotePreview key={i} note={note} variant="after" />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={applying}
              >
                Discard
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Apply Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Sub-component: compact note card used inside the diff ----
function NotePreview({
  note,
  variant,
}: {
  note: OptimisedNote;
  variant: 'before' | 'after';
}) {
  return (
    <div
      className={`rounded-md p-2.5 border text-xs ${
        variant === 'after'
          ? 'bg-white border-purple-200'
          : 'bg-white border-gray-200 opacity-70'
      }`}
    >
      <p
        className={`font-semibold mb-0.5 ${
          variant === 'after' ? 'text-purple-700' : 'text-gray-700'
        }`}
      >
        {note.title}
      </p>
      <p className="text-gray-500 line-clamp-3 leading-relaxed whitespace-pre-wrap">
        {note.content}
      </p>
    </div>
  );
}
