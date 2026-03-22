export const dynamic = 'force-dynamic';

// ============================================
// GET /api/cron/process-directives
// Vercel cron — runs every 15 minutes.
// Reads orchestrator_directives WHERE status='pending',
// fires handlers per directive_type, updates status, logs activity.
//
// Security: Vercel sets CRON_SECRET; all requests must include it
// via Authorization: Bearer header (Vercel injects automatically).
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAgentActivity } from '@/lib/logAgentActivity';
import { sendViaGreenApi } from '@/lib/greenApi';

// Validate that this is a Vercel cron call
function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // not set → local dev, allow
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${cronSecret}`;
}

interface OrchestratorDirective {
  id:            string;
  directive_type: string;
  target_agent:  string | null;
  target_inbox_id: string | null;
  instruction:   string | null;
  status:        string;
  priority:      string;
  source_agent:  string | null;
  metadata:      Record<string, unknown>;
  created_at:    string;
}

// ── Directive handlers ────────────────────────────────────────────────────────

async function handleEngineerScreeningComplete(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const candidateId = directive.metadata?.candidate_id as string | undefined;
  if (!candidateId) throw new Error('missing metadata.candidate_id');

  const { data: candidate, error: fetchErr } = await supabase
    .from('upwork_candidates')
    .select('id, name, screening_status')
    .eq('id', candidateId)
    .single();

  if (fetchErr || !candidate) throw new Error(`candidate ${candidateId} not found`);

  // Move to pilot_ready if they were screened
  if (candidate.screening_status === 'screened') {
    await supabase
      .from('upwork_candidates')
      .update({ screening_status: 'pilot_ready' })
      .eq('id', candidateId);
  }

  // Create a message_draft for review
  await supabase.from('message_drafts').insert({
    contact_key:   'upwork_candidate',
    contact_name:  candidate.name,
    message_type:  'follow_up',
    draft_content: `Screening complete for ${candidate.name}. Recommend moving to pilot session.`,
    drafted_by:    'orchestrator',
    status:        'pending_review',
  });

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'decision',
    description:  `Screening complete for ${candidate.name} — moved to pilot_ready, draft created`,
    domain:       'hiring',
    metadata:     { candidate_id: candidateId },
  });
}

async function handleSupplierResponded(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const manufacturerId = directive.metadata?.manufacturer_id as string | undefined;
  if (!manufacturerId) throw new Error('missing metadata.manufacturer_id');

  const { data: mfr, error: mfrErr } = await supabase
    .from('manufacturer_shortlist')
    .select('id, name, outreach_status')
    .eq('id', manufacturerId)
    .single();

  if (mfrErr || !mfr) throw new Error(`manufacturer ${manufacturerId} not found`);

  // Find latest platform_inbox item for this supplier
  const { data: inboxItem } = await supabase
    .from('platform_inbox')
    .select('id, ai_recommendation, raw_content')
    .eq('platform', 'alibaba')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from('message_drafts').insert({
    contact_key:   'alibaba_supplier',
    contact_name:  mfr.name,
    message_type:  'supplier_follow_up',
    draft_content: inboxItem?.ai_recommendation ?? `Supplier ${mfr.name} responded. Review their latest message and draft a reply.`,
    drafted_by:    'orchestrator',
    status:        'pending_review',
    metadata:      { manufacturer_id: manufacturerId, inbox_id: inboxItem?.id },
  });

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'draft',
    description:  `Draft created for supplier ${mfr.name} response`,
    domain:       'supplier',
    metadata:     { manufacturer_id: manufacturerId },
  });
}

async function handleDesignerMessageReceived(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const coworkMessageId = directive.metadata?.cowork_message_id as string | undefined;
  if (!coworkMessageId) throw new Error('missing metadata.cowork_message_id');

  const { data: msg, error: msgErr } = await supabase
    .from('cowork_messages')
    .select('id, content, direction')
    .eq('id', coworkMessageId)
    .single();

  if (msgErr || !msg) throw new Error(`cowork_message ${coworkMessageId} not found`);

  await supabase.from('message_drafts').insert({
    contact_key:   'cad_designer',
    contact_name:  'Imran',
    message_type:  'cad_feedback',
    draft_content: `Designer sent: "${msg.content}". Review and respond.`,
    drafted_by:    'orchestrator',
    status:        'pending_review',
    in_reply_to_message_id: coworkMessageId,
    metadata:      { cowork_message_id: coworkMessageId },
  });

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'draft',
    description:  'CAD designer message received — draft feedback created for review',
    domain:       'design',
    metadata:     { cowork_message_id: coworkMessageId },
  });
}

async function handleBuildRequired(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const taskId = directive.metadata?.task_backlog_id as string | undefined;
  if (!taskId) throw new Error('missing metadata.task_backlog_id');

  await supabase
    .from('task_backlog')
    .update({ status: 'in-progress' })
    .eq('id', taskId);

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'auto_action',
    description:  `Task ${taskId} flagged for build — status set to in-progress`,
    domain:       'system',
    metadata:     { task_backlog_id: taskId },
  });
}

async function handleAgentHealthAlert(directive: OrchestratorDirective): Promise<void> {
  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  const message = directive.instruction
    ?? `⚠️ Agent health alert: ${directive.source_agent ?? 'unknown agent'} — ${JSON.stringify(directive.metadata)}`;
  await sendViaGreenApi(message, ownerPhone ?? undefined);

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'error',
    description:  `Health alert sent via WhatsApp: ${message.slice(0, 80)}`,
    domain:       'system',
    metadata:     directive.metadata,
  });
}

async function handleDirectiveOverdue(
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const now = new Date().toISOString();
  const { data: overdue } = await supabase
    .from('orchestrator_directives')
    .select('id, directive_type')
    .lt('valid_until', now)
    .eq('status', 'pending');

  if (!overdue?.length) return;

  const ids = overdue.map(d => d.id);
  await supabase
    .from('orchestrator_directives')
    .update({ status: 'cancelled' })
    .in('id', ids);

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  const summary = `⚠️ ${overdue.length} directive(s) expired and cancelled:\n` +
    overdue.map(d => `• ${d.directive_type}`).join('\n');
  await sendViaGreenApi(summary, ownerPhone ?? undefined);

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'info',
    description:  `${overdue.length} overdue directives cancelled`,
    domain:       'system',
    metadata:     { cancelled_ids: ids },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now      = new Date().toISOString();
  let processed  = 0;
  let errors     = 0;

  // Handle expired directives first
  await handleDirectiveOverdue(supabase).catch(err =>
    console.error('[process-directives] directive_overdue error:', err)
  );

  // Fetch pending directives (within valid_until or no expiry)
  const { data: directives, error: fetchErr } = await supabase
    .from('orchestrator_directives')
    .select('*')
    .eq('status', 'pending')
    .or(`valid_until.is.null,valid_until.gt.${now}`)
    .order('priority', { ascending: true })   // critical before medium before low
    .order('created_at', { ascending: true });

  if (fetchErr) {
    console.error('[process-directives] fetch error:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!directives?.length) {
    return NextResponse.json({ processed: 0, errors: 0, message: 'No pending directives' });
  }

  for (const directive of directives as OrchestratorDirective[]) {
    // Mark acknowledged
    await supabase
      .from('orchestrator_directives')
      .update({ status: 'acknowledged', acknowledged_at: now })
      .eq('id', directive.id);

    await logAgentActivity({
      agentName:    'orchestrator',
      agentSource:  'vercel',
      activityType: 'auto_action',
      description:  `Processing directive: ${directive.directive_type} (${directive.priority} priority)`,
      domain:       'system',
      metadata:     { directive_id: directive.id },
    });

    try {
      switch (directive.directive_type) {
        case 'engineer_screening_complete':
          await handleEngineerScreeningComplete(directive, supabase);
          break;
        case 'supplier_responded':
          await handleSupplierResponded(directive, supabase);
          break;
        case 'designer_message_received':
          await handleDesignerMessageReceived(directive, supabase);
          break;
        case 'build_required':
          await handleBuildRequired(directive, supabase);
          break;
        case 'agent_health_alert':
          await handleAgentHealthAlert(directive);
          break;
        case 'directive_overdue':
          // Already handled above — mark complete
          break;
        default:
          console.warn(`[process-directives] unknown directive_type: ${directive.directive_type}`);
      }

      // Success — mark completed
      await supabase
        .from('orchestrator_directives')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', directive.id);

      processed++;
    } catch (err) {
      errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[process-directives] error on ${directive.directive_type}:`, errMsg);

      const currentMeta = (directive.metadata ?? {}) as Record<string, unknown>;
      const retryCount  = ((currentMeta.retry_count as number) ?? 0) + 1;

      if (retryCount >= 3) {
        // Max retries — cancel and alert
        await supabase
          .from('orchestrator_directives')
          .update({
            status:   'cancelled',
            metadata: { ...currentMeta, retry_count: retryCount, last_error: errMsg },
          })
          .eq('id', directive.id);

        const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
        await sendViaGreenApi(
          `⚠️ Directive failed after 3 retries:\n${directive.directive_type}\nError: ${errMsg.slice(0, 200)}`,
          ownerPhone ?? undefined
        ).catch(() => {});
      } else {
        // Reset to pending with incremented retry count
        await supabase
          .from('orchestrator_directives')
          .update({
            status:   'pending',
            metadata: { ...currentMeta, retry_count: retryCount, last_error: errMsg },
          })
          .eq('id', directive.id);
      }

      await logAgentActivity({
        agentName:    'orchestrator',
        agentSource:  'vercel',
        activityType: 'error',
        description:  `Directive ${directive.directive_type} failed (retry ${retryCount}/3): ${errMsg.slice(0, 120)}`,
        domain:       'system',
        metadata:     { directive_id: directive.id, retry_count: retryCount },
      });
    }
  }

  // Summary log
  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'auto_action',
    description:  `Directive run complete — ${processed} processed, ${errors} errors`,
    domain:       'system',
    metadata:     { processed, errors, total: directives.length },
  });

  return NextResponse.json({ processed, errors, total: directives.length });
}
