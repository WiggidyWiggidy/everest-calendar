import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  type AnalyticsMode,
  buildOperatorPacket,
  createGuardrailAlertIfNeeded,
  finishJobRun,
  getAnalyticsFreshness,
  getSupabaseService,
  isJobDue,
  persistCanonicalFactsFromScorecard,
  persistOperatorSnapshots,
  startJobRun,
} from '@/lib/marketing/analytics-ops';

async function authenticate(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, schedulerSource: request.headers.get('x-runner-source') === 'launchd' ? 'launchd' as const : 'manual' as const };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, schedulerSource: 'manual' as const };
  return { authenticated: false, schedulerSource: 'manual' as const };
}

async function postJson(baseUrl: string, path: string, syncSecret: string, body?: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function runSentinel(baseUrl: string, syncSecret: string) {
  const supabase = getSupabaseService();
  const freshness = await getAnalyticsFreshness(supabase);
  const snapshot = await supabase.rpc('get_ga4_48h_snapshot');
  const warnings = snapshot.data?.freshness?.warnings ?? [];
  const summary: Record<string, unknown> = {
    freshness,
    ga4_snapshot_ok: !snapshot.error,
    ga4_snapshot_warnings: warnings,
  };

  if (freshness.trust_state === 'stale') {
    await createGuardrailAlertIfNeeded(supabase, 'analytics_freshness', `KRYO analytics trust is stale: ${freshness.stale_reason ?? 'unknown reason'}`, { freshness });
  }
  if (Array.isArray(warnings) && warnings.length > 0) {
    await createGuardrailAlertIfNeeded(supabase, 'analytics_route_leakage', `GA4 48h snapshot warnings: ${warnings.join(', ')}`, { warnings });
  }

  const hotDue = await isJobDue(supabase, 'kryo_analytics_hot');
  summary.hot_due = hotDue.due;
  summary.hot_stale_gap_minutes = hotDue.staleGapMinutes;

  if (hotDue.due) {
    summary.hot_trigger = await runHot(baseUrl, syncSecret, 'launchd');
  }

  return summary;
}

async function runHot(baseUrl: string, syncSecret: string, schedulerSource: 'launchd' | 'manual') {
  const supabase = getSupabaseService();
  const due = await isJobDue(supabase, 'kryo_analytics_hot');
  const started = await startJobRun(supabase, 'kryo_analytics_hot', 'hot', schedulerSource, 'hot', due.staleGapMinutes);
  try {
    if (!due.due) {
      const summary = { skipped: true, reason: 'not_due' };
      await finishJobRun(supabase, started.id, 'skipped', started.started_at, summary);
      return summary;
    }

    const allowLegacyGa4Sync = process.env.ALLOW_LEGACY_GA4_SYNC === 'true';
    const ga4Hourly = allowLegacyGa4Sync
      ? await postJson(baseUrl, '/api/marketing/sync/ga4-hourly', syncSecret, { days: 3, kryo_only: false, trigger: 'analytics_hot_lane' })
      : { ok: true, status: 200, body: { skipped: true, reason: 'legacy_ga4_sync_quarantined', required_env: 'ALLOW_LEGACY_GA4_SYNC=true' } };
    const scorecard = await persistCanonicalFactsFromScorecard(supabase, 'Asia/Dubai');
    const packet = await buildOperatorPacket(supabase, { reportTimeZone: 'Asia/Dubai' });
    const freshness = await getAnalyticsFreshness(supabase);
    await persistOperatorSnapshots(supabase, packet, freshness);

    const summary = {
      ga4_hourly: ga4Hourly,
      scorecard_window: scorecard.windows.current,
      trust_state: freshness.trust_state,
      stale_reason: freshness.stale_reason,
    };
    await finishJobRun(supabase, started.id, ga4Hourly.ok ? 'success' : 'warning', started.started_at, summary, ga4Hourly.ok ? null : JSON.stringify(ga4Hourly.body));
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJobRun(supabase, started.id, 'failed', started.started_at, { error: message }, message);
    throw error;
  }
}

async function runCold(baseUrl: string, syncSecret: string, schedulerSource: 'vercel_daily' | 'manual') {
  const supabase = getSupabaseService();
  const due = await isJobDue(supabase, 'kryo_analytics_cold');
  const started = await startJobRun(supabase, 'kryo_analytics_cold', 'cold', schedulerSource, 'cold', due.staleGapMinutes);
  try {
    const allowQuarantinedSyncs = process.env.ALLOW_QUARANTINED_MARKETING_SYNCS === 'true';
    const safeSyncPaths = [
      ['/api/marketing/sync/clarity', {}],
      ['/api/marketing/sync/shopify', {}],
      ['/api/marketing/sync/shopify-funnel', {}],
      ['/api/marketing/launch/process-attribution', {}],
      ['/api/marketing/launch/refresh-findings', {}],
    ] as const;
    const quarantinedSyncPaths = [
      ['/api/marketing/sync/meta', {}],
      ['/api/marketing/sync/meta-campaigns', {}],
      ['/api/marketing/sync/extract-assets', {}],
      ['/api/marketing/sync/resolve-meta-asset-urls', {}],
      ['/api/marketing/sync/meta-ad-insights', {}],
      ['/api/marketing/sync/meta-dce', {}],
      ['/api/marketing/sync/ga4', {}],
      ['/api/marketing/sync/ga4-pages', {}],
      ['/api/marketing/sync/ga4-hourly', { days: 3, kryo_only: false, trigger: 'analytics_cold_lane' }],
      ['/api/marketing/sync/gsc', {}],
    ] as const;
    const syncPaths = allowQuarantinedSyncs ? [...safeSyncPaths, ...quarantinedSyncPaths] : safeSyncPaths;

    const results: Record<string, unknown> = {};
    if (!allowQuarantinedSyncs) {
      results.quarantined_syncs = {
        ok: true,
        skipped: quarantinedSyncPaths.map(([path]) => path),
        reason: 'quarantined legacy syncs require ALLOW_QUARANTINED_MARKETING_SYNCS=true',
      };
    }
    for (const [path, body] of syncPaths) {
      results[path] = await postJson(baseUrl, path, syncSecret, body);
    }

    try {
      const { data, error } = await supabase.rpc('compute_clarity_section_heatmap');
      results.section_heatmap = error ? { ok: false, error: error.message } : { ok: true, rows: data ?? 0 };
    } catch (error) {
      results.section_heatmap = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    try {
      const { data, error } = await supabase.rpc('judge_experiment_outcomes', { p_report_date: new Date().toISOString().slice(0, 10) });
      results.experiment_readouts = error ? { ok: false, error: error.message } : { ok: true, body: data };
    } catch (error) {
      results.experiment_readouts = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    await persistCanonicalFactsFromScorecard(supabase, 'Asia/Dubai');
    const packet = await buildOperatorPacket(supabase, { reportTimeZone: 'Asia/Dubai' });
    const freshness = await getAnalyticsFreshness(supabase);
    await persistOperatorSnapshots(supabase, packet, freshness);

    const allOk = Object.values(results).every((value) => typeof value === 'object' && value !== null && 'ok' in value ? Boolean((value as { ok?: boolean }).ok) : true);
    await finishJobRun(supabase, started.id, allOk ? 'success' : 'warning', started.started_at, results);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJobRun(supabase, started.id, 'failed', started.started_at, { error: message }, message);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const mode = (body.mode ?? 'sentinel') as AnalyticsMode;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
    const syncSecret = process.env.MARKETING_SYNC_SECRET || '';
    if (!syncSecret) return NextResponse.json({ error: 'MARKETING_SYNC_SECRET not configured' }, { status: 500 });

    if (mode === 'sentinel') {
      const supabase = getSupabaseService();
      const due = await isJobDue(supabase, 'kryo_analytics_sentinel');
      const started = await startJobRun(supabase, 'kryo_analytics_sentinel', 'sentinel', auth.schedulerSource === 'manual' ? 'manual' : 'launchd', 'sentinel', due.staleGapMinutes);
      try {
        const summary = await runSentinel(baseUrl, syncSecret);
        await finishJobRun(supabase, started.id, 'success', started.started_at, summary);
        return NextResponse.json({ success: true, mode, summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishJobRun(supabase, started.id, 'failed', started.started_at, { error: message }, message);
        throw error;
      }
    }

    if (mode === 'hot') {
      const summary = await runHot(baseUrl, syncSecret, auth.schedulerSource === 'manual' ? 'manual' : 'launchd');
      return NextResponse.json({ success: true, mode, summary });
    }

    if (mode === 'cold') {
      const summary = await runCold(baseUrl, syncSecret, auth.schedulerSource === 'manual' ? 'manual' : 'vercel_daily');
      return NextResponse.json({ success: true, mode, summary });
    }

    if (mode === 'backfill') {
      const days = Math.min(Math.max(Number(body.days ?? 7), 1), 90);
      const summary = await postJson(baseUrl, '/api/marketing/launch/process-attribution', syncSecret, { days });
      return NextResponse.json({ success: true, mode, days, summary });
    }

    return NextResponse.json({ error: `Unsupported mode: ${mode}` }, { status: 400 });
  } catch (error) {
    console.error('run-analytics-cycle error:', error);
    return NextResponse.json({ error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
