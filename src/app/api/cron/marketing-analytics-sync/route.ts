export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = new URL(request.url).searchParams.get('secret');
  return auth === `Bearer ${cronSecret}` || headerSecret === cronSecret || querySecret === cronSecret;
}

async function callColdCycle(baseUrl: string, syncSecret: string) {
  const res = await fetch(`${baseUrl}/api/marketing/ops/run-analytics-cycle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
      'x-runner-source': 'vercel_daily',
    },
    body: JSON.stringify({ mode: 'cold' }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
  const syncSecret = process.env.MARKETING_SYNC_SECRET || '';
  const startedAt = Date.now();

  const cold = await callColdCycle(baseUrl, syncSecret);

  return NextResponse.json({
    ok: cold.ok,
    mode: 'cold',
    elapsed_ms: Date.now() - startedAt,
    results: cold,
  }, { status: cold.ok ? 200 : 500 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
