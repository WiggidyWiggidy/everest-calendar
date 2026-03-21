// ============================================
// PATCH /api/inbox/[id]
// Actions: approve | edit | reject | snooze | transition
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendViaGreenApi } from '@/lib/greenApi';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { action, custom_reply, phone, intro_message } = body as {
    action: string;
    custom_reply?: string;
    phone?: string;
    intro_message?: string;
  };

  // Fetch the inbox item
  const { data: item, error: fetchError } = await supabase
    .from('platform_inbox')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    if (!item.draft_reply) {
      return NextResponse.json({ error: 'No draft reply to send' }, { status: 400 });
    }
    const sendErr = await sendViaGreenApi(item.draft_reply, item.contact_identifier ?? undefined);
    if (sendErr) {
      console.error('/api/inbox/[id] approve send error:', sendErr);
      return NextResponse.json({ error: `WhatsApp send failed: ${sendErr}` }, { status: 502 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'approved', final_reply: item.draft_reply, approved_at: now })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Mark the linked cowork draft as sent
    if (item.cowork_message_inbound_id) {
      await supabase
        .from('cowork_messages')
        .update({ status: 'sent', sent_at: now })
        .eq('parent_id', item.cowork_message_inbound_id)
        .eq('status', 'draft');
    }

    return NextResponse.json({ item: updated });
  }

  if (action === 'edit') {
    if (!custom_reply?.trim()) {
      return NextResponse.json({ error: 'custom_reply is required for edit action' }, { status: 400 });
    }
    const sendErr = await sendViaGreenApi(custom_reply, item.contact_identifier ?? undefined);
    if (sendErr) {
      console.error('/api/inbox/[id] edit send error:', sendErr);
      return NextResponse.json({ error: `WhatsApp send failed: ${sendErr}` }, { status: 502 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'edited', final_reply: custom_reply, approved_at: now })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (item.cowork_message_inbound_id) {
      await supabase
        .from('cowork_messages')
        .update({ status: 'sent', sent_at: now, content: custom_reply })
        .eq('parent_id', item.cowork_message_inbound_id)
        .eq('status', 'draft');
    }

    return NextResponse.json({ item: updated });
  }

  if (action === 'reject') {
    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ item: updated });
  }

  if (action === 'snooze') {
    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'snoozed' })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ item: updated });
  }

  if (action === 'transition') {
    // Validate inputs
    if (!phone || !/^\d+$/.test(phone)) {
      return NextResponse.json({ error: 'phone must be digits only (e.g. 61412345678)' }, { status: 400 });
    }
    if (!intro_message?.trim()) {
      return NextResponse.json({ error: 'intro_message is required' }, { status: 400 });
    }

    // Send intro via WhatsApp
    const sendErr = await sendViaGreenApi(intro_message, phone);
    if (sendErr) {
      console.error('/api/inbox/[id] transition send error:', sendErr);
      return NextResponse.json({ error: `WhatsApp send failed: ${sendErr}` }, { status: 502 });
    }

    // Mark inbox item as transitioned
    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'transitioned', final_reply: intro_message, approved_at: now })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Log the intro message to cowork_messages so it appears in the thread
    await supabase.from('cowork_messages').insert({
      user_id:    user.id,
      direction:  'outbound',
      status:     'sent',
      content:    intro_message,
      sent_at:    now,
    });

    // If this item is linked to an Upwork candidate, mark them as hired
    if (item.candidate_id) {
      await supabase
        .from('upwork_candidates')
        .update({ status: 'hired' })
        .eq('id', item.candidate_id);
    }

    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: 'Invalid action. Use: approve | edit | reject | snooze | transition' }, { status: 400 });
}
