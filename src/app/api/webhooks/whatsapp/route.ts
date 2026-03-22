// ============================================
// POST /api/webhooks/whatsapp
// Flow:
//  1. Validate secret
//  2. Parse Green API payload (text + image messages)
//  3. Filter to COWORK_CAD_PHONE only
//  4. Download image → upload to Supabase Storage (if image)
//  5. Fetch conversation history for Claude context
//  5b. Fetch reference specs for this contact
//  6. Classify message with Claude Haiku (approval tier 0-3)
//  7a. Tier 0: auto-send short Haiku ack, save, return
//  7b. Tier 1-3: run Claude Opus draft, save, create inbox item
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { downloadGreenApiMedia, sendViaGreenApi } from '@/lib/greenApi';
import { createServiceClient } from '@/lib/supabase/service';
import { logAgentActivity } from '@/lib/logAgentActivity';

const CAD_AGENT_SYSTEM_PROMPT = `You are the sole communication link between a project manager and CAD designer Imran (Bangladesh, WhatsApp). Imran is building accurate 3D CAD models of 3 components: (1) a portable fridge/freezer unit, (2) an XTline micro diaphragm pump, (3) a 6-circuit blade fuse box. A shell engineer uses these models to design an enclosure. Every dimension error cascades into the shell design. Your job: review every submission, apply the reference specs, and produce precise messages that actually move Imran forward.

YOU HAVE FULL REFERENCE SPECS IN YOUR CONTEXT. Use them precisely.

READ THIS BEFORE WRITING ANY WORD TO IMRAN.
Imran is a Fiverr freelancer from Bangladesh. These are not assumptions — they are documented cultural patterns that will derail this project if ignored:

"OK", "Noted", "Understood", "Will do" = he heard words. Not confirmation. Not commitment. The only valid confirmation is when he repeats a specific number back to you.

He will not admit confusion. In his culture, admitting you do not understand = losing face. He will attempt a wrong approach, submit it, and hope you do not notice rather than say he is stuck.

He interprets instructions loosely. He sent a large rotary pump because "a pump is a pump" to him. Every instruction must have only one possible interpretation. Exact numbers, exact locations, nothing left open.

Silence is a red flag. If he does not respond to a checkpoint, he is not working — he is stuck, confused, or on to other jobs. Send a specific targeted question, not a general check-in.

His timelines are people-pleasing. "You will get it by morning" is not a real estimate. It is what he thinks you want to hear.

List overload kills execution. Send 7 corrections, he will do 3, approximate 2, ignore 2. Maximum 3 per message. Most critical first. Do not list the next batch until the current ones are resolved.

He is motivated by being treated as a skilled professional. One sentence acknowledging what is right before corrections keeps him engaged. Disrespect or vague feedback causes disengagement — responses get shorter, questions stop, quality drops.

HOW TO CONFIRM HE ACTUALLY UNDERSTOOD:
Never ask "Do you understand?" — the answer is always yes. Instead:
- After sending a critical spec: follow with a specific question he must answer to prove he read it. Example: "Before you start — what are the two dimensions of the vent grille?"
- When setting a deadline: end with "Confirm by replying: Understood, deadline [day] [time]." If he gives a vague Ok, repeat the request.
- If you need to know he has the right reference: "What is the height of the lower dark module?" Wrong answer reveals a gap before he builds anything.

HOW TO FRAME CORRECTIONS:
Never say "You did X wrong." Always say "The spec requires X, your model shows Y. Can you correct this?"
This ties the correction to the spec, not your opinion, and preserves his face.
One sentence of acknowledgement first — what is actually correct in the submission. Strategic, not generous.
If the same item is wrong a second time: "This is the second time the [feature] does not match spec. It must be [exact value] before we move forward."
If the wrong component entirely: First sentence states it is the wrong component. Second sentence describes in simple visual terms what the correct part looks like. Third sentence tells him exactly what to do next. Never just reject.

HOW TO HANDLE SILENCE:
24 hours no response: send a specific targeted question about the work — "What is the current width of the vent grille in your model?" Not "Are you ok?" Specific question forces a specific answer.
48 hours: "I need a status update on [specific deliverable] by [specific time]. What is blocking you if anything?"
If he responds with vague "working on it": push for specifics. "What percentage complete? What view are you on right now?"

CHECKPOINT APPROACH — one checkpoint at a time. Do not move forward until the current one is approved:
CP1: Back face only. Vent grilles 331.3mm x 187.6mm, correct position. Send back face view only.
CP2: Front face. Display panel 130.1mm x 41.1mm on front of lower module. Lower module height 110.52mm. Send front face view only.
CP3: Wave ridge texture on all faces of white upper body, diagonal, matching the reference photo. Send isometric view.
CP4: Telescoping tow handle (not fixed), large wheels at rear base corners, recessed side handles both sides.
CP5: Full envelope 442 x 372 x 485mm confirmed. Full 8-view set: front, back, left, right, top, bottom, front isometric, back isometric.

REVIEW PROTOCOL — follow every time an image arrives:
1. IDENTIFY: Component, view angle, checkpoint stage.
2. WRONG TYPE: Wrong component entirely — say so in sentence one. Describe correct part visually. Give path forward.
3. ACKNOWLEDGE: One sentence on what is correct.
4. CORRECTIONS: Max 3, most critical first. Format: "The [feature] shows [value] — spec requires [exact value]mm. Can you correct this?"
5. SINGLE DELIVERABLE: "Send ONLY [specific view]." Never ask for everything at once.
6. FACTORY LIST: Anything unverifiable from the image — list under "NEED FACTORY CONFIRMATION:" Never guess.

MESSAGE RULES:
- Max 3 action items. Prioritise ruthlessly.
- Exact mm values only. Never approximately, around, roughly.
- Short sentences. Simple language. He reads on a phone.
- No emojis. No double hyphens. No pleasantries. No filler.
- Every message ends with one specific deliverable.

CONFIDENTIALITY: Never reveal brand name, end customer, or product purpose. Use "the unit" or component names only.

CRITICAL SPECS:
- Freezer: 442 x 372 x 485mm external. Diagonal wave ridges on ALL faces of white upper body. Dark lower module 110.52mm tall. Vent grilles on back face: 331.3mm wide x 187.6mm tall. Display panel on front of lower module: 130.1mm wide x 41.1mm tall. Telescoping tow handle (not fixed). Large wheels at rear base corners. Recessed side handles both sides.
- Pump: SMALL rectangular diaphragm pump, approx 205mm long, flat aluminium head with 8 bolts. No cylindrical barrel. No carry handle. Reject any rotary pump or compressor model immediately — state it is wrong, describe the correct part, tell him what to do.
- Fuse box: 119.9 x 49.8mm. 6 circuits labelled BLOWER/RADIO/VHF/WIPERS/GPS/STEREO. M6 and M4 studs. Mounting flanges each end.`;

