'use client';

// ============================================
// DistractionBlocker — modal that fires when user tries to add a
// non-critical task while the critical-path timer is running
// ============================================
import { ShieldAlert, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Allow the user to override and add the task anyway */
  onForce: () => void;
}

export default function DistractionBlocker({ open, onClose, onForce }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="h-5 w-5" />
            Critical Path Active
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            You&apos;re in a <span className="font-semibold text-indigo-600">critical-path block</span>.
            Adding feature work now will fragment your focus and put your launch timeline at risk.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium mb-1">Suggested action</p>
            <p>Note the idea in Command Centre (⌘K) and come back to it in your feature window.</p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
              <X className="h-3.5 w-3.5" />
              Stay focused
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onForce}
              className="text-gray-400 hover:text-red-500 text-xs"
            >
              Add anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
