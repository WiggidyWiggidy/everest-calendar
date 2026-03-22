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

  // Standing-rule directives have no manufacturer_id — just acknowledge and notify
  if (!manufacturerId) {
    const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
    await sendViaGreenApi(
      `🏭 Supplier reply protocol active:\n${(directive.instruction ?? '').slice(0, 300)}`,
      ownerPhone ?? undefined
    ).catch(() => {});
    await logAgentActivity({
      agentName:    'orchestrator',
      agentSource:  'vercel',
      activityType: 'info',
      description:  'Supplier-responded standing rule acknowledged',
      domain:       'supplier',
      metadata:     directive.metadata,
    });
    return;
  }

  const { data: mfr, error: mfrErr } = await supabase
    .from('manufacturer_shortlist')
    .select('id, name, outreach_status')
    .eq('id', manufacturerId)
    .single();

  if (mfrErr || !mfr) throw new Error(`manufacturer ${manufacturerId} not found`);

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

  if (taskId) {
    // Existing task — just flag it
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
  } else {
    // New build request — create task_backlog item from directive instruction
    const { data: newTask } = await supabase
      .from('task_backlog')
      .insert({
        title:       directive.metadata?.title as string ?? `Build required: ${directive.target_agent ?? 'unknown'}`,
        description: directive.instruction ?? 'See directive metadata for details.',
        priority:    directive.priority === 'critical' ? 'critical' : directive.priority === 'high' ? 'high' : 'medium',
        status:      'queued',
        source:      'orchestrator_directive',
        metadata:    { directive_id: directive.id, ...directive.metadata },
      })
      .select('id')
      .single();

    const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
    await sendViaGreenApi(
      `🏗️ Build task created:\n"${directive.instruction?.slice(0, 150) ?? 'See task_backlog for details'}"\n\nQueued for Claude Code to build.`,
      ownerPhone ?? undefined
    ).catch(() => {});

    await logAgentActivity({
      agentName:    'orchestrator',
      agentSource:  'vercel',
      activityType: 'auto_action',
      description:  `New build task created from directive: ${(newTask?.id ?? 'unknown').slice(0, 8)}`,
      domain:       'system',
      metadata:     { new_task_id: newTask?.id, directive_id: directive.id },
    });
  }
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

// ── NEW: spec_updated ────────────────────────────────────────────────────────
async function handleSpecUpdated(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const instruction = directive.instruction ?? 'Spec update received — review and communicate to relevant party.';
  const targetAgent  = directive.target_agent ?? 'engineer_communication';

  await supabase.from('message_drafts').insert({
    contact_key:   targetAgent,
    contact_name:  directive.metadata?.contact_name as string ?? targetAgent,
    message_type:  'spec_update',
    draft_content: instruction,
    drafted_by:    'orchestrator',
    status:        'pending_review',
    metadata:      directive.metadata,
  });

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  await sendViaGreenApi(
    `📐 Spec update directive queued for ${targetAgent}:\n"${instruction.slice(0, 200)}"\n\nCheck message drafts to review.`,
    ownerPhone ?? undefined
  );

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'draft',
    description:  `Spec update draft created for ${targetAgent}: ${instruction.slice(0, 80)}`,
    domain:       'design',
    metadata:     directive.metadata,
  });
}

// ── NEW: priority_override ───────────────────────────────────────────────────
async function handlePriorityOverride(
  directive: OrchestratorDirective
): Promise<void> {
  const instruction  = directive.instruction ?? 'Priority override — action required.';
  const targetAgent  = directive.target_agent ?? 'unknown';
  const ownerPhone   = process.env.OWNER_WHATSAPP_PHONE;

  const urgencyEmoji = directive.priority === 'critical' ? '🔴' : directive.priority === 'high' ? '🟠' : '🟡';

  await sendViaGreenApi(
    `${urgencyEmoji} Priority override for ${targetAgent}:\n${instruction}\n\nPriority: ${directive.priority?.toUpperCase() ?? 'HIGH'}`,
    ownerPhone ?? undefined
  );

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'auto_action',
    description:  `Priority override sent via WhatsApp for ${targetAgent}: ${instruction.slice(0, 80)}`,
    domain:       'system',
    metadata:     directive.metadata,
  });
}

