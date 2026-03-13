'use client';

// ============================================
// useSpeechSynthesis
// Hook for text-to-speech with voice selection and playback controls
// ============================================

import { useState, useEffect } from 'react';

interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  setSelectedVoice: (voice: SpeechSynthesisVoice | null) => void;
  isSupported: boolean;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused]     = useState(false);
  const [voices, setVoices]         = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load available voices (they load async in Chrome)
  useEffect(() => {
    if (!isSupported) return;

    function loadVoices() {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      // Auto-select an English voice on first load
      setSelectedVoice((prev) => {
        if (prev || available.length === 0) return prev;
        return available.find((v) => v.lang.startsWith('en')) ?? available[0];
      });
    }

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  function speak(text: string) {
    if (!isSupported || !text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = 0.95;
    utterance.pitch  = 1;
    utterance.volume = 1;

    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart  = () => { setIsSpeaking(true);  setIsPaused(false); };
    utterance.onend    = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror  = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onpause  = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);

    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }

  function pause() {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }

  function resume() {
    if (!isSupported) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    voices,
    selectedVoice,
    setSelectedVoice,
    isSupported,
  };
}
