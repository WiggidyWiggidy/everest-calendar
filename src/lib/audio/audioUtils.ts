// ============================================
// Audio utilities
// Blob conversion, compression, and format validation for cross-browser compatibility
// ============================================

export type SupportedAudioFormat = 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/wav';

/** Returns the best supported MediaRecorder format for the current browser */
export function getBestSupportedFormat(): SupportedAudioFormat {
  const formats: SupportedAudioFormat[] = [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/wav',
  ];

  for (const format of formats) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(format)) {
      return format;
    }
  }

  return 'audio/webm';
}

/** Convert an audio Blob to a base64 data URL */
export function audioBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert a base64 data URL back to a Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'audio/webm';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/** Validate that a Blob is a supported audio format */
export function isValidAudioBlob(blob: Blob): boolean {
  return blob.size > 0 && blob.type.startsWith('audio/');
}

/** Get audio duration from a Blob in seconds */
export function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(0);
    });
    audio.src = url;
  });
}

/** Format seconds as m:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
