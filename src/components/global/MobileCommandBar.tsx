'use client';

// ============================================
// MobileCommandBar
// Sticky bottom bar for iPhone / Safari — replaces the floating
// VoiceCapture button on small screens. Hidden on desktop (lg+).
//
// Three-layer architecture (renders bottom-to-top):
//   Layer 1 — Always-visible controls: mode toggle, agent pills, mic
//   Layer 2 — Recording preview: transcript + progress bar (while recording)
//   Layer 3 — Response card: agent reply (after agent-chat completes)
//
// Two modes:
//   brain-dump  → voice transcript saved to /api/thoughts (raw thought)
//   agent-chat  → voice transcript sent to /api/chat with selected agent
// ============================================

import { useState, useEffect } from 'react';
import { Mic, Square, Check, X, Loader2 } from 'lucide-react';
import { Agent } from '@/types';
import { getAgents } from '@/lib/agents';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { cn } from '@/lib/utils';

type CommandMode = 'brain-dump' | 'agent-chat';
type SendState   = 'idle' | 'sending' | 'success' | 'error';

export default function MobileCommandBar() {
  const [agents, setAgents]               = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [mode, setMode]                   = useState<CommandMode>('brain-dump');
  const [sendState, setSendState]         = useState<SendState>('idle');
  const [responseText, setResponseText]   = useState<string | null>(null);

  // Fetch chat agents (exclude the analyst, which has no chat endpoint)
  useEffect(() => {
    getAgents().then((all) => {
      const chatAgents = all.filter((a) => a.agent_type === 'chat');
      setAgents(chatAgents);
      if (chatAgents.length > 0) setSelectedAgentId(chatAgents[0].id);
    });
  }, []);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  // ---- Handle completed transcript ----
  async function onTranscriptReady(transcript: string) {
    setSendState('sending');
    setResponseText(null);

    try {
      if (mode === 'brain-dump') {
        // Save raw thought
        const res = await fetch('/api/thoughts', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text: transcript }),
        });
        setSendState(res.ok ? 'success' : 'error');

        // Reset mic button colour after flash
        setTimeout(() => setSendState('idle'), 1500);

      } else {
        // Ask the selected agent (one-shot, no conversation history on mobile)
        const res  = await fetch('/api/chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            messages: [{ role: 'user', content: transcript }],
            events:   [],               // calendar context skipped on mobile quick-chat
            agent_id: selectedAgentId,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Strip structured blocks (event suggestions, memory suggestions) from display
        const clean = (data.message as string)
          .replace(/```event\s*\n[\s\S]*?```/g, '')
          .replace(/<memory_suggestion>\s*\n[\s\S]*?<\/memory_suggestion>/g, '')
          .trim();

        setResponseText(clean);
        setSendState('success');
        setTimeout(() => setSendState('idle'), 500);
      }
    } catch {
      setSendState('error');
      setTimeout(() => setSendState('idle'), 1500);
    }
  }

  // ---- Speech recognition ----
  const {
    isRecording,
    segments,
    interimText,
    progressPct,
    speechSupported,
    startRecording,
    stopRecording,
  } = useSpeechRecognition({ onTranscriptReady });

  function handleMicPress() {
    if (isRecording) {
      stopRecording();
      return;
    }
    if (sendState !== 'idle') return;
    if (mode === 'agent-chat' && !selectedAgentId) return;
    startRecording();
  }

  // ---- Mic button visuals ----
  const micConfig = (() => {
    if (isRecording)              return { bg: 'bg-red-500 active:bg-red-600',     icon: <Square   className="h-5 w-5 text-white" fill="white" /> };
    if (sendState === 'sending')  return { bg: 'bg-indigo-400',                    icon: <Loader2  className="h-5 w-5 text-white animate-spin" /> };
    if (sendState === 'success')  return { bg: 'bg-green-500',                     icon: <Check    className="h-5 w-5 text-white" /> };
    if (sendState === 'error')    return { bg: 'bg-red-500',                       icon: <X        className="h-5 w-5 text-white" /> };
    return                               { bg: 'bg-indigo-600 active:bg-indigo-700', icon: <Mic    className="h-5 w-5 text-white" /> };
  })();

  const micDisabled =
    speechSupported === false ||
    (sendState !== 'idle' && !isRecording);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-gray-200 shadow-lg">

      {/* ── Layer 3: Agent response card ────────────────────────────────── */}
      {responseText && !isRecording && (
        <div className="mx-4 mt-3 mb-1 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{selectedAgent?.icon ?? '🤖'}</span>
              <p className="text-xs font-semibold text-indigo-700">{selectedAgent?.name}</p>
            </div>
            <button
              onClick={() => setResponseText(null)}
              className="text-indigo-300 hover:text-indigo-500 transition-colors shrink-0"
              aria-label="Dismiss response"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap line-clamp-5">
            {responseText}
          </p>
        </div>
      )}

      {/* ── Layer 2: Recording transcript preview ───────────────────────── */}
      {isRecording && (
        <div className="mx-4 mt-3 mb-1 bg-gray-50 border border-gray-100 rounded-xl p-3 max-h-32 overflow-y-auto no-scrollbar">
          <div className="flex justify-between items-center text-xs text-gray-400 mb-1.5">
            <span className="text-red-500 font-medium flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Recording
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
            <div
              className="bg-red-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Live transcript */}
          <p className="text-sm text-gray-700 leading-relaxed">
            {segments.join(' ')}
            {interimText && <span className="text-gray-400"> {interimText}</span>}
          </p>
        </div>
      )}

      {/* ── Layer 1: Always-visible controls ────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 safe-area-bottom">

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-3">
          {(['brain-dump', 'agent-chat'] as CommandMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setResponseText(null); }}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-all duration-150',
                mode === m
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {m === 'brain-dump' ? '💭 Save Thought' : '🤖 Ask Agent'}
            </button>
          ))}
        </div>

        {/* Agent pills — only in agent-chat mode */}
        {mode === 'agent-chat' && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 -mx-1 px-1">
            {agents.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No agents yet — create one in Agents.</p>
            ) : (
              agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAgentId(a.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-all duration-150',
                    selectedAgentId === a.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                  )}
                >
                  <span>{a.icon}</span>
                  <span>{a.name}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Mic button row */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleMicPress}
            disabled={micDisabled}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={cn(
              'w-12 h-12 rounded-full shadow-md flex items-center justify-center',
              'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              micConfig.bg,
            )}
          >
            {micConfig.icon}
          </button>

          {/* Speech not supported notice */}
          {speechSupported === false && (
            <p className="text-xs text-gray-400 text-center">
              Voice not supported in this browser
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
