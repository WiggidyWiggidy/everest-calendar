// ============================================
// /api/voice/chat
// Receives a spoken transcript, processes it with Claude, saves to
// voice_conversations, and returns the text response to be spoken aloud.
//
// Optimised for voice: short, natural responses with no markdown formatting.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const today = new Date().toISOString().split('T')[0];

const VOICE_SYSTEM_PROMPT = `You are Everest, a personal assistant responding through a voice interface.
Keep responses concise and conversational — they will be read aloud.
Avoid markdown, bullet points, numbered lists, asterisks, or any formatting.
Speak in 1–3 natural sentences unless the user explicitly asks for more detail.
Be direct and confident. Today is ${today}.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { transcript, audio_duration } = await request.json();

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    // Call Claude with voice-optimised prompt (no tool use — keeps latency low)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: VOICE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript.trim() }],
      }),
    });

    if (!response.ok) {
      console.error('voice/chat: Claude API error', await response.text());
      return NextResponse.json({ error: 'Claude API error' }, { status: 500 });
    }

    const aiData = await response.json();
    const assistantResponse: string = aiData.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join(' ');

    // Persist to voice_conversations (best-effort — don't fail if table missing)
    const { error: saveError } = await supabase.from('voice_conversations').insert({
      user_id: user.id,
      transcript: transcript.trim(),
      assistant_response: assistantResponse,
      audio_duration: audio_duration ?? null,
    });

    if (saveError) {
      console.error('voice/chat: failed to save conversation:', saveError.message);
    }

    return NextResponse.json({
      transcript: transcript.trim(),
      assistant_response: assistantResponse,
    });
  } catch (error) {
    console.error('voice/chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