// ── Proposal / directive helpers (APPROVE / REJECT / RETRY) ──────────────────

// UUID v4 pattern
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function handleProposalReply(text: string): Promise<boolean> {
  const trimmed = text.trim().toUpperCase();

  // RETRY [directive_id]
  if (trimmed.startsWith('RETRY ')) {
    const match = text.match(UUID_RE);
    if (!match) return false;
    const directiveId = match[0];
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('orchestrator_directives')
      .update({ status: 'pending', metadata: { retry_count: 0 } })
      .eq('id', directiveId);
    if (error) console.error('[whatsapp/proposal] RETRY error:', error);
    await logAgentActivity({
      agentName: 'tom', agentSource: 'cowork', activityType: 'approval',
      description: `Directive ${directiveId} reset to pending via WhatsApp RETRY`,
      domain: 'system', metadata: { directive_id: directiveId },
    });
    return true;
  }

  // APPROVE [proposal_id]
  if (trimmed.startsWith('APPROVE ')) {
    const match = text.match(UUID_RE);
    if (!match) return false;
    const proposalId = match[0];
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // Fetch the full proposal before updating status
    const { data: proposal, error: fetchErr } = await supabase
      .from('system_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();

    if (fetchErr || !proposal) {
      console.error('[whatsapp/proposal] APPROVE fetch error:', fetchErr);
      await sendViaGreenApi(`⚠️ Could not find proposal ${proposalId}`, process.env.OWNER_WHATSAPP_PHONE ?? undefined);
      return true;
    }

    // Mark approved
    await supabase
      .from('system_proposals')
      .update({ status: 'approved', approved_at: now })
      .eq('id', proposalId);

    // ── Execute based on proposal_type ──────────────────────────────────────
    const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
    try {
      const proposalType: string = proposal.proposal_type ?? '';
      const agentName: string    = (proposal.metadata?.agent_name as string) ?? '';
      const impl: string         = proposal.implementation_notes ?? proposal.description ?? '';

      if (proposalType === 'prompt_update') {
        // Apply the new system prompt directly to the agents table
        const { error: updateErr } = await supabase
          .from('agents')
          .update({ system_prompt: impl, updated_at: now })
          .eq('name', agentName);

        if (updateErr) throw new Error(`agents update failed: ${updateErr.message}`);

        await supabase
          .from('system_proposals')
          .update({ status: 'implemented', implemented_at: now })
          .eq('id', proposalId);

        await sendViaGreenApi(
          `✅ Prompt updated for *${agentName}*.\n\nChanges are live immediately.`,
          ownerPhone ?? undefined
        );

      } else if (proposalType === 'process_improvement') {
        // Create an orchestrator directive
        await supabase.from('orchestrator_directives').insert({
          directive_type: (proposal.metadata?.directive_type as string) ?? 'priority_override',
          target_agent:   agentName || null,
          instruction:    impl,
          status:         'pending',
          priority:       (proposal.metadata?.priority as string) ?? 'medium',
          source_agent:   'system_proposals',
          metadata:       proposal.metadata ?? {},
        });

        await supabase
          .from('system_proposals')
          .update({ status: 'implemented', implemented_at: now })
          .eq('id', proposalId);

        await sendViaGreenApi(
          `✅ Process improvement queued as directive.\n\nWill be processed at next cron run (≤15 min).`,
          ownerPhone ?? undefined
        );

      } else if (proposalType === 'code_change' || proposalType === 'bug_fix') {
        // Queue in task_backlog for OpenClaw to build
        await supabase.from('task_backlog').insert({
          title:       proposal.title,
          description: impl,
          priority:    (proposal.metadata?.priority as string) ?? 'medium',
          status:      'queued',
          source:      'system_proposals',
          metadata:    { proposal_id: proposalId },
        });

        await supabase
          .from('system_proposals')
          .update({ status: 'implemented', implemented_at: now })
          .eq('id', proposalId);

        await sendViaGreenApi(
          `✅ Build task created for OpenClaw.\n\n"${proposal.title}"\n\nOpenClaw will pick this up and raise a PR.`,
          ownerPhone ?? undefined
        );

      } else if (proposalType === 'schema_change') {
        // NEVER auto-execute — always queue for manual review
        await supabase.from('task_backlog').insert({
          title:       `[MIGRATION REVIEW] ${proposal.title}`,
          description: `Schema change proposal — requires manual review before execution.\n\n${impl}`,
          priority:    'high',
          status:      'queued',
          source:      'system_proposals',
          metadata:    { proposal_id: proposalId, requires_review: true },
        });

        await supabase
          .from('system_proposals')
          .update({ status: 'implemented', implemented_at: now })
          .eq('id', proposalId);

        await sendViaGreenApi(
          `⚠️ Schema change queued for manual review — NOT auto-executing.\n\n"${proposal.title}"\n\nReview the migration before running it.`,
          ownerPhone ?? undefined
        );

      } else {
        // Unknown type — just mark approved and notify
        await sendViaGreenApi(
          `✅ Proposal approved: "${proposal.title}"\n\nType: ${proposalType} — no auto-executor for this type. Manual action may be required.`,
          ownerPhone ?? undefined
        );
      }
    } catch (execErr) {
      const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
      console.error('[whatsapp/proposal] execution error:', execErr);
      await sendViaGreenApi(
        `⚠️ Proposal approved but execution failed:\n${errMsg.slice(0, 200)}\n\nProposal ID: ${proposalId}`,
        ownerPhone ?? undefined
      );
    }

    await logAgentActivity({
      agentName: 'tom', agentSource: 'cowork', activityType: 'approval',
      description: `System proposal "${proposal.title}" (${proposal.proposal_type}) approved and executed via WhatsApp`,
      domain: 'system', metadata: { proposal_id: proposalId, proposal_type: proposal.proposal_type },
    });
    return true;
  }

  // REJECT [proposal_id]
  if (trimmed.startsWith('REJECT ')) {
    const match = text.match(UUID_RE);
    if (!match) return false;
    const proposalId = match[0];
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('system_proposals')
      .update({ status: 'rejected' })
      .eq('id', proposalId);
    if (error) console.error('[whatsapp/proposal] REJECT error:', error);
    await logAgentActivity({
      agentName: 'tom', agentSource: 'cowork', activityType: 'decision',
      description: `System proposal ${proposalId} rejected via WhatsApp`,
      domain: 'system', metadata: { proposal_id: proposalId },
    });
    return true;
  }

  // Freeform reply — check for recent pending proposals (last 24h) and log as feedback
  const supabase = createServiceClient();
  const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentProposal } = await supabase
    .from('system_proposals')
    .select('id')
    .eq('status', 'pending')
    .gte('whatsapp_sent_at', ago24h)
    .order('whatsapp_sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentProposal) {
    await supabase
      .from('system_proposals')
      .update({ status: 'feedback_given', your_feedback: text })
      .eq('id', recentProposal.id);
    await logAgentActivity({
      agentName: 'tom', agentSource: 'cowork', activityType: 'info',
      description: `Feedback given on proposal ${recentProposal.id}: "${text.slice(0, 80)}"`,
      domain: 'system', metadata: { proposal_id: recentProposal.id },
    });
    return true; // handled — don't pass to CAD pipeline
  }

  return false;
}

