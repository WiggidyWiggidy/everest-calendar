// ============================================
// Supabase middleware helper
// Refreshes the auth session on every request
// ============================================
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  // Start with a basic response that passes through
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update cookies on the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Also update cookies on the response (for the browser)
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — this is the key part
  const { data: { user } } = await supabase.auth.getUser();

  // If user is NOT logged in and trying to access protected routes, redirect to login
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/signup');

  // API routes that use X-API-Key auth (not session) must be exempt from redirect
  const isApiKeyRoute =
    (request.nextUrl.pathname.startsWith('/api/candidates') && request.method === 'POST') ||
    (request.nextUrl.pathname === '/api/webhooks/whatsapp' && request.method === 'POST') ||
    (request.nextUrl.pathname === '/api/system/propose' && request.method === 'POST') ||
    (request.nextUrl.pathname === '/api/agent-runs' && request.method === 'POST') ||
    (request.nextUrl.pathname.startsWith('/api/webhooks/openclaw')) ||
    (request.nextUrl.pathname.startsWith('/api/approve')) ||
    (request.nextUrl.pathname.startsWith('/approve')) ||
    (request.nextUrl.pathname.startsWith('/api/cron/') && (request.headers.get('x-cron-secret') !== null || request.nextUrl.searchParams.has('secret'))) ||
    (request.nextUrl.pathname.startsWith('/api/marketing/sync/') && request.headers.get('x-sync-secret') !== null) ||
    (request.nextUrl.pathname.startsWith('/api/marketing/backup/') && request.headers.get('x-sync-secret') !== null) ||
    (request.nextUrl.pathname === '/api/marketing/subscribe' && request.method === 'POST') ||
    (request.nextUrl.pathname === '/api/webhooks/meta-leads') ||
    (request.nextUrl.pathname === '/api/marketing/survey' && request.method === 'POST');

  if (!user && !isAuthPage && !isApiKeyRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user IS logged in and on auth pages, redirect to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
