import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleOAuthUrl, buildSignedGoogleOAuthState } from '@/lib/google-oauth';

export async function GET(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret');
  if (!syncSecret || syncSecret !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const state = buildSignedGoogleOAuthState();
  return NextResponse.redirect(buildGoogleOAuthUrl(state));
}
