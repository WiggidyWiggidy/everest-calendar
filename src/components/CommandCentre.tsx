'use client';

// ============================================
// CommandCentre — Floating assistant command panel
// All input routes through /api/assistant (not /api/thoughts directly).
// The assistant handles /dump commands by calling save_raw_thought internally.
//
// Closed state: dark pill button "⚡ Command" anchored bottom-right
// Open state:   slide-up panel with:
//   - Slash command hint (coloured banner per category)
//   - Text input with autoCorrect / autoCapitalize
//   - Send button + loading spinner
//   - Quick command chips (/dump /feature /schedule /erins)
//   - "Full chat →" escape hatch to /agents
//   - Last reply confirmation (first sentence only)
//
// Conversation context persists across page navigations via localStorage.
// On first use the route creates a "Command Centre" conversation and returns
// its ID; subsequent submissions load previous messages for context.
// ============================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { parseSlashCommand, SlashCategory } from '@/lib/slashCommands';
import { Zap, ChevronDown, Send } from 'lucide-react';

// Per-category UI metadata
const COMMAND_META: Record<SlashCategory, { label: string; hint: string; color: string }> = {
  general:  { label: '',          hint: '',                                    color: '' },
  dump:     { label: '/dump',     hint: '🧠 Brain dump → Analyst queue',       color: 'text-violet-600 bg-violet-50' },
  feature:  { label: '/feature',  hint: '⚡ Feature request → Dev pipeline',   color: 'text-blue-600 bg-blue-50' },
  schedule: { label: '/schedule', hint: '📅 Schedule → Calendar',              color: 'text-indigo-600 bg-indigo-50' },
  erins:    { label: '/erins',    hint: '🚨 Urgent flag → High priority',       color: 'text-red-600 bg-red-50' },
};

const QUICK_COMMANDS: SlashCategory[] = ['dump', 'feature', 'schedule', 'erins'];

// localStorage keys for persisting conversation context across page navigations
const LOCALSTORAGE_CONVO_KEY  = 'everest_command_centre_conversation_id';
const LOCALSTORAGE_AGENT_KEY  = 'everest_personal_assistant_agent_id';

