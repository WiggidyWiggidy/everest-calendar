// ============================================
// POST /api/system/propose
// Creates a system_proposals row, sends a WhatsApp message to Tom
// for APPROVE/REJECT, and logs to agent_activity_log.
//
// Auth: API key (X-API-Key header) — same key as inbox ingest.
// OpenClaw and Cowork agents call this when they identify improvements.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAgentActivity } from '@/lib/logAgentActivity';
import { sendViaGreenApi } from '@/lib/greenApi';

function isAuthorized(request: NextRequest): boolean {
  const key = request.headers.get('x-api-key');
  const expected = process.env.INBOX_INGEST_KEY;
  if (!expected) return true; // dev mode
  return key === expected;
}

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  schema_change:       'Schema Change',
  prompt_update:       'Prompt Update',
  new_directive:       'New Directive Type',
  code_change:         'Code Change',
  process_improvement: 'Process Improvement',
  bug_fix:             'Bug Fix',
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      proposed_by,
      proposal_type,
      title,
      description,
      rationale,
      evidence,
      estimated_impact,
      implementation_notes,
      metadata,
    } = body as Record<string, string | undefined>;

    // Validate required fields
    if (!proposed_by || !proposal_type || !title || !description) {
      return NextResponse.json(
        { error: 'proposed_by, proposal_type, title, and description are required' },
        { status: 400 }
      );
    }

    const validTypes = ['schema_change', 'prompt_update', 'new_directive', 'code_change', 'process_improvement', 'bug_fix'];
    if (!validTypes.includes(proposal_type)) {
      return NextResponse.json({ error: `Invalid proposal_type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Insert proposal
    const { data: proposal, error: insertErr } = await supabase
      .from('system_proposals')
      .insert({
        proposed_by,
        proposal_type,
        title,
        description,
        rationale:            rationale ?? null,
        evidence:             evidence ?? null,
        estimated_impact:     estimated_impact ?? null,
        implementation_notes: implementation_notes ?? null,
        status:               'pending',
        metadata:             metadata ? JSON.parse(JSON.stringify(metadata)) : {},
      })
      .select('id')
      .single();

    if (insertErr || !proposal) {
      console.error('[system/propose] insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 });
    }

    const proposalId = proposal.id as string;

    // 2. Format WhatsApp message (max 1500 chars)
    const typeLabel = PROPOSAL_TYPE_LABELS[proposal_type] ?? proposal_type;
    const parts = [
      `🔧 *SYSTEM PROPOSAL*`,
      `From: ${proposed_by}`,
      `Type: ${typeLabel}`,
      ``,
      `*${title}*`,
      ``,
      description,
    ];
    if (rationale)        parts.push(``, `*Why:* ${rationale}`);
    if (estimated_impact) parts.push(`*Impact:* ${estimated_impact}`);
    if (evidence)         parts.push(`*Evidence:* ${evidence}`);
    parts.push(``, `Reply *APPROVE ${proposalId}* or *REJECT ${proposalId}* or give feedback`);

    let waMessage = parts.join('\n');
    if (waMessage.length > 1500) {
      waMessage = waMessage.slice(0, 1460) + '\n…(truncated)';
      waMessage += `\n\nReply *APPROVE ${proposalId}* or *REJECT ${proposalId}*`;
    }

    // 3. Send WhatsApp to Tom
    const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
    let whatsappMessageId: string | null = null;

    try {
      const sendErr = await sendViaGreenApi(waMessage, ownerPhone ?? undefined);
      if (sendErr) {
        console.error('[system/propose] WhatsApp send error:', sendErr);
      } else {
        whatsappMessageId = `wa_${Date.now()}`;
      }
    } catch (waErr) {
      console.error('[system/propose] WhatsApp threw:', waErr);
      // Best-effort — don't fail the endpoint
    }

    // 4. Update proposal with WhatsApp info
    await supabase
      .from('system_proposals')
      .update({
        whatsapp_sent_at:   new Date().toISOString(),
        whatsapp_message_id: whatsappMessageId,
      })
      .eq('id', proposalId);

    // 5. Log activity
    await logAgentActivity({
      agentName:    proposed_by,
      agentSource:  'cowork',
      activityType: 'info',
      description:  `System proposal created: "${title}" (${typeLabel})`,
      domain:       'system',
      metadata:     { proposal_id: proposalId, proposal_type },
    });

    return NextResponse.json({ success: true, proposal_id: proposalId });
  } catch (err) {
    console.error('[system/propose] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
