'use client';

import { usePathname } from 'next/navigation';
import VoiceCapture from './VoiceCapture';

export default function ConditionalVoiceCapture() {
  const pathname = usePathname();
  if (pathname === '/inbox') return null;
  return <VoiceCapture />;
}
