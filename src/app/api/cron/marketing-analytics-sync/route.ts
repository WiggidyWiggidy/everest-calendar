export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

type Step = { ok: boolean; status?: number; elapsed_ms: number; body?: unknown; error?: string };

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const syncSecret = process.env.MARKETING_SYNC_SECRET;
  if (syncSecret && request.headers.get('x-sync-secret') === syncSecret) return true;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}` ||
    request.headers.get('x-cron-secret') === secret ||
    request.nextUrl.searchParams.get('secret') === secret;
}

async function call(baseUrl: string, path: string, body: object = {}): Promise<Step> {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    return { ok: response.ok, status: response.status, elapsed_ms: Date.now() - started, body: parsed };
  } catch (err) {
    return { ok: false, elapsed_ms: Date.now() - started, error: (err as Error).message };
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createServiceClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin || 'https://everest-calendar.vercel.app';
  const { data: run, error: runError } = await sb.from('marketing_analytics_sync_runs')
    .insert({ status: 'running', trigger: request.nextUrl.searchParams.get('trigger') || 'daily_cron' }).select('id').single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const results: Record<string, Step> = {};
  const steps: Array<[string, string, object?]> = [
    ['meta', '/api/marketing/sync/meta'],
    ['meta_campaigns', '/api/marketing/sync/meta-campaigns'],
    ['meta_ad_insights', '/api/marketing/sync/meta-ad-insights', { days: 8 }],
    ['meta_hourly', '/api/marketing/sync/meta-hourly', { days: 8 }],
    ['meta_dce', '/api/marketing/sync/meta-dce', { days: 8 }],
    ['meta_url_audit', '/api/marketing/sync/meta-url-audit'],
    ['clarity', '/api/marketing/sync/clarity'],
    ['shopify', '/api/marketing/sync/shopify'],
    ['shopify_funnel', '/api/marketing/sync/shopify-funnel'],
    ['ga4_hourly', '/api/marketing/sync/ga4-hourly', { days: 7, kryo_only: false }],
    ['gsc', '/api/marketing/sync/gsc', { days: 14, freshDays: 2, includeHourly: true }],
    ['process_attribution', '/api/marketing/launch/process-attribution'],
    ['refresh_findings', '/api/marketing/launch/refresh-findings'],
    ['scorecard', '/api/marketing/kryo/scorecard'],
  ];
  for (const [name, path, body] of steps) results[name] = await call(baseUrl, path, body);

  const failed = Object.entries(results).filter(([, result]) => !result.ok).map(([name]) => name);
  const status = failed.length === 0 ? 'success' : failed.length === steps.length ? 'failed' : 'partial';
  const scorecardBody = results.scorecard?.body as { scorecard?: { id?: string } } | undefined;
  await sb.from('marketing_analytics_sync_runs').update({
    completed_at: new Date().toISOString(),
    status,
    source_results: results,
    scorecard_id: scorecardBody?.scorecard?.id ?? null,
  }).eq('id', run.id);
  return NextResponse.json({ status, failed, results }, { status: status === 'failed' ? 500 : 200 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
