import crypto from 'crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REDIRECT_URI');
  }
  return { clientId, clientSecret, redirectUri };
}

function stateSecret() {
  const secret = process.env.MARKETING_SYNC_SECRET;
  if (!secret) throw new Error('Missing MARKETING_SYNC_SECRET');
  return secret;
}

export function encryptPendingGoogleToken(token: string) {
  const key = crypto.createHash('sha256').update(stateSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['enc:v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function buildSignedGoogleOAuthState() {
  const payload = Buffer.from(JSON.stringify({ ts: Date.now(), nonce: crypto.randomUUID() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySignedGoogleOAuthState(state: string | null) {
  if (!state) return false;
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return false;
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { ts?: number };
    return Boolean(parsed.ts && Date.now() - parsed.ts < 15 * 60 * 1000);
  } catch {
    return false;
  }
}

export function buildGoogleOAuthUrl(state: string) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeGoogleCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google code exchange failed: ${JSON.stringify(json)}`);
  return json as { access_token: string; refresh_token?: string; scope?: string };
}

export async function getGoogleAccessTokenFromRefreshToken() {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('Missing GOOGLE_OAUTH_REFRESH_TOKEN');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google refresh failed: ${JSON.stringify(json)}`);
  return json.access_token as string;
}
