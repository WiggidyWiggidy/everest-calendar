import { NextRequest, NextResponse } from 'next/server';
import { exchangeGoogleCodeForTokens, verifySignedGoogleOAuthState } from '@/lib/google-oauth';
import { createServiceClient } from '@/lib/supabase/service';

const PENDING_TOKEN_KEY = 'google_oauth_refresh_token_pending';

async function storeRefreshTokenForAgentPickup(refreshToken: string) {
  const supabase = createServiceClient();
  await supabase.from('system_config').delete().eq('key', PENDING_TOKEN_KEY);
  return supabase.from('system_config').insert({
    key: PENDING_TOKEN_KEY,
    value_text: refreshToken,
    description: 'Temporary Google OAuth refresh token captured by callback. Agent must move it to Vercel env then delete this row.',
    source: 'google_oauth_callback',
    updated_at: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error');
  if (error) return NextResponse.json({ error }, { status: 400 });

  const state = request.nextUrl.searchParams.get('state');
  if (!verifySignedGoogleOAuthState(state)) {
    return NextResponse.json({ error: 'Invalid or expired OAuth state. Restart OAuth from /api/marketing/google/oauth/start.' }, { status: 400 });
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  try {
    const tokens = await exchangeGoogleCodeForTokens(code);
    let storedRefreshToken = false;
    let storageError: string | null = null;
    if (tokens.refresh_token) {
      const { error: storeError } = await storeRefreshTokenForAgentPickup(tokens.refresh_token);
      storedRefreshToken = !storeError;
      storageError = storeError?.message ?? null;
    }

    return NextResponse.json({
      success: true,
      message: storedRefreshToken
        ? 'Refresh token captured. Agent can now install GOOGLE_OAUTH_REFRESH_TOKEN in Vercel.'
        : 'No refresh token was stored. Restart OAuth with prompt=consent if needed.',
      has_refresh_token: Boolean(tokens.refresh_token),
      stored_refresh_token: storedRefreshToken,
      storage_error: storageError,
      scope: tokens.scope,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