// ── NEW: focus_thread ────────────────────────────────────────────────────────
async function handleFocusThread(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const instruction   = directive.instruction ?? 'Thread requires focused attention.';
  const targetAgent   = directive.target_agent ?? 'hiring_engineer';

  // Create an inbox item to surface this for review
  try {
    await supabase.rpc('create_inbox_item', {
      p_platform:           'system',
      p_contact_name:       targetAgent,
      p_contact_identifier: targetAgent,
      p_raw_content:        instruction,
      p_media_url:          null,
      p_media_type:         null,
      p_ai_summary:         `Focus required: ${instruction.slice(0, 100)}`,
      p_ai_recommendation:  instruction,
      p_draft_reply:        null,
      p_approval_tier:      2,
      p_cowork_message_inbound_id: null,
      p_candidate_id:       (directive.metadata?.candidate_id as string | null) ?? null,
    });
  } catch {
    // create_inbox_item rpc may not accept system platform — fall back to direct insert
    await supabase.from('platform_inbox').insert({
      platform:           'system',
      contact_name:       targetAgent,
      contact_identifier: targetAgent,
      raw_content:        instruction,
      ai_summary:         `Focus required: ${instruction.slice(0, 100)}`,
      ai_recommendation:  instruction,
      approval_tier:      2,
      status:             'pending',
    });
  }

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  await sendViaGreenApi(
    `🎯 Focus thread flagged for ${targetAgent}:\n"${instruction.slice(0, 200)}"\n\nCheck Inbox to review.`,
    ownerPhone ?? undefined
  );

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'handoff',
    description:  `Focus thread inbox item created for ${targetAgent}: ${instruction.slice(0, 80)}`,
    domain:       'hiring',
    metadata:     directive.metadata,
  });
}

// ── NEW: daily_briefing ──────────────────────────────────────────────────────
async function handleDailyBriefing(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;

  // Pull together a quick briefing from live data
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [pendingInboxRes, recentActivityRes, pendingDirectivesRes] = await Promise.all([
    supabase.from('platform_inbox').select('id, contact_name, ai_summary, approval_tier').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    supabase.from('agent_activity_log').select('agent_name, description, created_at').gte('created_at', ago24h).order('created_at', { ascending: false }).limit(5),
    supabase.from('orchestrator_directives').select('directive_type, priority').eq('status', 'pending').order('priority', { ascending: true }).limit(5),
  ]);

  const pendingItems    = pendingInboxRes.data ?? [];
  const recentActivity  = recentActivityRes.data ?? [];
  const pendingDirs     = pendingDirectivesRes.data ?? [];

  let briefing = `📊 *Daily Briefing — ${now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}*\n\n`;

  if (pendingItems.length) {
    briefing += `*Inbox (${pendingItems.length} pending):*\n`;
    for (const item of pendingItems) {
      const tier = item.approval_tier >= 3 ? '🔴' : item.approval_tier === 2 ? '🟠' : '🟡';
      briefing += `${tier} ${item.contact_name}: ${(item.ai_summary ?? '').slice(0, 80)}\n`;
    }
    briefing += '\n';
  } else {
    briefing += `✅ Inbox clear\n\n`;
  }

  if (pendingDirs.length) {
    briefing += `*Pending directives (${pendingDirs.length}):*\n`;
    for (const d of pendingDirs) {
      briefing += `• ${d.priority?.toUpperCase() ?? 'MED'}: ${d.directive_type}\n`;
    }
    briefing += '\n';
  }

  if (recentActivity.length) {
    briefing += `*Recent agent activity:*\n`;
    for (const a of recentActivity) {
      briefing += `• ${a.agent_name}: ${(a.description ?? '').slice(0, 60)}\n`;
    }
  }

  // Append any custom instruction from the directive
  if (directive.instruction) {
    briefing += `\n📝 ${directive.instruction}`;
  }

  await sendViaGreenApi(briefing, ownerPhone ?? undefined);

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'auto_action',
    description:  `Daily briefing sent via WhatsApp — ${pendingItems.length} inbox items, ${pendingDirs.length} pending directives`,
    domain:       'system',
    metadata:     { pending_inbox: pendingItems.length, pending_directives: pendingDirs.length },
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

// ── NEW: data_available ──────────────────────────────────────────────────────
async function handleDataAvailable(
  directive: OrchestratorDirective
): Promise<void> {
  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  const instruction = directive.instruction ?? 'New data available for agent.';
  await sendViaGreenApi(
    `📊 Data available for *${directive.target_agent ?? 'agent'}*:\n${instruction.slice(0, 300)}`,
    ownerPhone ?? undefined
  ).catch(() => {});
  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'info',
    description:  `Data-available notification sent for ${directive.target_agent}: ${instruction.slice(0, 80)}`,
    domain:       'system',
    metadata:     directive.metadata,
  });
}

// ── NEW: drawing_ready ───────────────────────────────────────────────────────
async function handleDrawingReady(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const instruction = directive.instruction ?? 'Drawing is ready — proceed with factory outreach.';

  await supabase.from('platform_inbox').insert({
    platform:           'system',
    contact_name:       'Chinese Negotiator',
    contact_identifier: 'chinese_negotiator',
    raw_content:        instruction,
    ai_summary:         'Drawing ready — send Phase 2 notifications to all Tier 1 factories.',
    ai_recommendation:  instruction,
    approval_tier:      1,
    status:             'pending',
    metadata:           directive.metadata,
  });

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  await sendViaGreenApi(
    `📐 Drawing ready trigger received.\n\nChinese Negotiator inbox item created. Send order: Demi (Xiang Xin Yu, site visit 28 Mar) first, then all others.\n\nCheck Inbox to review Phase 2 messages.`,
    ownerPhone ?? undefined
  ).catch(() => {});

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'handoff',
    description:  'Drawing-ready directive processed — inbox item created for Chinese Negotiator',
    domain:       'supplier',
    metadata:     directive.metadata,
  });
}

