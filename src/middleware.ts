// Next.js Middleware — edge entry point
// Cache-bust: 2026-03-31T10:00Z
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Marketing API + sync secret = bypass auth (no session needed)
  const path = request.nextUrl.pathname;
  const hasSyncSecret = request.headers.get('x-sync-secret') !== null;
  if (path.startsWith('/api/marketing/') && hasSyncSecret) {
    return NextResponse.next();
  }

  // Signed Google OAuth repair flow. Start is protected by MARKETING_SYNC_SECRET;
  // callback is protected by a short-lived signed state value.
  if (
    path === '/api/marketing/google/oauth/callback' ||
    (path === '/api/marketing/google/oauth/start' && request.nextUrl.searchParams.has('secret'))
  ) {
    return NextResponse.next();
  }

  // PUBLIC pixel endpoint — called from storefront browsers (no x-sync-secret possible).
  // The route does its own validation (event_type whitelist + session_id requirement).
  if (path === '/api/marketing/sync/storefront-event') {
    return NextResponse.next();
  }

  // Shopify verifies webhook authenticity inside each route with HMAC.
  if (path === '/api/webhooks/shopify/order-created' || path === '/api/webhooks/shopify/refund-created') {
    return NextResponse.next();
  }

  // Cron routes with secret = bypass auth. Vercel cron uses Authorization: Bearer.
  // x-sync-secret is retained for secure manual verification runs.
  if (
    path.startsWith('/api/cron/') &&
    (
      request.headers.get('authorization') !== null ||
      request.headers.get('x-cron-secret') !== null ||
      request.headers.get('x-sync-secret') !== null ||
      request.nextUrl.searchParams.has('secret')
    )
  ) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
