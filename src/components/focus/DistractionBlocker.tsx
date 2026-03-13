'use client';

// ============================================
// DistractionBlocker — modal gate
// Appears when the user attempts to add a
// non-critical task during the critical path block
// ============================================
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void; // allow anyway
}

export default function DistractionBlocker({ open, onClose, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="h-5 w-5" />
            Critical Path Active
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <p className="text-sm text-gray-600">
            You&apos;re inside a <strong>critical path block</strong>. Adding non-critical
            tasks now fragments your deep-work time and slows launch velocity.
          </p>
          <p className="text-sm text-gray-500">
            Save this idea for after the critical path block is complete, or add it to
            your backlog instead.
          </p>

          <div className="flex gap-3 pt-1">
            <Button className="flex-1" onClick={onClose}>
              Stay Focused
            </Button>
            <Button variant="outline" className="flex-1 text-gray-500" onClick={onConfirm}>
              Add Anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
