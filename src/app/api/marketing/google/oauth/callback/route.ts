import { NextRequest, NextResponse } from 'next/server';
import { encryptPendingGoogleToken, exchangeGoogleCodeForTokens, verifySignedGoogleOAuthState } from '@/lib/google-oauth';
import { createServiceClient } from '@/lib/supabase/service';

const PENDING_TOKEN_KEY = 'google_oauth_refresh_token_pending';

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get('error');
  if (oauthError) return NextResponse.json({ error: oauthError }, { status: 400 });
  if (!verifySignedGoogleOAuthState(request.nextUrl.searchParams.get('state'))) {
    return NextResponse.json({ error: 'Invalid or expired OAuth state. Restart OAuth.' }, { status: 400 });
  }
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  try {
    const tokens = await exchangeGoogleCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.json({ error: 'Google returned no refresh token. Restart OAuth and approve consent.' }, { status: 400 });
    }
    const supabase = createServiceClient();
    await supabase.from('system_config').delete().eq('key', PENDING_TOKEN_KEY);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabase.from('system_config').insert({
      key: PENDING_TOKEN_KEY,
      value_text: encryptPendingGoogleToken(tokens.refresh_token),
      description: `Temporary encrypted Google refresh token. Delete after Vercel install. Expires ${expiresAt}.`,
      source: 'google_oauth_callback',
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({
      success: true,
      message: 'Refresh token captured for immediate Vercel install and deletion.',
      expires_at: expiresAt,
      scope: tokens.scope,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
