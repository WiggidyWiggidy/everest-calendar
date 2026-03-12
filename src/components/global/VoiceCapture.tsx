'use client';

// ============================================
// VoiceCapture — Floating text input bar (mobile-first rewrite)
// Replaces the mic-based voice capture with a persistent text input
// that works reliably on mobile Safari and all browsers.
//
// Closed state: indigo floating button (bottom-right, PenLine icon)
// Open state:   full-width bottom bar with:
//   - Slash command hint strip (when /dump /feature /schedule /erins detected)
//   - Text input (autoCorrect, autoCapitalize, Enter to submit)
//   - Quick command buttons
//
// Submits to /api/thoughts regardless of slash command.
// The slash prefix is preserved in the content so the Analyst can route it.
// ============================================
import { useState, useRef } from 'react';
import { PenLine, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SLASH_COMMANDS = ['/dump', '/feature', '/schedule', '/erins'] as const;

const SLASH_HINTS: Record<string, string> = {
  '/dump':     '🧠 Brain dump — will be sent to Analyst',
  '/feature':  '⚡ Feature request — added to dev pipeline',
  '/schedule': '📅 Schedule — will create a calendar event',
  '/erins':    '🚨 Flagged for Erin — high priority',
};

export default function VoiceCapture() {
  const [isOpen, setIsOpen]                   = useState(false);
  const [inputValue, setInputValue]           = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [detectedCommand, setDetectedCommand] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInputChange(value: string) {
    setInputValue(value);
    const found = SLASH_COMMANDS.find((cmd) => value.toLowerCase().startsWith(cmd));
    setDetectedCommand(found ?? null);
  }

  async function handleSubmit() {
    if (!inputValue.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputValue.trim() }),
      });
      setInputValue('');
      setDetectedCommand(null);
      setIsOpen(false);
    } catch (err) {
      console.error('VoiceCapture: failed to save thought:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openBar() {
    setIsOpen(true);
    // Give React time to mount the input before focusing
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function closeBar() {
    setIsOpen(false);
    setInputValue('');
    setDetectedCommand(null);
  }

  function handleQuickCommand(cmd: string) {
    handleInputChange(cmd + ' ');
    inputRef.current?.focus();
  }

  // ── Closed state — floating button ──────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={openBar}
        aria-label="Capture a thought"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 shadow-lg hover:bg-indigo-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <PenLine className="h-6 w-6 text-white" />
      </button>
    );
  }

  // ── Open state — floating bottom bar ────────────────────────────────────────
  return (
    <>
      {/* Backdrop — tap outside to close */}
      <div
        className="fixed inset-0 z-40"
        onClick={closeBar}
      />

      {/* Input bar */}
      <div className="fixed inset-x-4 bottom-4 z-50 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-3">

          {/* Slash command hint */}
          {detectedCommand && (
            <div className="text-xs font-medium px-2 pb-2 text-indigo-600">
              {SLASH_HINTS[detectedCommand]}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Capture a thought… or /dump /feature /schedule /erins"
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
            />
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !inputValue.trim()}
              className={cn(
                'ml-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors shrink-0',
                inputValue.trim()
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
            </button>
          </div>

          {/* Quick command buttons */}
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-100">
            {SLASH_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                onClick={() => handleQuickCommand(cmd)}
                className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
              >
                {cmd}
              </button>
            ))}
            <button
              onClick={closeBar}
              className="ml-auto text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
