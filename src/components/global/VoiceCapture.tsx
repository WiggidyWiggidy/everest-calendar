'use client';

// ============================================
// VoiceCapture v2 — Safari-optimised continuous recording
// Voice-to-Build Pipeline — Stage 2 (rewrite)
//
// Architecture: Segment Accumulator Pattern
// Instead of one long continuous session (unreliable on Safari/iOS),
// we chain multiple short sessions. When a session ends — whether
// due to a natural pause or Safari killing it — we auto-restart
// UNLESS the user explicitly pressed stop. All segments are joined
// into one transcript before submission.
//
// Max transcript: 2000 chars (~400 words). Progress bar shown during recording.
// Falls back to a text input for browsers without Speech API support.
// ============================================
import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Check, X, Loader2, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type RecordingState =
  | 'idle'
  | 'recording'
  | 'paused-between-segments'  // session ended, waiting to auto-restart
  | 'submitting'
  | 'success'
  | 'error';

const MAX_CHARS = 2000;    // ~400 words — enough for a confident brain-dump
const MAX_SEGMENTS = 20;   // safety limit to prevent infinite restarts

export default function VoiceCapture() {
  const [state, setState] = useState<RecordingState>('idle');
  const [segments, setSegments] = useState<string[]>([]);       // confirmed transcript segments
  const [interimText, setInterimText] = useState('');            // in-progress (unconfirmed) text
  const [showTextInput, setShowTextInput] = useState(false);     // text fallback modal
  const [fallbackText, setFallbackText] = useState('');
  const [submittingFallback, setSubmittingFallback] = useState(false);
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);

  // Refs — used inside event callbacks so they must never be stale
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const userStoppedRef = useRef(false);       // true when user explicitly pressed stop
  const segmentsRef = useRef<string[]>([]);   // mirrors segments state for callback access
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect Speech API support on mount and clean up on unmount
  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
    return () => {
      // Stop any active recognition session and cancel pending restarts
      if (recognitionRef.current) {
        userStoppedRef.current = true;
        recognitionRef.current.stop();
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
    };
  }, []);

  // ---- Submission ----

  async function handleSubmit() {
    const fullTranscript = segmentsRef.current.join(' ').trim();

    // Clean up
    recognitionRef.current = null;
    setInterimText('');

    // Don't submit empty recordings
    if (!fullTranscript) {
      setState('idle');
      setSegments([]);
      segmentsRef.current = [];
      return;
    }

    setState('submitting');

    try {
      const res = await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullTranscript }),
      });

      setState(res.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }

    // Reset after feedback flash
    setTimeout(() => {
      setState('idle');
      setSegments([]);
      segmentsRef.current = [];
    }, 1500);
  }

  // ---- Recording ----

  function startRecording() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) {
      setShowTextInput(true);
      return;
    }

    // Reset accumulated state
    segmentsRef.current = [];
    setSegments([]);
    setInterimText('');
    userStoppedRef.current = false;

    const recognition = new SpeechAPI();
    recognition.continuous = true;       // request continuous mode (Safari may ignore; that's OK)
    recognition.interimResults = true;
    recognition.lang = 'en-AU';
    recognition.maxAlternatives = 1;

    // --- onresult: accumulate confirmed segments, check length limit ---
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        const updatedSegments = [...segmentsRef.current, finalTranscript.trim()];
        segmentsRef.current = updatedSegments;
        setSegments(updatedSegments);

        // Auto-stop when max length is reached
        const totalLength = updatedSegments.join(' ').length;
        if (totalLength >= MAX_CHARS) {
          userStoppedRef.current = true;
          recognition.stop();
          return;
        }
      }

      setInterimText(interim);
    };

    // --- onend: submit if user stopped; otherwise auto-restart ---
    recognition.onend = () => {
      // User pressed stop OR length limit was hit → submit
      if (userStoppedRef.current) {
        handleSubmit();
        return;
      }

      // Safety limit — submit to avoid infinite restart loops
      if (segmentsRef.current.length >= MAX_SEGMENTS) {
        handleSubmit();
        return;
      }

      // Safari/browser killed the session → auto-restart transparently
      // Small gap (300ms) gives Safari time to release the mic before reclaiming it
      setState('paused-between-segments');
      restartTimeoutRef.current = setTimeout(() => {
        try {
          recognition.start();
          setState('recording');
        } catch (e) {
          // Instance couldn't restart (e.g. permission revoked) — submit what we have
          console.error('VoiceCapture: failed to restart recognition', e);
          handleSubmit();
        }
      }, 300);
    };

    // --- onerror: handle specific error types ---
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('VoiceCapture: speech error', event.error);

      // 'no-speech' = user hasn't spoken yet; 'aborted' = we called .stop() ourselves
      // Both are non-fatal — let onend handle the restart/submit logic
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      // Permission denied — show error state and return to idle
      if (event.error === 'not-allowed') {
        setState('error');
        setTimeout(() => setState('idle'), 2000);
        return;
      }

      // Any other error (audio-capture, network, etc.) — submit what we have
      handleSubmit();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState('recording');
  }

  function stopRecording() {
    userStoppedRef.current = true;

    if (restartTimeoutRef.current) {
      // We're in paused-between-segments — a restart was pending but not yet started.
      // Cancel it and submit directly (no live session to stop).
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
      handleSubmit();
      return;
    }

    // Active session — stop it; onend will see userStoppedRef = true and call handleSubmit
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }

  // ---- Button click ----

  function handleButtonClick() {
    if (state === 'recording' || state === 'paused-between-segments') {
      stopRecording();
    } else if (state === 'idle') {
      if (speechSupported) {
        startRecording();
      } else {
        setShowTextInput(true);
      }
    }
    // Ignore clicks during submitting / success / error
  }

  // ---- Text fallback ----

  async function handleFallbackSubmit() {
    if (!fallbackText.trim() || submittingFallback) return;
    setSubmittingFallback(true);

    try {
      const res = await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fallbackText.trim() }),
      });

      if (res.ok) {
        setFallbackText('');
        setShowTextInput(false);
        setState('success');
        setTimeout(() => setState('idle'), 1000);
      }
    } catch (err) {
      console.error('VoiceCapture fallback: network error', err);
    }

    setSubmittingFallback(false);
  }

  function handleFallbackKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleFallbackSubmit();
    }
  }

  // ---- Derived UI values ----

  const isRecording = state === 'recording' || state === 'paused-between-segments';
  const fullTranscriptLength = segments.join(' ').length + interimText.length;
  const progressPct = Math.min(100, (fullTranscriptLength / MAX_CHARS) * 100);

  const buttonConfig = (() => {
    if (isRecording)          return { bg: 'bg-red-500 hover:bg-red-600',   icon: <Square className="h-5 w-5 text-white" fill="white" /> };
    if (state === 'submitting') return { bg: 'bg-indigo-600',                icon: <Loader2 className="h-6 w-6 text-white animate-spin" /> };
    if (state === 'success')    return { bg: 'bg-green-500',                 icon: <Check className="h-6 w-6 text-white" /> };
    if (state === 'error')      return { bg: 'bg-red-500',                   icon: <X className="h-6 w-6 text-white" /> };
    return                             { bg: 'bg-indigo-600 hover:bg-indigo-700', icon: <Mic className="h-6 w-6 text-white" /> };
  })();

  return (
    <>
      {/* ---- Text fallback card ---- */}
      {showTextInput && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowTextInput(false)} />
          <div className="fixed bottom-24 right-6 z-50 w-72 bg-white rounded-xl shadow-xl border p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Capture a thought</p>
            <Textarea
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              onKeyDown={handleFallbackKeyDown}
              placeholder="Type a thought..."
              rows={3}
              className="resize-none text-sm"
              autoFocus
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">⌘ + Enter to send</p>
              <Button
                size="sm"
                onClick={handleFallbackSubmit}
                disabled={!fallbackText.trim() || submittingFallback}
              >
                {submittingFallback ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                Send
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ---- Recording transcript preview with progress bar ---- */}
      {isRecording && (
        <div className="fixed bottom-20 right-4 z-50 max-w-xs w-full">
          <div className="bg-white rounded-xl shadow-lg border p-3 max-h-40 overflow-y-auto">
            <div className="text-xs text-gray-500 mb-1 flex justify-between">
              <span>Recording…</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            {/* Capacity progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
              <div
                className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {/* Live transcript — confirmed segments + interim */}
            <p className="text-sm text-gray-700 leading-relaxed">
              {segments.join(' ')}
              {interimText && (
                <span className="text-gray-400"> {interimText}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ---- Recording pulse ring ---- */}
      {isRecording && (
        <span className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40" />
        </span>
      )}

      {/* ---- Main floating button group ---- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Keyboard fallback toggle (only visible in idle state) */}
        {speechSupported && state === 'idle' && !showTextInput && (
          <button
            onClick={() => setShowTextInput(true)}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white border shadow-md text-gray-400 hover:text-gray-600 hover:shadow-lg transition-all"
            title="Type a thought instead"
            aria-label="Type a thought"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        )}

        {/* Main mic / stop button */}
        <button
          onClick={handleButtonClick}
          disabled={state === 'submitting' || state === 'success' || state === 'error'}
          aria-label={
            isRecording        ? 'Stop recording' :
            state === 'submitting' ? 'Saving thought…' :
            'Capture a thought'
          }
          className={`
            flex items-center justify-center
            w-14 h-14 rounded-full shadow-lg
            transition-all duration-200
            disabled:cursor-default
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
            ${buttonConfig.bg}
          `}
        >
          {buttonConfig.icon}
        </button>
      </div>
    </>
  );
}
