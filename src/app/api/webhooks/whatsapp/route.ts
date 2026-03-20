// ============================================
// POST /api/webhooks/whatsapp
// Receives inbound messages from Green API.
// No session auth — validated by optional
// ?secret= query param (WHATSAPP_WEBHOOK_SECRET).
// Flow:
//   1. Validate secret
//   2. Parse Green API payload (text + image messages)
//   3. Filter to COWORK_CAD_PHONE only
//   4. Download image → upload to Supabase Storage (if image)
//   5. Fetch conversation history for Claude context
//   6. Call Claude to generate a draft reply (with vision if image)
//   7. Auto-send via Green API if COWORK_AUTO_SEND=true
//   8. Save inbound + draft/sent via SECURITY DEFINER RPC
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { downloadGreenApiMedia, sendViaGreenApi } from '@/lib/greenApi';

const CAD_AGENT_SYSTEM_PROMPT = `You are Tom, an entrepreneur, responding to your CAD designer via WhatsApp. You are building a custom electronics enclosure. Give DFM (design for manufacture) feedback and technical direction in first person, as Tom. Be direct, technical, and concise — 2 to 4 sentences maximum. No emojis.

Key specs:
- 1.5mm aluminium sheet metal
- Laser cut + CNC press brake fabrication
- Clamshell design with hidden fasteners
- Ventilation cutouts and cable routing channels
- Minimum 11kg load-bearing
- Confidentiality: refer to the product only as "custom electronics enclosure" — never reveal the end use`;

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

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
    const isText  = msgType === 'textMessage';
    const isImage = msgType === 'imageMessage';

    if (!isText && !isImage) {
      return NextResponse.json({ ok: true }); // skip voice, docs, stickers, etc.
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

    // ── Extract text and image data ───────────────────────────────────────
    let inboundText = '';
    let mediaUrl:  string | null = null;
    let mediaType: string | null = null;
    let imageBase64: string | null = null;
    let imageBase64MimeType: string | null = null;

    if (isText) {
      inboundText = body.messageData?.textMessageData?.textMessage ?? '';
    } else {
      const fileData = body.messageData?.fileMessageData;
      inboundText = fileData?.caption?.trim() || '[Image]';
      mediaType   = fileData?.mimeType ?? 'image/jpeg';

      const downloadUrl: string | undefined = fileData?.downloadUrl;
      if (downloadUrl) {
        // ── 4. Download image → upload to Supabase Storage ───────────────
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
            console.error('/api/webhooks/whatsapp storage upload error:', uploadErr);
            // non-fatal — we still have base64 for Claude
          }
        }
      }
    }

    if (!inboundText.trim() && !imageBase64) {
      return NextResponse.json({ ok: true });
    }

    // ── 5. Fetch conversation history ─────────────────────────────────────
    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    try {
      const { data: history } = await supabase.rpc('get_cowork_history', { p_limit: 20 });
      if (Array.isArray(history)) {
        historyMessages = history
          .filter((m: { direction: string; content: string }) => m.content && m.content !== '[Image]')
          .map((m: { direction: string; content: string }) => ({
            role:    (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          }));
      }
    } catch (histErr) {
      console.error('/api/webhooks/whatsapp history fetch error:', histErr);
      // non-fatal — Claude still replies without context
    }

    // ── 6. Call Claude ────────────────────────────────────────────────────
    let draftContent: string | null = null;
    try {
      // Build the current inbound message content (may include image)
      const currentContent: ClaudeContentBlock[] = [];
      if (imageBase64 && imageBase64MimeType) {
        currentContent.push({
          type:   'image',
          source: { type: 'base64', media_type: imageBase64MimeType, data: imageBase64 },
        });
      }
      if (inboundText && inboundText !== '[Image]') {
        currentContent.push({ type: 'text', text: inboundText });
      } else if (!imageBase64) {
        currentContent.push({ type: 'text', text: inboundText });
      }

      const claudeMessages = [
        ...historyMessages,
        {
          role:    'user' as const,
          content: currentContent.length === 1 && currentContent[0].type === 'text'
            ? currentContent[0].text
            : currentContent,
        },
      ];

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 256,
          system:     CAD_AGENT_SYSTEM_PROMPT,
          messages:   claudeMessages,
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

    // ── 7. Auto-send if configured ────────────────────────────────────────
    const autoSend = process.env.COWORK_AUTO_SEND === 'true';
    let didAutoSend = false;

    if (autoSend && draftContent) {
      const sendError = await sendViaGreenApi(draftContent);
      if (!sendError) {
        didAutoSend = true;
      } else {
        console.error('/api/webhooks/whatsapp auto-send error:', sendError);
      }
    }

    // ── 8. Save via SECURITY DEFINER RPC ──────────────────────────────────
    const { error: rpcError } = await supabase.rpc('process_whatsapp_inbound', {
      p_inbound_content: inboundText,
      p_sender_name:     senderName,
      p_draft_content:   draftContent,
      p_media_url:       mediaUrl,
      p_media_type:      mediaType,
      p_auto_send:       didAutoSend,
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
