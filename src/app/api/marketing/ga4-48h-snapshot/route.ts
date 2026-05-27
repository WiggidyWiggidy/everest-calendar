import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

async function authenticateSync(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, userId: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, userId: user.id };
  return { authenticated: false, userId: null };
}

function shouldRefresh(request: NextRequest): boolean {
  const refreshParam = new URL(request.url).searchParams.get('refresh');
  if (refreshParam === 'false' || refreshParam === '0') return false;
  return true;
}

async function runIntradayRefresh(request: NextRequest) {
  const syncSecret = process.env.MARKETING_SYNC_SECRET;
  if (!syncSecret) {
    return { ok: false, skipped: true, error: 'MARKETING_SYNC_SECRET missing' };
  }

  const syncUrl = new URL('/api/marketing/sync/ga4-hourly', request.url);
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
    body: JSON.stringify({ days: 3, kryo_only: false, trigger: 'ga4-48h-snapshot' }),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateSync(request);
  if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const startedAt = Date.now();
  const refreshRequested = shouldRefresh(request);
  const refresh = refreshRequested ? await runIntradayRefresh(request) : { ok: true, skipped: true };

  const supabase = auth.userId ? await createClient() : createServiceClient();
  const { data, error } = await supabase.rpc('get_ga4_48h_snapshot');
  if (error) {
    return NextResponse.json({ error: error.message, refresh }, { status: 500 });
  }

  const status = refreshRequested && !refresh.ok ? 207 : 200;
  return NextResponse.json({
    success: status === 200,
    elapsed_ms: Date.now() - startedAt,
    refreshed_before_read: refreshRequested,
    refresh,
    snapshot: data,
  }, { status });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
