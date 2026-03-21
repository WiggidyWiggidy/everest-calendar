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
  const instanceId  = process.env.GREEN_API_INSTANCE_ID;
  const token       = process.env.GREEN_API_TOKEN;
  const cadPhone    = process.env.COWORK_CAD_PHONE;
  const targetPhone = phone ?? cadPhone;

  if (!instanceId || !token || !targetPhone) {
    return 'Green API not configured — add GREEN_API_INSTANCE_ID, GREEN_API_TOKEN, COWORK_CAD_PHONE to env vars';
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
