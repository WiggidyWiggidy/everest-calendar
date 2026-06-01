import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleOAuthUrl, buildSignedGoogleOAuthState } from '@/lib/google-oauth';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(buildGoogleOAuthUrl(buildSignedGoogleOAuthState()));
}
