// Shopify client credentials grant token helper
// Dev Dashboard apps use rotating 24h tokens instead of static access tokens
// https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getShopifyToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!storeUrl || !clientId || !clientSecret) {
    throw new Error(
      'Missing Shopify credentials. Set SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET in Vercel.'
    );
  }

  const res = await fetch(`https://${storeUrl}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Shopify token exchange failed:', res.status, text);
    throw new Error(`Shopify token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in ?? 86399) * 1000;

  return cachedToken!;
}

export function getShopifyStoreUrl(): string {
  const url = process.env.SHOPIFY_STORE_URL;
  if (!url) throw new Error('SHOPIFY_STORE_URL not set');
  return url;
}
