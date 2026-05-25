import { NextRequest, NextResponse } from 'next/server';
import { exchangeGoogleCodeForTokens, verifySignedGoogleOAuthState } from '@/lib/google-oauth';

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
    return NextResponse.json({
      success: true,
      message: 'Copy refresh_token into GOOGLE_OAUTH_REFRESH_TOKEN in Vercel and .env.local. This token is shown only once.',
      has_refresh_token: Boolean(tokens.refresh_token),
      refresh_token: tokens.refresh_token || null,
      scope: tokens.scope,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