// ── OpenRouter helper ─────────────────────────────────────────
const OR_HEADERS = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
  'HTTP-Referer': 'https://everest-calendar.vercel.app',
  'X-Title': 'Everest CAD Agent',
});

async function classifyMessage(content: string): Promise<{
  tier: 0 | 1 | 2 | 3;
  summary: string;
  recommendation: string;
}> {
  const fallback = { tier: 1 as const, summary: '', recommendation: '' };
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: OR_HEADERS(),
      body: JSON.stringify({
        model: 'mistralai/mistral-small-3.1-24b-instruct',
        max_tokens: 80,
        messages: [
          {
            role: 'user',
            content: `Classify this WhatsApp message into one of 4 tiers:
0 = Simple acknowledgment needed only (< 15 word reply, no spec/cost/commitment content)
1 = Progress update or routine question, one-tap approve draft reply
2 = Spec/dimension question or file request, choose from options
3 = Any mention of price/cost/commitment/agreement/deadline, Tom must handle directly

Message: "${content}"
Platform: WhatsApp, CAD designer

Reply JSON only, no markdown: {"tier": N, "summary": "15-word max", "recommendation": "1-2 sentences"}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content as string) ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const tier = [0, 1, 2, 3].includes(parsed.tier) ? (parsed.tier as 0 | 1 | 2 | 3) : 1;
    return { tier, summary: parsed.summary ?? '', recommendation: parsed.recommendation ?? '' };
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Validate secret
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (secret) {
      const provided = new URL(request.url).searchParams.get('secret');
      if (provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // 2. Parse payload
    const body = await request.json();
    if (body.typeWebhook !== 'incomingMessageReceived') return NextResponse.json({ ok: true });
    const msgType = body.messageData?.typeMessage;
    const isText  = msgType === 'textMessage';
    const isImage = msgType === 'imageMessage';
    const isDoc = msgType === 'documentMessage';
    if (!isText && !isImage && !isDoc) return NextResponse.json({ ok: true });

    const senderPhone = ((body.senderData?.chatId as string) ?? '').split('@')[0];

    // 2b. Owner reply handling — APPROVE / REJECT / RETRY / feedback
    // Check before CAD filter so Tom's phone is handled from any thread.
    const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
    if (ownerPhone && senderPhone === ownerPhone && isText) {
      const inboundOwnerText: string = body.messageData?.textMessageData?.textMessage ?? '';
      const handled = await handleProposalReply(inboundOwnerText);
      if (handled) return NextResponse.json({ ok: true });
      // If not handled (just a normal chat from Tom), fall through to CAD pipeline — very unlikely but safe
    }

    // 3. Filter to CAD phone only
    const cadPhone = process.env.COWORK_CAD_PHONE;
    if (cadPhone && senderPhone !== cadPhone) return NextResponse.json({ ok: true });

    const senderName: string | null = body.senderData?.senderName ?? null;
    let inboundText           = '';
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let imageBase64: string | null = null;
    let imageBase64MimeType: string | null = null;

    // 4. Download image if present
    if (isText) {
      inboundText = body.messageData?.textMessageData?.textMessage ?? '';
    } else if (isDoc) {
      // Documents (STEP, DXF, PDF, etc.) — log metadata, don't re-upload
      const fileData = body.messageData?.fileMessageData;
      const fileName = fileData?.fileName ?? 'attachment';
      inboundText = fileData?.caption?.trim() || `[File: ${fileName}]`;
      mediaType   = fileData?.mimeType ?? 'application/octet-stream';
      mediaUrl    = fileData?.downloadUrl ?? null; // store direct link
    } else {
      const fileData = body.messageData?.fileMessageData;
      inboundText = fileData?.caption?.trim() || '[Image]';
      mediaType   = fileData?.mimeType ?? 'image/jpeg';
      const downloadUrl: string | undefined = fileData?.downloadUrl;
      if (downloadUrl) {
        const media = await downloadGreenApiMedia(downloadUrl);
        if (media) {
          imageBase64         = Buffer.from(media.buffer).toString('base64');
          imageBase64MimeType = media.mimeType;
          try {
            const supabaseStorage = createAnonClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
            const { data: uploadData } = await supabaseStorage.storage
              .from('cowork-media')
              .upload(fileName, media.buffer, { contentType: media.mimeType, upsert: false });
            if (uploadData) {
              mediaUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cowork-media/${fileName}`;
            }
          } catch (uploadErr) {
            console.error('/api/webhooks/whatsapp storage error:', uploadErr);
          }
        }
      }
    }

    if (!inboundText.trim() && !imageBase64) return NextResponse.json({ ok: true });

    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 5. Fetch conversation history
    let historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    try {
      const { data: history } = await supabase.rpc('get_cowork_history', { p_limit: 20 });
      if (Array.isArray(history)) {
        historyMessages = history
          .filter((m: { direction: string; content: string }) => m.content && m.content !== '[Image]')
          .map((m: { direction: string; content: string }) => ({
            role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          }));
      }
    } catch (histErr) {
      console.error('/api/webhooks/whatsapp history error:', histErr);
    }

    // 5b. Fetch reference specs
    let referenceContext = '';
    try {
      const { data: refs } = await supabase.rpc('get_cowork_references', { p_phone: senderPhone });
      if (Array.isArray(refs) && refs.length > 0) {
        referenceContext = '\n\n=== REFERENCE SPECS ===\n';
        for (const ref of refs) {
          referenceContext += `\n[${ref.component_name}]\n${ref.description}\n`;
          if (ref.specs) referenceContext += `KEY SPECS: ${JSON.stringify(ref.specs, null, 2)}\n`;
        }
        referenceContext += '=== END REFERENCE SPECS ===\n';
      }
    } catch (refErr) {
      console.error('/api/webhooks/whatsapp refs error:', refErr);
    }

    // 6. Classify with Haiku
    const classifyText = inboundText !== '[Image]' ? inboundText : '(image — no caption)';
    const { tier, summary, recommendation } = await classifyMessage(classifyText);

    // ── TIER 0: auto-handle with short Haiku ack ─────────────────────────────
    if (tier === 0) {
      let tier0Reply = 'Got it.';
      try {
        const tier0Res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: OR_HEADERS(),
          body: JSON.stringify({
            model: 'mistralai/mistral-small-3.1-24b-instruct',
            max_tokens: 30,
            messages: [
              { role: 'system', content: 'Brief acknowledgment under 15 words. No emojis. Direct.' },
              { role: 'user', content: inboundText },
            ],
          }),
        });
        if (tier0Res.ok) {
          const t0Json = await tier0Res.json();
          tier0Reply = (t0Json.choices?.[0]?.message?.content as string) ?? tier0Reply;
        }
      } catch {
        // keep default
      }

      await sendViaGreenApi(tier0Reply);
      await supabase.rpc('process_whatsapp_inbound', {
        p_inbound_content: inboundText,
        p_sender_name:     senderName,
        p_draft_content:   tier0Reply,
        p_media_url:       mediaUrl,
        p_media_type:      mediaType,
        p_auto_send:       true,
      });
      return NextResponse.json({ ok: true });
    }

    // ── TIER 1-3: CAD draft via OpenRouter ───────────────────────────────────
    let draftContent: string | null = null;
    try {
      // Build current message in OpenAI vision format
      type OAIBlock = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
      const currentBlocks: OAIBlock[] = [];
      if (imageBase64 && imageBase64MimeType) {
        currentBlocks.push({
          type: 'image_url',
          image_url: { url: `data:${imageBase64MimeType};base64,${imageBase64}` },
        });
      }
      const captionText = inboundText !== '[Image]' ? inboundText : '(image sent, no caption)';
      const fullText    = referenceContext ? `${referenceContext}\n\nDesigner sent: ${captionText}` : captionText;
      currentBlocks.push({ type: 'text', text: fullText });

      const openaiMessages = [
        { role: 'system', content: CAD_AGENT_SYSTEM_PROMPT },
        ...historyMessages,
        {
          role: 'user' as const,
          content: currentBlocks.length === 1 && currentBlocks[0].type === 'text' ? currentBlocks[0].text : currentBlocks,
        },
      ];

      const claudeRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: OR_HEADERS(),
        body: JSON.stringify({
          model: 'anthropic/claude-haiku-4-5',  // vision-capable via OpenRouter
          max_tokens: 400,
          messages: openaiMessages,
        }),
      });

      if (claudeRes.ok) {
        const claudeJson = await claudeRes.json();
        draftContent = (claudeJson.choices?.[0]?.message?.content as string) ?? null;
      } else {
        console.error('/api/webhooks/whatsapp OpenRouter error:', await claudeRes.text());
      }
    } catch (err) {
      console.error('/api/webhooks/whatsapp Claude failed:', err);
    }

    // Always save as draft for Tier 1-3 — never auto-send regardless of COWORK_AUTO_SEND
    const { data: rpcData, error: rpcError } = await supabase.rpc('process_whatsapp_inbound', {
      p_inbound_content: inboundText,
      p_sender_name:     senderName,
      p_draft_content:   draftContent,
      p_media_url:       mediaUrl,
      p_media_type:      mediaType,
      p_auto_send:       false,
    });
    if (rpcError) console.error('/api/webhooks/whatsapp RPC error:', rpcError);

    // Create inbox item
    const inboundId = (rpcData as { inbound_id?: string; draft_id?: string } | null)?.inbound_id ?? null;
    try {
      await supabase.rpc('create_inbox_item', {
        p_platform:                   'whatsapp',
        p_contact_name:               senderName,
        p_contact_identifier:         senderPhone,
        p_raw_content:                inboundText,
        p_media_url:                  mediaUrl,
        p_media_type:                 mediaType,
        p_ai_summary:                 summary,
        p_ai_recommendation:          recommendation,
        p_draft_reply:                draftContent,
        p_approval_tier:              tier,
        p_cowork_message_inbound_id:  inboundId,
        p_candidate_id:               null,
      });
    } catch (inboxErr) {
      console.error('/api/webhooks/whatsapp inbox item error:', inboxErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/webhooks/whatsapp unexpected error:', err);
    return NextResponse.json({ ok: true });
  }
}
