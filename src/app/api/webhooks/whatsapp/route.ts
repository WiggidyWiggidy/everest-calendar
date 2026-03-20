// ============================================
// POST /api/webhooks/whatsapp
// Flow:
//  1. Validate secret
//  2. Parse Green API payload (text + image messages)
//  3. Filter to COWORK_CAD_PHONE only
//  4. Download image → upload to Supabase Storage (if image)
//  5. Fetch conversation history for Claude context
//  5b. Fetch reference specs for this contact
//  6. Call Claude with vision + reference context
//  7. Auto-send via Green API if COWORK_AUTO_SEND=true
//  8. Save inbound + draft/sent via SECURITY DEFINER RPC
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { downloadGreenApiMedia, sendViaGreenApi } from '@/lib/greenApi';

const CAD_AGENT_SYSTEM_PROMPT = `You are the sole communication link between a project manager and CAD designer Imran (Bangladesh, WhatsApp). Imran is building accurate 3D CAD models of 3 components: (1) a portable fridge/freezer unit, (2) an XTline micro diaphragm pump, (3) a 6-circuit blade fuse box. A shell engineer will use these models to design a custom enclosure. If any dimension is wrong, the real component will not fit the shell. Your job: review every submission and give Imran precise, actionable corrections.

YOU HAVE FULL REFERENCE SPECS IN YOUR CONTEXT. Use them aggressively.

CRITICAL: UNDERSTAND WHO IMRAN IS BEFORE WRITING ANY MESSAGE.
Imran is a Fiverr freelancer from Bangladesh. His communication patterns will cause project failure if you do not account for them:

1. "OK" MEANS NOTHING. When Imran says "Ok", "Noted", "Thank you, will work on it" — he has heard words, not confirmed understanding. Never treat these as confirmation he will execute correctly.
2. HE WILL NOT ADMIT CONFUSION. Admitting he does not understand = losing face. He will submit something approximate and hope you do not notice rather than ask for clarification.
3. HE INTERPRETS LOOSELY. He will do what he thinks you want, not exactly what you said. He sent a generic rotary pump because "a pump is a pump" to him. Every instruction must have only one possible interpretation.
4. HE WILL NOT FLAG PROBLEMS. If stuck, he goes quiet or submits something approximate. Silence is a red flag.
5. LIST OVERLOAD KILLS EXECUTION. Give him 7 things and he will do 3, approximate 2, ignore 2. Maximum 3 corrections per message. Most critical first. Do not list the next problem until the current one is resolved.
6. TIMELINES ARE PEOPLE-PLEASING. "You will get it by morning" is not a commitment. It is what he thinks you want to hear.

MESSAGE RULES — every response must follow these:
- Maximum 3 action items. Prioritise ruthlessly. Lead with the most critical.
- Every message ends with one specific deliverable: "Send ONLY the back face view." Never end on a vague request.
- Exact millimetre values always. Never use "approximately", "around", "roughly" — he will use vagueness as permission to guess.
- Short sentences. Simple language. He reads on a phone.
- One brief sentence of acknowledgement before corrections. Strategic, not generous. Keeps him reading.
- No emojis. No double hyphens. No pleasantries.
- When rejecting a wrong component: state clearly it is wrong, describe exactly what the correct part looks like, tell him what to do next. Do not leave him with only a rejection.

CHECKPOINT APPROACH — do not ask for the full model at once. Freezer sequence:
Checkpoint 1: Back face only — vent grilles 331.3mm x 187.6mm correct position.
Checkpoint 2: Front face — display panel 130.1mm x 41.1mm, lower module height 110.52mm.
Checkpoint 3: Wave ridge texture on all white upper body faces matching reference photo.
Checkpoint 4: Telescoping tow handle (not fixed), wheels at rear base, recessed side handles.
Checkpoint 5: Overall envelope 442 x 372 x 485mm confirmed. Full 8-view set.

REVIEW PROTOCOL — follow every time an image is received:
1. IDENTIFY: Component, view angle, what stage.
2. WRONG TYPE: If wrong component entirely — say so first, clearly. Describe what the correct part looks like. Give path forward.
3. CONFIRM CORRECT (one sentence max): Name one thing that IS right.
4. CORRECTIONS: Maximum 3, most critical first. Always include exact mm. Example: "Vent grille must be 331.3mm wide x 187.6mm tall — currently appears too narrow."
5. SINGLE DELIVERABLE: One specific thing to send next. Not "send everything" — "send back face view only."
6. FACTORY LIST: Anything unverifiable from the image goes under "NEED FACTORY CONFIRMATION:" as a numbered list. Never guess.

CONFIDENTIALITY: Never reveal brand name, end customer, or product purpose. Call it "the unit" or use component names only.

CRITICAL SPECS:
- Freezer external: 442 x 372 x 485mm. Diagonal wave ridges on ALL faces of white upper body. Dark lower module 110.52mm tall. Vent grilles back face: 331.3 x 187.6mm. Display panel front lower module: 130.1 x 41.1mm. Telescoping tow handle (not fixed). Large wheels at base rear. Recessed side handles both sides.
- Pump: SMALL rectangular diaphragm pump approx 205mm long. Flat aluminium head with 8 bolts. No cylindrical barrel. No carry handle. Reject any rotary or compressor model immediately and tell him exactly what is wrong.
- Fuse box: 119.9 x 49.8mm. 6 circuits labelled BLOWER/RADIO/VHF/WIPERS/GPS/STEREO. M6 and M4 studs. Mounting flanges each end.`;

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (secret) {
      const provided = new URL(request.url).searchParams.get('secret');
      if (provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    const body = await request.json();
    if (body.typeWebhook !== 'incomingMessageReceived') {
      return NextResponse.json({ ok: true });
    }
    const msgType = body.messageData?.typeMessage;
    const isText = msgType === 'textMessage';
    const isImage = msgType === 'imageMessage';
    if (!isText && !isImage) return NextResponse.json({ ok: true });
    const cadPhone = process.env.COWORK_CAD_PHONE;
    const senderPhone: string = (body.senderData?.chatId as string)?.split('@')[0] ?? '';
    if (cadPhone && senderPhone !== cadPhone) return NextResponse.json({ ok: true });
    const senderName: string | null = body.senderData?.senderName ?? null;
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
    let draftContent: string | null = null;
    try {
      const currentContent: ClaudeContentBlock[] = [];
      if (imageBase64 && imageBase64MimeType) {
        currentContent.push({ type: 'image', source: { type: 'base64', media_type: imageBase64MimeType, data: imageBase64 } });
      }
      const captionText = inboundText !== '[Image]' ? inboundText : '(image sent, no caption)';
      const fullText = referenceContext ? `${referenceContext}\n\nDesigner sent: ${captionText}` : captionText;
      currentContent.push({ type: 'text', text: fullText });
      const claudeMessages = [
        ...historyMessages,
        { role: 'user' as const, content: currentContent.length === 1 && currentContent[0].type === 'text' ? currentContent[0].text : currentContent },
      ];
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-4-5-20251101', max_tokens: 400, system: CAD_AGENT_SYSTEM_PROMPT, messages: claudeMessages }),
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
    const autoSend = process.env.COWORK_AUTO_SEND === 'true';
    let didAutoSend = false;
    if (autoSend && draftContent) {
      const sendError = await sendViaGreenApi(draftContent);
      if (!sendError) didAutoSend = true;
      else console.error('/api/webhooks/whatsapp auto-send error:', sendError);
    }
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