export default function CommandCentre() {
  const [isOpen, setIsOpen]                   = useState(false);
  const [input, setInput]                     = useState('');
  const [isLoading, setIsLoading]             = useState(false);
  const [lastReply, setLastReply]             = useState<string | null>(null);
  const [agentId, setAgentId]                 = useState<string | null>(null);
  const [conversationId, setConversationId]   = useState<string | null>(null);
  const [detectedCategory, setDetectedCategory] = useState<SlashCategory>('general');
  const inputRef = useRef<HTMLInputElement>(null);

  // Rehydrate persisted IDs from localStorage on mount
  useEffect(() => {
    const storedConvo  = localStorage.getItem(LOCALSTORAGE_CONVO_KEY);
    const storedAgent  = localStorage.getItem(LOCALSTORAGE_AGENT_KEY);
    if (storedConvo)  setConversationId(storedConvo);
    if (storedAgent)  setAgentId(storedAgent);
  }, []);

  // Focus input whenever the panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [isOpen]);

  function handleInputChange(value: string) {
    setInput(value);
    const parsed = parseSlashCommand(value);
    setDetectedCategory(parsed.category);
  }

  function prefillCommand(category: SlashCategory) {
    const prefix = COMMAND_META[category].label + ' ';
    handleInputChange(prefix);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prefix.length, prefix.length);
    }, 30);
  }

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const messageToSend = input.trim();
    setInput('');
    setDetectedCategory('general');
    setIsLoading(true);
    setLastReply(null);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: messageToSend }],
          agentId:         agentId        ?? undefined,
          conversationId:  conversationId ?? undefined,
        }),
      });

      if (!res.ok) throw new Error('Assistant request failed');
      const data = await res.json();

      // Persist IDs returned from the route for next submission
      if (data.conversationId) {
        setConversationId(data.conversationId);
        localStorage.setItem(LOCALSTORAGE_CONVO_KEY, data.conversationId);
      }
      if (data.agentId && !agentId) {
        setAgentId(data.agentId);
        localStorage.setItem(LOCALSTORAGE_AGENT_KEY, data.agentId);
      }

      // Show first sentence of the reply as a compact confirmation
      const replyText: string = data.reply || data.message || 'Got it.';
      const shortReply = replyText.split(/[.!?\n]/)[0].trim() || replyText;
      setLastReply(shortReply);
    } catch (err) {
      console.error('CommandCentre submit error:', err);
      setLastReply('Something went wrong — try again.');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, agentId, conversationId]);

  const meta       = COMMAND_META[detectedCategory];
  const hasCommand = detectedCategory !== 'general';

  // ── Closed state — pill button ───────────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open command centre"
        className={cn(
          // On mobile: sit above the MobileCommandBar (~130px tall) so bottom-36 clears it.
          // On sm+: MobileCommandBar is hidden (lg:hidden), so bottom-6 is fine.
          'fixed bottom-36 sm:bottom-6 right-5 z-[60]',
          'flex items-center gap-2 pl-4 pr-5 py-3',
          'bg-gray-900 text-white rounded-full shadow-2xl',
          'text-sm font-medium tracking-tight border border-white/10',
          'hover:bg-gray-800 active:scale-95 transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-700'
        )}
      >
        <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
        <span>Command</span>
      </button>
    );
  }

  // ── Open state — command panel ───────────────────────────────────────────────
  return (
    <>
      {/* Mobile backdrop — tap to close. z-[55] sits above MobileCommandBar (z-50) */}
      <div
        className="fixed inset-0 z-[55] bg-black/10 backdrop-blur-[1px] sm:hidden"
        onClick={() => setIsOpen(false)}
      />

      {/* Panel — z-[60] ensures it covers MobileCommandBar (z-50) when open */}
      <div className={cn(
        'fixed z-[60]',
        'bottom-0 inset-x-0',
        'sm:bottom-6 sm:right-5 sm:left-auto sm:inset-x-auto sm:w-[420px]'
      )}>
        <div className={cn(
          'bg-white border border-gray-200/80',
          'rounded-t-2xl sm:rounded-2xl',
          'shadow-2xl shadow-black/20 overflow-hidden',
          'animate-in slide-in-from-bottom-4 duration-200'
        )}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-gray-900 tracking-tight">
                Command Centre
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close command centre"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Reply confirmation — shows after submit */}
          {lastReply && !isLoading && (
            <div className="px-4 pt-3">
              <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <span className="text-base leading-none mt-0.5 shrink-0">✦</span>
                <span className="leading-snug">{lastReply}</span>
              </div>
            </div>
          )}

          {/* Slash command hint banner */}
          {hasCommand && (
            <div className={cn('mx-4 mt-3 px-3 py-1.5 rounded-lg text-xs font-medium', meta.color)}>
              {meta.hint}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') setIsOpen(false);
              }}
              placeholder="Tell me anything… or /dump /schedule /feature"
              className={cn(
                'flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder:text-gray-400',
                isLoading && 'opacity-50'
              )}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={false}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              aria-label="Send"
              className={cn(
                'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150',
                input.trim() && !isLoading
                  ? 'bg-gray-900 text-white hover:bg-gray-700 active:scale-95'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              )}
            >
              {isLoading
                ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
            </button>
          </div>

          {/* Quick command chips + full chat link */}
          <div className="flex items-center gap-1.5 px-4 pb-4">
            {QUICK_COMMANDS.map((cat) => (
              <button
                key={cat}
                onClick={() => prefillCommand(cat)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                  detectedCategory === cat
                    ? cn(COMMAND_META[cat].color, 'ring-1 ring-current ring-opacity-30')
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}
              >
                {COMMAND_META[cat].label}
              </button>
            ))}
            <a
              href="/agents"
              onClick={() => setIsOpen(false)}
              className="ml-auto text-xs text-gray-400 hover:text-indigo-600 transition-colors whitespace-nowrap"
            >
              Full chat →
            </a>
          </div>

          {/* iOS safe area spacer */}
          <div className="sm:hidden" style={{ height: 'env(safe-area-inset-bottom)' }} />

        </div>
      </div>
    </>
  );
}
