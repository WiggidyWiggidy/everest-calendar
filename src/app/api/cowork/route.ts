// ============================================
// /api/cowork
// GET  — list messages (session auth)
// POST — compose + send immediately, or save draft (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendViaGreenApi } from '@/lib/greenApi';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('cowork_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('/api/cowork GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({ messages: data });
  } catch (err) {
    console.error('/api/cowork GET unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { content, parent_id, send_immediately = false } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    if (send_immediately) {
      const sendError = await sendViaGreenApi(content.trim());
      if (sendError) {
        return NextResponse.json({ error: sendError }, { status: 502 });
      }

      const { data, error } = await supabase
        .from('cowork_messages')
        .insert({
          user_id:   user.id,
          status:    'sent',
          direction: 'outbound',
          content:   content.trim(),
          parent_id: parent_id ?? null,
          sent_at:   new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('/api/cowork POST send error:', error);
        return NextResponse.json({ error: 'Failed to save sent message' }, { status: 500 });
      }

      return NextResponse.json({ message: data });
    }

    // Save as draft
    const { data, error } = await supabase
      .from('cowork_messages')
      .insert({
        user_id:   user.id,
        status:    'draft',
        direction: 'outbound',
        content:   content.trim(),
        parent_id: parent_id ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('/api/cowork POST draft error:', error);
      return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
    }

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (err) {
    console.error('/api/cowork POST unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
