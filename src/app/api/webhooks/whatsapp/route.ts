// ============================================
// POST /api/webhooks/whatsapp
// Receives inbound messages from Green API.
// No session auth — validated by optional
// ?secret= query param (WHATSAPP_WEBHOOK_SECRET).
// Flow:
//   1. Validate secret
//   2. Parse Green API payload (text messages only)
//   3. Filter to COWORK_CAD_PHONE only
//   4. Call Claude to generate a draft reply
//   5. Save inbound + draft via SECURITY DEFINER RPC
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';

const CAD_AGENT_SYSTEM_PROMPT = `You are Tom, an entrepreneur, responding to your CAD designer via WhatsApp. You are building a custom electronics enclosure. Give DFM (design for manufacture) feedback and technical direction in first person, as Tom. Be direct, technical, and concise — 2 to 4 sentences maximum. No emojis.

Key specs:
- 1.5mm aluminium sheet metal
- Laser cut + CNC press brake fabrication
- Clamshell design with hidden fasteners
- Ventilation cutouts and cable routing channels
- Minimum 11kg load-bearing
- Confidentiality: refer to the product only as "custom electronics enclosure" — never reveal the end use`;

export async function POST(request: NextRequest) {
  try {
    // ── 1. Validate webhook secret ────────────────────────────────────────
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (secret) {
      const provided = new URL(request.url).searchParams.get('secret');
      if (provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // ── 2. Parse Green API payload ────────────────────────────────────────
    const body = await request.json();

    if (body.typeWebhook !== 'incomingMessageReceived') {
      return NextResponse.json({ ok: true });
    }

    const msgType = body.messageData?.typeMessage;
    if (msgType !== 'textMessage') {
      return NextResponse.json({ ok: true }); // skip images, voice, etc. for now
    }

    const inboundText: string | undefined = body.messageData?.textMessageData?.textMessage;
    if (!inboundText?.trim()) {
      return NextResponse.json({ ok: true });
    }

    // ── 3. Filter to CAD designer only ────────────────────────────────────
    const cadPhone = process.env.COWORK_CAD_PHONE;
    if (cadPhone) {
      const senderPhone = (body.senderData?.chatId as string)?.split('@')[0];
      if (senderPhone !== cadPhone) {
        return NextResponse.json({ ok: true });
      }
    }

    const senderName: string | null = body.senderData?.senderName ?? null;

    // ── 4. Call Claude to generate draft ─────────────────────────────────
    let draftContent: string | null = null;
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-api-key':       process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 256,
          system:     CAD_AGENT_SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: inboundText }],
        }),
      });

      if (claudeRes.ok) {
        const claudeJson = await claudeRes.json();
        draftContent = (claudeJson.content?.[0]?.text as string) ?? null;
      } else {
        console.error('/api/webhooks/whatsapp Claude error:', await claudeRes.text());
      }
    } catch (err) {
      console.error('/api/webhooks/whatsapp Claude call failed:', err);
    }

    // ── 5. Save via SECURITY DEFINER RPC ──────────────────────────────────
    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: rpcError } = await supabase.rpc('process_whatsapp_inbound', {
      p_inbound_content: inboundText,
      p_sender_name:     senderName,
      p_draft_content:   draftContent,
    });

    if (rpcError) {
      console.error('/api/webhooks/whatsapp RPC error:', rpcError);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/webhooks/whatsapp unexpected error:', err);
    return NextResponse.json({ ok: true }); // always 200 — Green API retries on non-200
  }
}
