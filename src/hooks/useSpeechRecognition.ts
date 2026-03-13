'use client';

// ============================================
// useSpeechRecognition
// Reusable hook — segment accumulator pattern
//
// Chains multiple short Web Speech API sessions so the transcript
// survives Safari's aggressive session termination. Each session's
// finals are concatenated; when the user stops (or the length limit
// is hit) the full transcript is delivered via `onTranscriptReady`.
//
// Used by: VoiceCapture (desktop) and MobileCommandBar (mobile)
// ============================================

import { useState, useEffect, useRef } from 'react';

export type RecordingState =
  | 'idle'
  | 'recording'
  | 'paused-between-segments'  // session ended, auto-restart pending
  | 'error';                   // permission denied — resets to idle after 2 s

interface UseSpeechRecognitionOptions {
  /** Called once with the full transcript when recording completes */
  onTranscriptReady: (transcript: string) => void;
  /** Stop accumulating at this many characters (~400 words at 2000) */
  maxChars?: number;
  /** Safety cap on segment restarts (each Safari session = 1 segment) */
  maxSegments?: number;
  /** BCP-47 language tag */
  lang?: string;
}

interface UseSpeechRecognitionReturn {
  state: RecordingState;
  segments: string[];       // confirmed (final) transcript segments
  interimText: string;      // current in-progress (unconfirmed) text
  progressPct: number;      // 0–100, relative to maxChars
  isRecording: boolean;     // true during 'recording' or 'paused-between-segments'
  speechSupported: boolean | null; // null while detecting
  startRecording: () => void;
  stopRecording: () => void;
  // Extended API for voice interface
  isListening: boolean;     // alias for isRecording
  transcript: string;       // full transcript including interim text
  error: string | null;     // last error message, or null
  confidence: number;       // confidence of last final result (0–1)
}

const DEFAULT_MAX_CHARS    = 2000;
const DEFAULT_MAX_SEGMENTS = 20;
const RESTART_DELAY_MS     = 300; // gap before restarting on Safari

export function useSpeechRecognition({
  onTranscriptReady,
  maxChars    = DEFAULT_MAX_CHARS,
  maxSegments = DEFAULT_MAX_SEGMENTS,
  lang        = 'en-AU',
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {

  const [state, setStateInner]  = useState<RecordingState>('idle');
  const [segments, setSegments] = useState<string[]>([]);
  const [interimText, setInterimText] = useState('');
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);

  // Refs — stable across renders, safe to read inside event callbacks
  const recognitionRef     = useRef<SpeechRecognition | null>(null);
  const userStoppedRef     = useRef(false);
  const segmentsRef        = useRef<string[]>([]);          // mirrors `segments` for callbacks
  const restartTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the callback pointer current without forcing hook recreation.
  // Updated synchronously on every render so callbacks always see latest value.
  const onTranscriptReadyRef = useRef(onTranscriptReady);
  onTranscriptReadyRef.current = onTranscriptReady;

  // Detect Speech API support on mount; clean up on unmount
  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
    return () => {
      if (recognitionRef.current) {
        userStoppedRef.current = true;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
    };
  }, []);

  // ---- Core: deliver transcript to caller and reset to idle ----
  //
  // The `fromRecognition` guard prevents stale `onend` callbacks (from
  // a previous session) from firing after `reset()` invalidates the ref.
  function deliverTranscript(fromRecognition: SpeechRecognition | null) {
    if (recognitionRef.current !== fromRecognition) return;

    const fullTranscript = segmentsRef.current.join(' ').trim();

    // Invalidate the current recognition instance immediately so any
    // late-firing callbacks from the same instance are no-ops.
    recognitionRef.current = null;
    segmentsRef.current    = [];
    setSegments([]);
    setInterimText('');
    setStateInner('idle');

    if (fullTranscript) {
      onTranscriptReadyRef.current(fullTranscript);
    }
  }

  // ---- Start a new recording session ----
  function startRecording() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) return;

    // Reset accumulated state for a fresh recording
    segmentsRef.current = [];
    setSegments([]);
    setInterimText('');
    userStoppedRef.current = false;

    const recognition = new SpeechAPI();
    recognition.continuous      = true;   // Safari may ignore; onend handles reconnect
    recognition.interimResults  = true;
    recognition.lang            = lang;
    recognition.maxAlternatives = 1;

    // Accumulate final results; check length limit
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim         = '';
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
        const updated = [...segmentsRef.current, finalTranscript.trim()];
        segmentsRef.current = updated;
        setSegments(updated);
        // Track confidence of most recent final result
        const lastResult = event.results[event.results.length - 1];
        if (lastResult?.isFinal) setConfidence(lastResult[0].confidence ?? 0);

        // Auto-stop when the character limit is reached
        if (updated.join(' ').length >= maxChars) {
          userStoppedRef.current = true;
          recognition.stop();
          return;
        }
      }

      setInterimText(interim);
    };

    // Session ended — deliver or restart depending on why it ended
    recognition.onend = () => {
      restartTimeoutRef.current = null;

      if (userStoppedRef.current) {
        deliverTranscript(recognition);
        return;
      }

      if (segmentsRef.current.length >= maxSegments) {
        deliverTranscript(recognition);
        return;
      }

      // Safari killed the session — pause briefly then reconnect
      setStateInner('paused-between-segments');
      restartTimeoutRef.current = setTimeout(() => {
        restartTimeoutRef.current = null;
        try {
          recognition.start();
          setStateInner('recording');
        } catch (e) {
          console.error('useSpeechRecognition: restart failed', e);
          deliverTranscript(recognition);
        }
      }, RESTART_DELAY_MS);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('useSpeechRecognition: error', event.error);

      // Non-fatal: 'no-speech' = user hasn't spoken yet; 'aborted' = we called .stop()
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      // Permission denied — show error briefly, then return to idle
      if (event.error === 'not-allowed') {
        recognitionRef.current = null;
        setError('Microphone access denied.');
        setStateInner('error');
        setTimeout(() => { setStateInner('idle'); setError(null); }, 2000);
        return;
      }

      setError(event.error);

      // Any other error (audio-capture, network…) — deliver what we have
      deliverTranscript(recognition);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setStateInner('recording');
  }

  // ---- Stop the current recording ----
  function stopRecording() {
    userStoppedRef.current = true;

    // If we're between segments (restart pending but not started),
    // cancel the restart and deliver directly — no active session to stop.
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
      deliverTranscript(recognitionRef.current);
      return;
    }

    // Active session — stop it; onend will see userStoppedRef = true
    // and call deliverTranscript from there.
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }

  // ---- Derived values ----
  const isRecording      = state === 'recording' || state === 'paused-between-segments';
  const fullLength       = segments.join(' ').length + interimText.length;
  const progressPct      = Math.min(100, (fullLength / maxChars) * 100);
  const transcript       = [segments.join(' '), interimText].filter(Boolean).join(' ').trim();

  return {
    state,
    segments,
    interimText,
    progressPct,
    isRecording,
    speechSupported,
    startRecording,
    stopRecording,
    // Extended API
    isListening: isRecording,
    transcript,
    error,
    confidence,
  };
}
