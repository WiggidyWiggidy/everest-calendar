export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

type SyncStatus = 'success' | 'partial' | 'failed';

type StepResult = {
  source: 'ga4' | 'ga4_pages' | 'gsc';
  status: SyncStatus;
  http_status?: number;
  rows_synced: number | null;
  latest_data_date: string | null;
  started_at: string;
  completed_at: string;
  error_message: string | null;
  raw_response: unknown;
};

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.MARKETING_SYNC_SECRET;
  const auth = request.headers.get('authorization');
  const providedCron = request.headers.get('x-cron-secret') ?? request.nextUrl.searchParams.get('secret');
  const providedSync = request.headers.get('x-sync-secret') ?? request.nextUrl.searchParams.get('sync_secret');

  if (cronSecret && (auth === `Bearer ${cronSecret}` || providedCron === cronSecret)) return true;
  if (syncSecret && providedSync === syncSecret) return true;
  return !cronSecret && !syncSecret;
}

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin || 'https://everest-calendar.vercel.app';
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 2000) }; }
}

function rowsFromResponse(source: StepResult['source'], data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (source === 'ga4' && typeof d.synced === 'number') return d.synced;
  if (source === 'ga4_pages' && typeof d.rows_upserted === 'number') return d.rows_upserted;
  if (source === 'gsc' && typeof d.branded_rows_inserted === 'number') return d.branded_rows_inserted;
  return null;
}

function statusFromResponse(ok: boolean, data: unknown): SyncStatus {
  if (!ok) return 'failed';
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).errors)) return 'partial';
  return 'success';
}

async function latestDates() {
  const supabase = createServiceClient();
  const [ga4, pages, gsc] = await Promise.all([
    supabase.from('marketing_metrics_daily').select('date').not('ga_sessions', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ga_pages_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('brand_tracking_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    ga4: ga4.data?.date ?? null,
    ga4_pages: pages.data?.date ?? null,
    gsc: gsc.data?.date ?? null,
  };
}

async function writeRunState(result: StepResult) {
  const supabase = createServiceClient();
  await supabase.from('system_config').upsert({
    key: `google_data_sync.${result.source}`,
    value_text: JSON.stringify(result),
    description: `Latest Google data sync status for ${result.source}`,
    source: 'api/cron/google-data-sync',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
}

async function runStep(request: NextRequest, source: StepResult['source'], path: string, body: object): Promise<StepResult> {
  const started = new Date().toISOString();
  let httpStatus: number | undefined;
  let raw: unknown = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(`${appOrigin(request)}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sync-secret': process.env.MARKETING_SYNC_SECRET ?? '',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    httpStatus = res.status;
    raw = await readJsonSafe(res);
    if (!res.ok) errorMessage = JSON.stringify(raw).slice(0, 1000);
  } catch (err) {
    errorMessage = (err as Error).message;
  }

  const dates = await latestDates().catch(() => ({ ga4: null, ga4_pages: null, gsc: null }));
  const result: StepResult = {
    source,
    status: statusFromResponse(!errorMessage && (httpStatus ?? 500) < 400, raw),
    http_status: httpStatus,
    rows_synced: rowsFromResponse(source, raw),
    latest_data_date: dates[source],
    started_at: started,
    completed_at: new Date().toISOString(),
    error_message: errorMessage,
    raw_response: raw,
  };
  await writeRunState(result);
  return result;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: StepResult[] = [];
  results.push(await runStep(request, 'ga4', '/api/marketing/sync/ga4', { days: 7 }));
  results.push(await runStep(request, 'ga4_pages', '/api/marketing/sync/ga4-pages', { days: 14, kryo_only: true }));
  results.push(await runStep(request, 'gsc', '/api/marketing/sync/gsc', { days: 30 }));

  const status: SyncStatus = results.every(r => r.status === 'success') ? 'success' : results.some(r => r.status === 'success') ? 'partial' : 'failed';
  const summary = { status, completed_at: new Date().toISOString(), results };

  await createServiceClient().from('system_config').upsert({
    key: 'google_data_sync.summary',
    value_text: JSON.stringify(summary),
    description: 'Latest GA4/GSC sync summary',
    source: 'api/cron/google-data-sync',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  return NextResponse.json(summary, { status: status === 'failed' ? 500 : 200 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
