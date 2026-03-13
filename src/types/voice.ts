// ============================================
// Voice Communication Interface types
// ============================================

// A saved voice conversation (maps to voice_conversations table)
export interface VoiceMessage {
  id: string;
  user_id: string;
  transcript: string;
  assistant_response: string | null;
  audio_duration: number | null;
  created_at: string;
}

// Configuration for the speech recognition engine
export interface SpeechConfig {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
}

// Current state of the audio subsystem
export interface AudioState {
  isListening: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  volume: number;
  selectedVoice: SpeechSynthesisVoice | null;
}
