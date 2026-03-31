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

  // Cron routes with secret = bypass auth
  if (path.startsWith('/api/cron/') && (request.headers.get('x-cron-secret') !== null || request.nextUrl.searchParams.has('secret'))) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
