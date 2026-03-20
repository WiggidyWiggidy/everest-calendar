// ============================================
// Green API — WhatsApp send helper
// Shared by /api/cowork and /api/cowork/[id]
// ============================================

export async function sendViaGreenApi(text: string): Promise<string | null> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token      = process.env.GREEN_API_TOKEN;
  const cadPhone   = process.env.COWORK_CAD_PHONE;

  if (!instanceId || !token || !cadPhone) {
    return 'Green API not configured — add GREEN_API_INSTANCE_ID, GREEN_API_TOKEN, COWORK_CAD_PHONE to env vars';
  }

  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId:  `${cadPhone}@c.us`,
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
