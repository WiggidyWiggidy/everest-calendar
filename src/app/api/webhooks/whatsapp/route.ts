// ============================================
// POST /api/webhooks/whatsapp
// Flow:
//  1. Validate secret
//  2. Parse Green API payload (text + image messages)
//  3. Filter to COWORK_CAD_PHONE only
//  4. Download image â upload to Supabase Storage (if image)
//  5. Fetch conversation history for Claude context
//  5b. Fetch reference specs for this contact
//  6. Call Claude with vision + reference context
//  7. Auto-send via Green API if COWORK_AUTO_SEND=true
//  8. Save inbound + draft/sent via SECURITY DEFINER RPC
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { downloadGreenApiMedia, sendViaGreenApi } from '@/lib/greenApi';
import { sendPushToAll } from '@/lib/pushNotifications';

const CAD_AGENT_SYSTEM_PROMPT = `You are the sole communication link between a project manager and CAD designer Imran (Bangladesh, WhatsApp). Imran is building accurate 3D CAD models of 3 components: (1) a portable fridge/freezer unit, (2) an XTline micro diaphragm pump, (3) a 6-circuit blade fuse box. A shell engineer will use these models to design a custom enclosure â if any dimension in Imran's model is wrong, the real component will not fit the shell. Your job: review every submission, identify every deviation from the reference specs, give Imran exact numbered corrections.

YOU HAVE FULL REFERENCE SPECS IN YOUR CONTEXT (component specs + CAD review protocol). Use them aggressively and precisely.

REVIEW PROTOCOL â follow this every time an image is received:
1. IDENTIFY: What component? What view/angle?
2. WRONG TYPE CHECK: If the component is the wrong type entirely (e.g. large compressor instead of small diaphragm pump) â say so immediately and clearly before anything else. Describe exactly what the correct part looks like.
3. CONFIRM CORRECT (brief): Name 1-2 things that ARE right â keep Imran motivated.
4. CORRECTIONS LIST: Numbered list of ALL deviations, most critical first. Include exact mm from specs wherever possible. Example: "Vent grille must be 331.3mm wide x 187.6mm tall â currently appears too narrow."
5. MISSING VIEWS: If a required view is missing, ask for it specifically (e.g. "Send back face view showing vent grilles and battery bay").
6. FACTORY CONFIRM LIST: Any dimension you cannot verify from the image â group into a section labelled "NEED FACTORY CONFIRMATION:" as a numbered list. Never guess these.

TONE RULES:
- Direct and technical. No pleasantries, no fluff. Like a senior engineer on a tight deadline.
- Short and scannable â Imran reads on a phone. Use numbered lists, not paragraphs.
- Never say "looks good", "close enough", "approximately right" â always push for exact.
- If a correction was made from a previous version, acknowledge it briefly then focus on what remains.
- No emojis.

CONFIDENTIALITY: Never reveal brand name, end customer, or product purpose. Call it "the unit" or use component names only.

CRITICAL KNOWLEDGE:
- Fridge external: 442 x 372 x 485mm. Diagonal wave ridges on ALL faces of white upper body. Dark lower module ~110.52mm tall. Vent grilles on back: 331.3 x 187.6mm. Display panel front: 130.1 x 41.1mm. Tow handle telescopes from top. Large wheels at base rear.
- Pump: SMALL rectangular diaphragm pump ~205mm long. Aluminium head with 8 bolts. NOT a large rotary compressor â reject any compressor model immediately.
- Fuse box: 119.9 x 49.8mm (4.72" x 1.96"). 6 circuits labelled BLOWER/RADIO/VHF/WIPERS/GPS/STEREO. M6+M4 studs. Mounting flanges each end.`;

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export async function POST(request: NextRequest) {
  try {
    // 1. Validate webhook secret
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (secret) {
      const provided = new URL(request.url).searchParams.get('secret');
      if (provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // 2. Parse Green API payload
    const body = await request.json();
    if (body.typeWebhook !== 'incomingMessageReceived') {
      return NextResponse.json({ ok: true });
    }
    const msgType = body.messageData?.typeMessage;
    const isText = msgType === 'textMessage';
    const isImage = msgType === 'imageMessage';
    if (!isText && !isImage) return NextResponse.json({ ok: true });

    // 3. Filter to CAD designer only
    const cadPhone = process.env.COWORK_CAD_PHONE;
    const senderPhone: string = (body.senderData?.chatId as string)?.split('@')[0] ?? '';
    if (cadPhone && senderPhone !== cadPhone) return NextResponse.json({ ok: true });
    const senderName: string | null = body.senderData?.senderName ?? null;

    // Extract text and image data
    let inboundText = '';
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let imageBase64: string | null = null;
    let imageBase64MimeType: string | null = null;

    if (isText) {
      inboundText = body.messageData?.textMessageData?.textMessage ?? '';
    } else {
      const fileData = body.messageData?.fileMessageData;
      inboundText = fileData?.caption?.trim() || '[Image]';
      mediaType = fileData?.mimeType ?? 'image/jpeg';
      const downloadUrl: string | undefined = fileData?.downloadUrl;
      if (downloadUrl) {
        // 4. Download image and upload to Supabase Storage
        const media = await downloadGreenApiMedia(downloadUrl);
        if (media) {
          imageBase64 = Buffer.from(media.buffer).toString('base64');
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

    // 5b. Fetch reference specs for this contact
    let referenceContext = '';
    try {
      const { data: refs } = await supabase.rpc('get_cowork_references', { p_phone: senderPhone });
      if (Array.isArray(refs) && refs.length > 0) {
        referenceContext = '\n\n=== REFERENCE SPECS (compare CAD against these) ===\n';
        for (const ref of refs) {
          referenceContext += `\n[${ref.component_name}]\n${ref.description}\n`;
          if (ref.specs) {
            referenceContext += `KEY SPECS: ${JSON.stringify(ref.specs, null, 2)}\n`;
          }
        }
        referenceContext += '=== END REFERENCE SPECS ===\n';
      }
    } catch (refErr) {
      console.error('/api/webhooks/whatsapp refs error:', refErr);
    }

    // 6. Call Claude with vision + reference context
    let draftContent: string | null = null;
    try {
      const currentContent: ClaudeContentBlock[] = [];
      if (imageBase64 && imageBase64MimeType) {
        currentContent.push({
          type: 'image',
          source: { type: 'base64', media_type: imageBase64MimeType, data: imageBase64 },
        });
      }
      const captionText = inboundText !== '[Image]' ? inboundText : '(image sent, no caption)';
      const fullText = referenceContext
        ? `${referenceContext}\n\nDesigner sent: ${captionText}`
        : captionText;
      currentContent.push({ type: 'text', text: fullText });

      const claudeMessages = [
        ...historyMessages,
        {
          role: 'user' as const,
          content:
            currentContent.length === 1 && currentContent[0].type === 'text'
              ? currentContent[0].text
              : currentContent,
        },
      ];

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5-20251101',
          max_tokens: 400,
          system: CAD_AGENT_SYSTEM_PROMPT,
          messages: claudeMessages,
        }),
      });

      if (claudeRes.ok) {
        const claudeJson = await claudeRes.json();
        draftContent = (claudeJson.content?.[0]?.text as string) ?? null;
      } else {
        console.error('/api/webhooks/whatsapp Claude error:', await claudeRes.text());
      }
    } catch (err) {
      console.error('/api/webhooks/whatsapp Claude failed:', err);
    }

    // 7. Auto-send if configured
    const autoSend = process.env.COWORK_AUTO_SEND === 'true';
    let didAutoSend = false;
    if (autoSend && draftContent) {
      const sendError = await sendViaGreenApi(draftContent);
      if (!sendError) didAutoSend = true;
      else console.error('/api/webhooks/whatsapp auto-send error:', sendError);
    }

    // 8. Save via SECURITY DEFINER RPC
    const { error: rpcError } = await supabase.rpc('process_whatsapp_inbound', {
      p_inbound_content: inboundText,
      p_sender_name: senderName,
      p_draft_content: draftContent,
      p_media_url: mediaUrl,
      p_media_type: mediaType,
      p_auto_send: didAutoSend,
    });
    if (rpcError) console.error('/api/webhooks/whatsapp RPC error:', rpcError);

    // 9. Send push notification (non-blocking — fire and forget)
    const pushBody = inboundText && inboundText !== '[Image]'
      ? inboundText.slice(0, 100) + (inboundText.length > 100 ? '…' : '')
      : '📷 Image received';
    const pushName = senderName ? `${senderName} (WhatsApp)` : 'WhatsApp message';
    sendPushToAll({ title: pushName, body: pushBody, url: '/cowork', tag: 'cowork-inbound' })
      .catch((err: unknown) => console.error('/api/webhooks/whatsapp push error:', err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/webhooks/whatsapp unexpected error:', err);
    return NextResponse.json({ ok: true });
  }
}
