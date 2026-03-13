// ============================================
// Audio error handler
// Microphone permissions, browser compatibility, and network failures
// ============================================

export type AudioErrorType =
  | 'permission-denied'
  | 'not-supported'
  | 'network-error'
  | 'no-speech'
  | 'audio-capture'
  | 'unknown';

export interface AudioError {
  type: AudioErrorType;
  message: string;
  recoverable: boolean;
}

export function classifyError(error: string | Error | unknown): AudioError {
  const errorStr =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : String(error);

  if (errorStr.includes('not-allowed') || errorStr.includes('permission')) {
    return {
      type: 'permission-denied',
      message: 'Microphone access denied. Allow microphone access and try again.',
      recoverable: false,
    };
  }

  if (errorStr.includes('not-supported') || errorStr.includes('not supported')) {
    return {
      type: 'not-supported',
      message: 'Voice recording is not supported in this browser. Try Chrome or Edge.',
      recoverable: false,
    };
  }

  if (errorStr.includes('network') || errorStr.includes('fetch')) {
    return {
      type: 'network-error',
      message: 'Network error. Check your connection and try again.',
      recoverable: true,
    };
  }

  if (errorStr.includes('no-speech')) {
    return {
      type: 'no-speech',
      message: 'No speech detected. Try speaking closer to your microphone.',
      recoverable: true,
    };
  }

  if (errorStr.includes('audio-capture')) {
    return {
      type: 'audio-capture',
      message: 'Could not capture audio. Check your microphone connection.',
      recoverable: true,
    };
  }

  return {
    type: 'unknown',
    message: 'An unexpected error occurred. Please try again.',
    recoverable: true,
  };
}

export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
