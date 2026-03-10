'use client';

// ============================================
// VoiceCapture — Global floating voice input
// Voice-to-Build Pipeline — Stage 2
//
// States: idle → recording → submitting → success/error → idle
// Supports Web Speech API with a manual text fallback.
// Feature-detects Speech API — never crashes if unavailable.
// Does NOT request mic permission on mount — only on tap.
// ============================================
import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Send, Check, X, Loader2, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type CaptureState = 'idle' | 'recording' | 'submitting' | 'success' | 'error';

export default function VoiceCapture() {
  const [state, setState] = useState<CaptureState>('idle');
  const [interimText, setInterimText] = useState('');
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [fallbackText, setFallbackText] = useState('');
  const [submittingFallback, setSubmittingFallback] = useState(false);
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect Speech API support on mount (client-only)
  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // POST the final transcript to /api/thoughts
  const submitThought = useCallback(async (text: string) => {
    if (!text.trim()) {
      setState('idle');
      return;
    }

    setState('submitting');

    try {
      const response = await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (response.ok) {
        setState('success');
      } else {
        console.error('VoiceCapture: API returned', response.status);
        setState('error');
      }
    } catch (err) {
      console.error('VoiceCapture: network error', err);
      setState('error');
    }

    // Return to idle after 1 second regardless of success/error
    resetTimerRef.current = setTimeout(() => {
      setState('idle');
      setInterimText('');
      finalTranscriptRef.current = '';
    }, 1000);
  }, []);

  // Start speech recognition
  function startRecording() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechAPI();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-AU';
    recognition.maxAlternatives = 1;

    finalTranscriptRef.current = '';
    setInterimText('');

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) finalTranscriptRef.current += final;
      setInterimText(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are non-critical — just reset
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setState('idle');
        setInterimText('');
        finalTranscriptRef.current = '';
      } else {
        console.error('VoiceCapture: speech error', event.error, event.message);
        setState('error');
        resetTimerRef.current = setTimeout(() => {
          setState('idle');
          setInterimText('');
          finalTranscriptRef.current = '';
        }, 1000);
      }
    };

    recognition.onend = () => {
      submitThought(finalTranscriptRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState('recording');
  }

  // Handle main button click
  function handleButtonClick() {
    if (state === 'recording') {
      // Stop recording — onend will handle submission
      recognitionRef.current?.stop();
      return;
    }

    if (state !== 'idle') return;

    if (speechSupported) {
      startRecording();
    } else {
      // No Speech API — open text fallback
      setShowTextFallback(true);
    }
  }

  // Submit the text fallback
  async function handleFallbackSubmit() {
    if (!fallbackText.trim() || submittingFallback) return;
    setSubmittingFallback(true);

    try {
      const response = await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fallbackText.trim() }),
      });

      if (response.ok) {
        setFallbackText('');
        setShowTextFallback(false);
        // Flash the main button green briefly
        setState('success');
        resetTimerRef.current = setTimeout(() => setState('idle'), 1000);
      } else {
        console.error('VoiceCapture fallback: API returned', response.status);
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

  // Derive button appearance from state
  const buttonConfig = {
    idle:       { bg: 'bg-indigo-600 hover:bg-indigo-700', icon: <Mic className="h-6 w-6 text-white" /> },
    recording:  { bg: 'bg-red-500 hover:bg-red-600',       icon: <MicOff className="h-6 w-6 text-white" /> },
    submitting: { bg: 'bg-indigo-600',                     icon: <Loader2 className="h-6 w-6 text-white animate-spin" /> },
    success:    { bg: 'bg-green-500',                      icon: <Check className="h-6 w-6 text-white" /> },
    error:      { bg: 'bg-red-500',                        icon: <X className="h-6 w-6 text-white" /> },
  }[state];

  return (
    <>
      {/* ---- Text fallback card (above button) ---- */}
      {showTextFallback && (
        <>
          {/* Backdrop — click to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowTextFallback(false)}
          />
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

      {/* ---- Interim transcript card (above button while recording) ---- */}
      {state === 'recording' && interimText && (
        <div className="fixed bottom-24 right-6 z-50 max-w-[280px] bg-white rounded-xl shadow-lg border px-4 py-3 pointer-events-none">
          <p className="text-xs text-gray-400 mb-1 font-medium">Listening…</p>
          <p className="text-sm text-gray-600 leading-relaxed">{interimText}</p>
        </div>
      )}

      {/* ---- Recording pulse ring ---- */}
      {state === 'recording' && (
        <span className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40" />
        </span>
      )}

      {/* ---- Main floating button group ---- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Keyboard fallback toggle (shown when speech is supported, as secondary option) */}
        {speechSupported && state === 'idle' && !showTextFallback && (
          <button
            onClick={() => setShowTextFallback(true)}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white border shadow-md text-gray-400 hover:text-gray-600 hover:shadow-lg transition-all"
            title="Type a thought instead"
            aria-label="Type a thought"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        )}

        {/* Main mic button */}
        <button
          onClick={handleButtonClick}
          disabled={state === 'submitting' || state === 'success' || state === 'error'}
          aria-label={
            state === 'recording' ? 'Stop recording' :
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
