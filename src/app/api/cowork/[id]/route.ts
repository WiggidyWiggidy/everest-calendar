// ============================================
// /api/cowork/[id]
// PATCH  — edit draft content or send it (session auth)
// DELETE — discard a draft (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendViaGreenApi } from '@/lib/greenApi';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { action, content } = body;
    // action: 'send' | 'save'

    if (action === 'send') {
      // Resolve content to send (may be edited in the request body)
      let textToSend = content?.trim();

      if (!textToSend) {
        const { data: existing, error: fetchErr } = await supabase
          .from('cowork_messages')
          .select('content, status')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (fetchErr || !existing) {
          return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }
        if (existing.status !== 'draft') {
          return NextResponse.json({ error: 'Message is not a draft' }, { status: 400 });
        }
        textToSend = existing.content;
      }

      const sendError = await sendViaGreenApi(textToSend);
      if (sendError) {
        return NextResponse.json({ error: sendError }, { status: 502 });
      }

      const updatePayload: Record<string, unknown> = {
        status:  'sent',
        sent_at: new Date().toISOString(),
      };
      if (content?.trim()) updatePayload.content = content.trim();

      const { data, error } = await supabase
        .from('cowork_messages')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .select()
        .single();

      if (error) {
        console.error('/api/cowork/[id] PATCH send error:', error);
        return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
      }

      return NextResponse.json({ message: data });
    }

    // action === 'save' — update draft content only
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('cowork_messages')
      .update({ content: content.trim() })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) {
      console.error('/api/cowork/[id] PATCH save error:', error);
      return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  } catch (err) {
    console.error('/api/cowork/[id] PATCH unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const { error } = await supabase
      .from('cowork_messages')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'draft');

    if (error) {
      console.error('/api/cowork/[id] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to discard draft' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('/api/cowork/[id] DELETE unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
