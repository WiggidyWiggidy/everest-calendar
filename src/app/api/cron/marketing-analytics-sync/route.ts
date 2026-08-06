export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

type Step = {
  ok: boolean;
  status?: number;
  elapsed_ms: number;
  body?: unknown;
  error?: string;
  skipped?: boolean;
  reason?: string;
};

type SyncStep = {
  name: string;
  path: string;
  body?: object;
  enabled: boolean;
  reason_when_disabled?: string;
};

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const syncSecret = process.env.MARKETING_SYNC_SECRET;
  if (syncSecret && request.headers.get('x-sync-secret') === syncSecret) return true;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}` ||
    request.headers.get('x-cron-secret') === secret ||
    request.nextUrl.searchParams.get('secret') === secret;
}

function envEnabled(name: string) {
  return process.env[name] === 'true';
}

function skipped(reason: string): Step {
  return { ok: true, skipped: true, reason, elapsed_ms: 0, body: { skipped: true, reason } };
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

function buildSteps(): SyncStep[] {
  const metaEnabled = envEnabled('MARKETING_SYNC_META_ENABLED');
  const ga4Enabled = envEnabled('MARKETING_SYNC_GA4_ENABLED');
  const gscEnabled = envEnabled('MARKETING_SYNC_GSC_ENABLED');
  const clarityEnabled = envEnabled('MARKETING_SYNC_CLARITY_ENABLED');

  return [
    {
      name: 'meta',
      path: '/api/marketing/sync/meta',
      enabled: metaEnabled,
      reason_when_disabled: 'disabled_until_official_meta_graph_token_is_validated',
    },
    {
      name: 'meta_campaigns',
      path: '/api/marketing/sync/meta-campaigns',
      enabled: metaEnabled,
      reason_when_disabled: 'disabled_until_official_meta_graph_token_is_validated',
    },
    {
      name: 'meta_ad_insights',
      path: '/api/marketing/sync/meta-ad-insights',
      body: { days: 8 },
      enabled: metaEnabled,
      reason_when_disabled: 'disabled_until_official_meta_graph_token_is_validated',
    },
    {
      name: 'meta_hourly',
      path: '/api/marketing/sync/meta-hourly',
      body: { days: 8 },
      enabled: metaEnabled,
      reason_when_disabled: 'disabled_until_official_meta_graph_token_is_validated',
    },
    {
      name: 'meta_dce',
      path: '/api/marketing/sync/meta-dce',
      body: { days: 8 },
      enabled: metaEnabled,
      reason_when_disabled: 'disabled_until_official_meta_graph_token_is_validated',
    },
    {
      name: 'meta_url_audit',
      path: '/api/marketing/sync/meta-url-audit',
      enabled: metaEnabled,
      reason_when_disabled: 'disabled_until_official_meta_graph_token_is_validated',
    },
    {
      name: 'clarity',
      path: '/api/marketing/sync/clarity',
      enabled: clarityEnabled,
      reason_when_disabled: 'disabled_by_default_secondary_context_only',
    },
    {
      name: 'shopify',
      path: '/api/marketing/sync/shopify',
      enabled: true,
    },
    {
      name: 'shopify_funnel',
      path: '/api/marketing/sync/shopify-funnel',
      enabled: true,
    },
    {
      name: 'ga4_hourly',
      path: '/api/marketing/sync/ga4-hourly',
      body: { days: 7, kryo_only: false },
      enabled: ga4Enabled,
      reason_when_disabled: 'disabled_until_ga4_property_permission_is_validated',
    },
    {
      name: 'gsc',
      path: '/api/marketing/sync/gsc',
      body: { days: 14, freshDays: 2, includeHourly: false },
      enabled: gscEnabled,
      reason_when_disabled: 'disabled_until_gsc_oauth_refresh_token_is_validated',
    },
    {
      name: 'process_attribution',
      path: '/api/marketing/launch/process-attribution',
      enabled: true,
    },
    {
      name: 'refresh_findings',
      path: '/api/marketing/launch/refresh-findings',
      enabled: true,
    },
    {
      name: 'scorecard',
      path: '/api/marketing/kryo/scorecard',
      enabled: true,
    },
  ];
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createServiceClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin || 'https://everest-calendar.vercel.app';
  const { data: run, error: runError } = await sb.from('marketing_analytics_sync_runs')
    .insert({ status: 'running', trigger: request.nextUrl.searchParams.get('trigger') || 'daily_cron' }).select('id').single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const results: Record<string, Step> = {};
  const steps = buildSteps();

  for (const step of steps) {
    results[step.name] = step.enabled
      ? await call(baseUrl, step.path, step.body ?? {})
      : skipped(step.reason_when_disabled ?? 'disabled');
  }

  const failed = Object.entries(results)
    .filter(([, result]) => !result.ok)
    .map(([name]) => name);
  const skippedSteps = Object.entries(results)
    .filter(([, result]) => result.skipped)
    .map(([name]) => name);
  const attempted = Object.keys(results).filter((name) => !results[name].skipped);
  const status = failed.length === 0 ? 'success' : failed.length === attempted.length ? 'failed' : 'partial';
  const scorecardBody = results.scorecard?.body as { scorecard?: { id?: string } } | undefined;
  await sb.from('marketing_analytics_sync_runs').update({
    completed_at: new Date().toISOString(),
    status,
    source_results: results,
    scorecard_id: scorecardBody?.scorecard?.id ?? null,
  }).eq('id', run.id);
  return NextResponse.json({ status, failed, skipped: skippedSteps, results }, { status: status === 'failed' ? 500 : 200 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
