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

const CAD_AGENT_SYSTEM_PROMPT = `You are managing communications with a CAD designer named Imran. His job is to create accurate 3D models of specific components (fridge/freezer unit, pump, fuse box). These models will be used by a shell engineer to design an enclosure that fits all components precisely â so dimensional accuracy in the 3D model is critical. Imran does NOT work with metal or manufacture anything; he only produces the 3D CAD models.

YOU HAVE FULL REFERENCE SPECS IN YOUR CONTEXT. Use them to make precise, specific corrections to his models.

WHEN AN IMAGE IS SENT:
- Compare the 3D model directly against the reference specs for that component
- List every deviation with exact dimensions where possible (e.g. "vent grille should be 331.3mm wide x 187.6mm tall â this affects how the shell cutout is sized")
- If the component is completely wrong type/form, say so clearly and describe what it should look like
- If a dimension cannot be confirmed from the image alone, add it to a "Need to confirm with factory" list â do NOT guess, as incorrect dims will cause the shell to not fit
- Never accept vague approximations â the shell engineer needs exact numbers

TONE: Direct, technical, no fluff. Like a demanding project manager on a deadline. 2-5 sentences or a numbered list. No emojis.

CONFIDENTIALITY: Never reveal end customer, brand name, or product purpose. Refer only to "the unit" or component names.`;

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/webhooks/whatsapp unexpected error:', err);
    return NextResponse.json({ ok: true });
  }
}
