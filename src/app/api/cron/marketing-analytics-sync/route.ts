export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = new URL(request.url).searchParams.get('secret');
  return auth === `Bearer ${cronSecret}` || headerSecret === cronSecret || querySecret === cronSecret;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
  const syncSecret = process.env.MARKETING_SYNC_SECRET || '';
  const startedAt = Date.now();
  const results: Record<string, unknown> = {};

  try {
    const syncRes = await fetch(`${baseUrl}/api/marketing/sync/ga4-hourly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
      body: JSON.stringify({ days: 3, kryo_only: false, trigger: 'hourly_cron' }),
    });
    const syncJson = await syncRes.json();
    results.ga4_hourly = { ok: syncRes.ok, status: syncRes.status, body: syncJson };
  } catch (err) {
    results.ga4_hourly = { ok: false, error: (err as Error).message };
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_ga4_48h_snapshot');
    results.snapshot = error
      ? { ok: false, error: error.message }
      : { ok: true, latest_synced_at: data?.freshness?.latest_synced_at, warnings: data?.freshness?.warnings ?? [] };
  } catch (err) {
    results.snapshot = { ok: false, error: (err as Error).message };
  }

  return NextResponse.json({
    ok: Boolean((results.ga4_hourly as { ok?: boolean })?.ok),
    elapsed_ms: Date.now() - startedAt,
    results,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
