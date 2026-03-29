// ============================================
// PATCH /api/inbox/[id]
// Actions: approve | edit | reject | snooze
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendViaGreenApi } from '@/lib/greenApi';
import { logAgentActivity } from '@/lib/logAgentActivity';

// ── Learning loop: log corrections for trust scoring ──────────
async function logCorrection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  item: { id: string; platform: string; contact_identifier: string | null; draft_reply: string | null },
  finalReply: string | null,
  action: 'approve' | 'edit' | 'reject'
) {
  if (!item.draft_reply) return;
  const draft = item.draft_reply;
  const final = finalReply ?? '';

  let correctionType: string;
  if (action === 'reject') {
    correctionType = 'rejected';
  } else if (action === 'approve') {
    correctionType = 'approved_unchanged';
  } else {
    // Calculate word-level edit distance
    const draftWords = draft.toLowerCase().split(/\s+/);
    const finalWords = final.toLowerCase().split(/\s+/);
    const maxLen = Math.max(draftWords.length, finalWords.length);
    if (maxLen === 0) { correctionType = 'approved_unchanged'; }
    else {
      let changes = 0;
      for (let i = 0; i < maxLen; i++) {
        if (draftWords[i] !== finalWords[i]) changes++;
      }
      const changeRatio = changes / maxLen;
      correctionType = changeRatio < 0.3 ? 'minor_edit' : 'major_rewrite';
    }
  }

  const contactKey = item.contact_identifier ?? 'unknown';
  try {
    await supabase.from('draft_corrections').insert({
      inbox_id: item.id,
      contact_key: contactKey,
      platform: item.platform,
      original_draft: draft,
      final_reply: final,
      correction_type: correctionType,
    });

    // Update trust score on communication_protocols if exists
    const delta = {
      'approved_unchanged': 0.05,
      'minor_edit': 0.02,
      'major_rewrite': -0.10,
      'rejected': -0.20,
    }[correctionType] ?? 0;

    if (delta !== 0) {
      const { data: protocols } = await supabase
        .from('communication_protocols')
        .select('id, trust_score')
        .eq('contact_key', contactKey)
        .eq('is_active', true)
        .limit(1);

      if (protocols && protocols.length > 0) {
        const current = protocols[0].trust_score ?? 0;
        const newScore = Math.max(0, Math.min(1, current + delta));
        await supabase
          .from('communication_protocols')
          .update({ trust_score: newScore })
          .eq('id', protocols[0].id);
      }
    }
  } catch (err) {
    console.error('[inbox] correction logging error:', err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { action, custom_reply } = body as { action: string; custom_reply?: string };

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

    // Platform-specific send logic
    let sendChannel: string = 'pending_manual';

    if (item.platform === 'whatsapp') {
      // WhatsApp: send via Green API
      const sendErr = await sendViaGreenApi(item.draft_reply, item.contact_identifier ?? undefined);
      if (sendErr) {
        console.error('/api/inbox/[id] approve send error:', sendErr);
        return NextResponse.json({ error: `WhatsApp send failed: ${sendErr}` }, { status: 502 });
      }
      sendChannel = 'whatsapp';
    } else if (item.platform === 'alibaba') {
      // Alibaba: mark as approved, ATLAS sends via Chrome or Tom copies
      sendChannel = 'chrome_alibaba';
    } else if (item.platform === 'upwork') {
      sendChannel = 'chrome_upwork';
    }

    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'approved', final_reply: item.draft_reply, approved_at: now })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await logAgentActivity({
      agentName:    'tom',
      agentSource:  'cowork',
      activityType: 'approval',
      description:  `Inbox item approved for ${item.platform}:${item.contact_name ?? item.contact_identifier}`,
      domain:       item.platform === 'upwork' ? 'hiring' : item.platform === 'alibaba' ? 'supplier' : 'design',
      metadata:     { inbox_id: id, platform: item.platform, send_channel: sendChannel },
    });

    // Log correction for learning loop
    await logCorrection(supabase, item, item.draft_reply, 'approve');

    // Mark the linked cowork draft as sent
    if (item.cowork_message_inbound_id) {
      await supabase
        .from('cowork_messages')
        .update({ status: 'sent', sent_at: now })
        .eq('parent_id', item.cowork_message_inbound_id)
        .eq('status', 'draft');
    }

    return NextResponse.json({
      item: updated,
      send_channel: sendChannel,
      alibaba_url: item.platform === 'alibaba' ? item.contact_identifier : undefined,
    });
  }

  if (action === 'edit') {
    if (!custom_reply?.trim()) {
      return NextResponse.json({ error: 'custom_reply is required for edit action' }, { status: 400 });
    }

    // Platform-specific send logic
    let sendChannel: string = 'pending_manual';

    if (item.platform === 'whatsapp') {
      const sendErr = await sendViaGreenApi(custom_reply, item.contact_identifier ?? undefined);
      if (sendErr) {
        console.error('/api/inbox/[id] edit send error:', sendErr);
        return NextResponse.json({ error: `WhatsApp send failed: ${sendErr}` }, { status: 502 });
      }
      sendChannel = 'whatsapp';
    } else if (item.platform === 'alibaba') {
      sendChannel = 'chrome_alibaba';
    } else if (item.platform === 'upwork') {
      sendChannel = 'chrome_upwork';
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

    await logAgentActivity({
      agentName:    'tom',
      agentSource:  'cowork',
      activityType: 'approval',
      description:  `Inbox item edited for ${item.platform}:${item.contact_name ?? item.contact_identifier}`,
      domain:       item.platform === 'upwork' ? 'hiring' : item.platform === 'alibaba' ? 'supplier' : 'design',
      metadata:     { inbox_id: id, platform: item.platform, send_channel: sendChannel },
    });

    await logCorrection(supabase, item, custom_reply ?? null, 'edit');

    return NextResponse.json({
      item: updated,
      send_channel: sendChannel,
      alibaba_url: item.platform === 'alibaba' ? item.contact_identifier : undefined,
    });
  }

  if (action === 'reject') {
    const { data: updated, error: updateErr } = await supabase
      .from('platform_inbox')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await logAgentActivity({
      agentName:    'tom',
      agentSource:  'cowork',
      activityType: 'decision',
      description:  `Inbox item rejected from ${item.platform}:${item.contact_name ?? item.contact_identifier}`,
      domain:       item.platform === 'upwork' ? 'hiring' : item.platform === 'alibaba' ? 'supplier' : 'design',
      metadata:     { inbox_id: id, platform: item.platform },
    });

    // Log correction for learning loop
    await logCorrection(supabase, item, null, 'reject');

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

  return NextResponse.json({ error: 'Invalid action. Use: approve | edit | reject | snooze' }, { status: 400 });
}
