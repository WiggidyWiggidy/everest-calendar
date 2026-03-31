// Next.js Middleware: auth session refresh + route protection
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Marketing API routes with sync secret bypass auth entirely
  if (
    request.nextUrl.pathname.startsWith('/api/marketing/') &&
    request.headers.get('x-sync-secret') === process.env.MARKETING_SYNC_SECRET
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
