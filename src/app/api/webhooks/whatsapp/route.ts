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
    if (body.typeWebhook !== 'incomingMessageReceived') return NextResponse.json({ ok: true });
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
            const supabaseStorage = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
            const { data: uploadData } = await supabaseStorage.storage.from('cowork-media').upload(fileName, media.buffer, { contentType: media.mimeType, upsert: false });
            if (uploadData) mediaUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cowork-media/${fileName}`;
          } catch (uploadErr) { console.error('/api/webhooks/whatsapp storage error:', uploadErr); }
        }
      }
    }
    if (!inboundText.trim() && !imageBase64) return NextResponse.json({ ok: true });
    const supabase = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    let historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    try {
      const { data: history } = await supabase.rpc('get_cowork_history', { p_limit: 20 });
      if (Array.isArray(history)) {
        historyMessages = history
          .filter((m: { direction: string; content: string }) => m.content && m.content !== '[Image]')
          .map((m: { direction: string; content: string }) => ({ role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.content }));
      }
    } catch (histErr) { console.error('/api/webhooks/whatsapp history error:', histErr); }
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
    } catch (refErr) { console.error('/api/webhooks/whatsapp refs error:', refErr); }
    let draftContent: string | null = null;
    try {
      const currentContent: ClaudeContentBlock[] = [];
      if (imageBase64 && imageBase64MimeType) currentContent.push({ type: 'image', source: { type: 'base64', media_type: imageBase64MimeType, data: imageBase64 } });
      const captionText = inboundText !== '[Image]' ? inboundText : '(image sent, no caption)';
      const fullText = referenceContext ? `${referenceContext}\n\nDesigner sent: ${captionText}` : captionText;
      currentContent.push({ type: 'text', text: fullText });
      const claudeMessages = [...historyMessages, { role: 'user' as const, content: currentContent.length === 1 && currentContent[0].type === 'text' ? currentContent[0].text : currentContent }];
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-4-5-20251101', max_tokens: 400, system: CAD_AGENT_SYSTEM_PROMPT, messages: claudeMessages }),
      });
      if (claudeRes.ok) { const claudeJson = await claudeRes.json(); draftContent = (claudeJson.content?.[0]?.text as string) ?? null; }
      else console.error('/api/webhooks/whatsapp Claude error:', await claudeRes.text());
    } catch (err) { console.error('/api/webhooks/whatsapp Claude failed:', err); }
    const autoSend = process.env.COWORK_AUTO_SEND === 'true';
    let didAutoSend = false;
    if (autoSend && draftContent) {
      const sendError = await sendViaGreenApi(draftContent);
      if (!sendError) didAutoSend = true;
      else console.error('/api/webhooks/whatsapp auto-send error:', sendError);
    }
    const { error: rpcError } = await supabase.rpc('process_whatsapp_inbound', { p_inbound_content: inboundText, p_sender_name: senderName, p_draft_content: draftContent, p_media_url: mediaUrl, p_media_type: mediaType, p_auto_send: didAutoSend });
    if (rpcError) console.error('/api/webhooks/whatsapp RPC error:', rpcError);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/webhooks/whatsapp unexpected error:', err);
    return NextResponse.json({ ok: true });
  }
}
