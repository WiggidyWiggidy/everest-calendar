// ============================================
// Green API — WhatsApp send + media download helpers
// Shared by /api/cowork, /api/cowork/[id], and webhooks/whatsapp
// ============================================

// Download an image from a Green API media URL.
// Returns { buffer, mimeType } or null on failure.
export async function downloadGreenApiMedia(
  downloadUrl: string
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      console.error('Green API media download error:', res.status, await res.text());
      return null;
    }
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer   = await res.arrayBuffer();
    return { buffer, mimeType };
  } catch (err) {
    console.error('Green API media download failed:', err);
    return null;
  }
}

export async function sendViaGreenApi(text: string, phone?: string): Promise<string | null> {
  // SAFETY: phone must be explicitly provided. Never fall back to a default number.
  // This prevents messages intended for Alibaba/Upwork from being sent to WhatsApp contacts.
  if (!phone) {
    return 'No phone number provided. Cannot send WhatsApp message without an explicit recipient.';
  }

  const instanceId  = process.env.GREEN_API_INSTANCE_ID;
  const token       = process.env.GREEN_API_TOKEN;
  const targetPhone = phone.replace(/^\+/, '');

  if (!instanceId || !token || !targetPhone) {
    return 'Green API not configured. Add GREEN_API_INSTANCE_ID and GREEN_API_TOKEN to env vars.';
  }

  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId:  `${targetPhone}@c.us`,
      message: text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Green API send error:', errText);
    return `Green API returned ${res.status}: ${errText}`;
  }

  return null; // success
}

// Send audio file via Green API (for voice notes)
export async function sendAudioViaGreenApi(
  audioUrl: string,
  phone?: string
): Promise<string | null> {
  const instanceId  = process.env.GREEN_API_INSTANCE_ID;
  const token       = process.env.GREEN_API_TOKEN;
  const ownerPhone  = process.env.OWNER_WHATSAPP_PHONE?.replace(/^\+/, '');
  const targetPhone = phone ?? ownerPhone;

  if (!instanceId || !token || !targetPhone) {
    return 'Green API not configured for audio';
  }

  const url = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId:   `${targetPhone}@c.us`,
      urlFile:  audioUrl,
      fileName: 'voice.mp3',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Green API audio send error:', errText);
    return `Green API returned ${res.status}: ${errText}`;
  }

  return null; // success
}
