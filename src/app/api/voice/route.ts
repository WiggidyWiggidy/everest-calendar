import { NextRequest, NextResponse } from 'next/server';
import { sendAudioViaGreenApi, sendViaGreenApi } from '@/lib/greenApi';
import { createClient } from '@supabase/supabase-js';

// POST /api/voice — send voice note via Green API
// Called by OpenClaw voice skill: uploads audio to Supabase Storage,
// then hits this endpoint with the public URL
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.WHATSAPP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { audioUrl, text, phone } = body;

  if (!audioUrl && !text) {
    return NextResponse.json({ error: 'audioUrl or text required' }, { status: 400 });
  }

  // Send audio if URL provided
  if (audioUrl) {
    const err = await sendAudioViaGreenApi(audioUrl, phone);
    if (err) {
      return NextResponse.json({ error: err }, { status: 500 });
    }
    return NextResponse.json({ ok: true, type: 'audio' });
  }

  // Fallback: send text
  const err = await sendViaGreenApi(text, phone);
  if (err) {
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json({ ok: true, type: 'text' });
}