// ── NEW: all_suppliers_silent ────────────────────────────────────────────────
async function handleAllSuppliersSilent(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const escalationDate = directive.metadata?.escalation_date as string | undefined;
  const now = new Date();

  // Check if we've passed the escalation date
  if (escalationDate && new Date(escalationDate) > now) {
    // Not yet — just acknowledge
    await logAgentActivity({
      agentName:    'orchestrator',
      agentSource:  'vercel',
      activityType: 'info',
      description:  `All-suppliers-silent escalation pending — triggers ${escalationDate}`,
      domain:       'supplier',
      metadata:     directive.metadata,
    });
    return;
  }

  // Check actual supplier silence
  const { data: suppliers } = await supabase
    .from('manufacturer_shortlist')
    .select('name, contact_name, outreach_status, last_response_at, outreach_sent_at')
    .eq('outreach_status', 'contacted');

  const silentSuppliers = (suppliers ?? []).filter(s => !s.last_response_at);

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  if (silentSuppliers.length > 0) {
    const list = silentSuppliers.map(s => `• ${s.contact_name ?? s.name} (contacted ${s.outreach_sent_at ? new Date(s.outreach_sent_at).toLocaleDateString('en-AU') : 'unknown'})`).join('\n');
    await sendViaGreenApi(
      `🔕 *All suppliers silent*\n\n${silentSuppliers.length} factories with no reply:\n${list}\n\nReview: (1) correct Alibaba URLs? (2) messages sent? (3) China public holiday?`,
      ownerPhone ?? undefined
    ).catch(() => {});
  }

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'auto_action',
    description:  `Supplier silence check: ${silentSuppliers.length} still silent`,
    domain:       'supplier',
    metadata:     { silent_count: silentSuppliers.length },
  });
}

// ── NEW: brief_ready ─────────────────────────────────────────────────────────
async function handleBriefReady(
  directive: OrchestratorDirective,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const instruction = directive.instruction ?? 'Brief is ready.';

  await supabase.from('platform_inbox').insert({
    platform:           'system',
    contact_name:       directive.target_agent ?? 'Chinese Negotiator',
    contact_identifier: directive.target_agent ?? 'chinese_negotiator',
    raw_content:        instruction,
    ai_summary:         `Brief ready: ${instruction.slice(0, 100)}`,
    ai_recommendation:  instruction,
    approval_tier:      2,
    status:             'pending',
    metadata:           directive.metadata,
  });

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  await sendViaGreenApi(
    `📋 Brief ready for *${directive.target_agent ?? 'agent'}*:\n${instruction.slice(0, 250)}\n\nCheck Inbox to review.`,
    ownerPhone ?? undefined
  ).catch(() => {});

  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'handoff',
    description:  `Brief-ready directive processed for ${directive.target_agent}: inbox item created`,
    domain:       'system',
    metadata:     directive.metadata,
  });
}

// ── NEW: agent_registered ────────────────────────────────────────────────────
async function handleAgentRegistered(
  directive: OrchestratorDirective
): Promise<void> {
  const agentId   = directive.metadata?.agent_id as string | undefined;
  const agentType = directive.metadata?.agent_type as string | undefined;
  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  await sendViaGreenApi(
    `🤖 Agent registered: *${directive.target_agent ?? 'new agent'}*\n${agentType ? `Type: ${agentType}\n` : ''}${directive.instruction?.slice(0, 200) ?? ''}`,
    ownerPhone ?? undefined
  ).catch(() => {});
  await logAgentActivity({
    agentName:    'orchestrator',
    agentSource:  'vercel',
    activityType: 'info',
    description:  `Agent registered: ${directive.target_agent ?? 'unknown'} (id: ${agentId ?? 'n/a'})`,
    domain:       'system',
    metadata:     directive.metadata,
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
        case 'spec_updated':
          await handleSpecUpdated(directive, supabase);
          break;
        case 'priority_override':
          await handlePriorityOverride(directive);
          break;
        case 'focus_thread':
          await handleFocusThread(directive, supabase);
          break;
        case 'daily_briefing':
          await handleDailyBriefing(directive, supabase);
          break;
        case 'data_available':
          await handleDataAvailable(directive);
          break;
        case 'drawing_ready':
          await handleDrawingReady(directive, supabase);
          break;
        case 'all_suppliers_silent':
          await handleAllSuppliersSilent(directive, supabase);
          break;
        case 'brief_ready':
          await handleBriefReady(directive, supabase);
          break;
        case 'agent_registered':
          await handleAgentRegistered(directive);
          break;
        default: {
          // Unknown type — send to WhatsApp so nothing is silently dropped
          const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
          const fallbackMsg = directive.instruction ?? JSON.stringify(directive.metadata);
          await sendViaGreenApi(
            `⚙️ Unhandled directive [${directive.directive_type}] for ${directive.target_agent ?? 'unknown'}:\n${fallbackMsg?.slice(0, 300)}`,
            ownerPhone ?? undefined
          ).catch(() => {});
          console.warn(`[process-directives] unknown directive_type: ${directive.directive_type}`);
        }
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
