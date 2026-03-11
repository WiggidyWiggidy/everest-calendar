// ============================================
// Next.js Middleware
// Runs on every request to handle auth session refresh
// and route protection (redirect if not logged in)
// ============================================
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Only run middleware on app routes (skip static files, images, etc.)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
