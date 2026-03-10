// ============================================
// /api/thoughts — Insert a raw thought
// Voice-to-Build Pipeline — Stage 2
// Called by VoiceCapture after speech recognition finishes
// or after the user submits the text fallback input.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Verify the user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate body
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (text.trim().length > 5000) {
      return NextResponse.json(
        { error: 'text must be 5000 characters or fewer' },
        { status: 400 }
      );
    }

    // Insert the thought
    const { data, error } = await supabase
      .from('raw_thoughts')
      .insert({ text: text.trim(), user_id: user.id })
      .select()
      .single();

    if (error) {
      console.error('/api/thoughts insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save thought' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, thought: data });
  } catch (error) {
    console.error('/api/thoughts unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
