import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Clarity's project-live-insights endpoint returns 9 metrics, each with a per-URL breakdown.
// Three response shapes:
//   - 6 "frustration" metrics (RageClickCount, DeadClickCount, QuickbackClick, ExcessiveScroll,
//     ScriptErrorCount, ErrorClickCount) → { sessionsCount, sessionsWithMetricPercentage, subTotal, Url }
//   - Traffic → { totalSessionCount, distinctUserCount, pagesPerSessionPercentage, Url }
//   - ScrollDepth → { averageScrollDepth, Url }
//   - EngagementTime → { totalTime, activeTime, Url }

type ClarityMetric = {
  metricName: string;
  information: Array<{
    // Frustration metrics (RageClickCount, DeadClickCount, QuickbackClick, ExcessiveScroll, ScriptErrorCount, ErrorClickCount)
    sessionsCount?: string;
    sessionsWithMetricPercentage?: number;
    sessionsWithoutMetricPercentage?: number;
    pagesViews?: string;
    subTotal?: string;
    // Traffic metric
    totalSessionCount?: string;
    totalBotSessionCount?: string;
    distinctUserCount?: string;
    pagesPerSessionPercentage?: number;
    // ScrollDepth metric
    averageScrollDepth?: number;
    // EngagementTime metric (seconds)
    totalTime?: string;
    activeTime?: string;
    Url?: string | null;
  }>;
};

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

/**
 * Per-URL aggregation for FRUSTRATION metrics (RageClickCount, DeadClickCount, QuickbackClick,
 * ExcessiveScroll, ScriptErrorCount, ErrorClickCount). These all share the same row shape:
 *   { sessionsCount, sessionsWithMetricPercentage, subTotal, Url }
 *
 * - sessionsWithMetric = sessionsCount * sessionsWithMetricPercentage / 100  (how many sessions had it)
 * - eventCount         = subTotal                                            (raw # of events)
 */
function aggregateFrustrationByUrl(metric: ClarityMetric | undefined): Map<string, { totalSessions: number; sessionsWithMetric: number; eventCount: number }> {
  const out = new Map<string, { totalSessions: number; sessionsWithMetric: number; eventCount: number }>();
  if (!metric?.information) return out;
  for (const row of metric.information) {
    const url = row.Url ?? '';
    if (!url) continue;
    const s = Number(row.sessionsCount ?? 0);
    const pct = Number(row.sessionsWithMetricPercentage ?? 0);
    const sub = Number(row.subTotal ?? 0);
    const cur = out.get(url) ?? { totalSessions: 0, sessionsWithMetric: 0, eventCount: 0 };
    cur.totalSessions += s;
    cur.sessionsWithMetric += s * pct / 100;
    cur.eventCount += sub;
    out.set(url, cur);
  }
  return out;
}

/**
 * Per-URL aggregation for the Traffic metric.
 * Shape: { totalSessionCount, totalBotSessionCount, distinctUserCount, pagesPerSessionPercentage, Url }
 */
function aggregateTrafficByUrl(metric: ClarityMetric | undefined): Map<string, { sessions: number; users: number }> {
  const out = new Map<string, { sessions: number; users: number }>();
  if (!metric?.information) return out;
  for (const row of metric.information) {
    const url = row.Url ?? '';
    if (!url) continue;
    const s = Number(row.totalSessionCount ?? 0);
    const u = Number(row.distinctUserCount ?? 0);
    const cur = out.get(url) ?? { sessions: 0, users: 0 };
    cur.sessions += s;
    cur.users += u;
    out.set(url, cur);
  }
  return out;
}

/** ScrollDepth: { averageScrollDepth, Url } */
function aggregateScrollByUrl(metric: ClarityMetric | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!metric?.information) return out;
  for (const row of metric.information) {
    const url = row.Url ?? '';
    if (!url) continue;
    out.set(url, Number(row.averageScrollDepth ?? 0));
  }
  return out;
}

/** EngagementTime: { totalTime, activeTime, Url } — both in seconds. We use activeTime (real engagement). */
function aggregateEngagementByUrl(metric: ClarityMetric | undefined): Map<string, { active: number; total: number }> {
  const out = new Map<string, { active: number; total: number }>();
  if (!metric?.information) return out;
  for (const row of metric.information) {
    const url = row.Url ?? '';
    if (!url) continue;
    const a = Number(row.activeTime ?? 0);
    const t = Number(row.totalTime ?? 0);
    const cur = out.get(url) ?? { active: 0, total: 0 };
    cur.active += a;
    cur.total += t;
    out.set(url, cur);
  }
  return out;
}

/** Site-wide totals helper for frustration metrics — sums subTotal across all rows. */
function sumFrustration(data: ClarityMetric[], name: string): number {
  const m = data.find(x => x.metricName === name);
  if (!m) return 0;
  return m.information.reduce((s, r) => s + Number(r.subTotal ?? 0), 0);
}

async function runSync(userIdOverride: string | null) {
  const clarityToken = process.env.CLARITY_API_TOKEN;
  const clarityProjectId = process.env.CLARITY_PROJECT_ID;
  if (!clarityToken || !clarityProjectId) {
    return { error: 'Clarity credentials not configured', status: 400 as const };
  }

  // numOfDays: 1=24h, 2=48h, 3=72h. Use 3 (max) so each pull captures the widest window
  // and intraday cron runs always refresh the latest rolling window.
  const clarityRes = await fetch(
    `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=URL`,
    {
      headers: {
        Authorization: `Bearer ${clarityToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!clarityRes.ok) {
    const err = await clarityRes.text();
    return { error: 'Clarity API error', detail: err, status: 500 as const };
  }

  const clarityData = (await clarityRes.json()) as ClarityMetric[];

  // The sync date represents "yesterday" relative to UTC — Clarity reports trail by a day.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  // === Per-URL aggregations (used for both daily totals + friction rows) ===
  const trafficByUrl = aggregateTrafficByUrl(clarityData.find(m => m.metricName === 'Traffic'));
  const scrollByUrl = aggregateScrollByUrl(clarityData.find(m => m.metricName === 'ScrollDepth'));
  const engageByUrl = aggregateEngagementByUrl(clarityData.find(m => m.metricName === 'EngagementTime'));
  const rageByUrl = aggregateFrustrationByUrl(clarityData.find(m => m.metricName === 'RageClickCount'));
  const deadByUrl = aggregateFrustrationByUrl(clarityData.find(m => m.metricName === 'DeadClickCount'));
  const quickByUrl = aggregateFrustrationByUrl(clarityData.find(m => m.metricName === 'QuickbackClick'));
  const excessByUrl = aggregateFrustrationByUrl(clarityData.find(m => m.metricName === 'ExcessiveScroll'));
  const scriptByUrl = aggregateFrustrationByUrl(clarityData.find(m => m.metricName === 'ScriptErrorCount'));
  const errClickByUrl = aggregateFrustrationByUrl(clarityData.find(m => m.metricName === 'ErrorClickCount'));

  // === Daily site-wide totals → marketing_metrics_daily ===
  const rageClicks = sumFrustration(clarityData, 'RageClickCount');
  const deadClicks = sumFrustration(clarityData, 'DeadClickCount');
  const quickBacks = sumFrustration(clarityData, 'QuickbackClick');
  const scriptErrors = sumFrustration(clarityData, 'ScriptErrorCount');

  // Site-wide totals from per-URL aggregates
  const totalSessions = Array.from(trafficByUrl.values()).reduce((s, v) => s + v.sessions, 0);

  // Site-wide weighted avg scroll depth (weight by URL sessions)
  let scrollNumer = 0, scrollDenom = 0;
  Array.from(scrollByUrl.entries()).forEach(([url, depth]) => {
    const sess = trafficByUrl.get(url)?.sessions ?? 0;
    if (sess > 0 && depth > 0) {
      scrollNumer += depth * sess;
      scrollDenom += sess;
    }
  });
  const avgScrollDepth = scrollDenom > 0 ? scrollNumer / scrollDenom : null;

  // Site-wide weighted avg engagement (active seconds per session)
  let engageActive = 0, engageSess = 0;
  Array.from(engageByUrl.entries()).forEach(([url, eng]) => {
    const sess = trafficByUrl.get(url)?.sessions ?? 0;
    engageActive += eng.active;
    engageSess += sess;
  });
  const avgEngagementTime = engageSess > 0 ? engageActive / engageSess : null;

  // Engagement score (0-100): scroll weighted 60%, time weighted 40% (cap at 120s engagement)
  const scrollScore = avgScrollDepth ?? 0;
  const timeScore = avgEngagementTime != null ? Math.min((avgEngagementTime / 120) * 100, 100) : 0;
  const engagementScore = totalSessions > 0 ? Math.round(scrollScore * 0.6 + timeScore * 0.4) : null;

  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = userIdOverride ? await createClient() : createServiceClient();
  const userId = userIdOverride || '174f2dff-7a96-464c-a919-b473c328d531';

  const { error: upsertError } = await supabase
    .from('marketing_metrics_daily')
    .upsert({
      user_id: userId,
      date: dateStr,
      clarity_engagement_score: engagementScore,
      clarity_rage_clicks: rageClicks,
      clarity_dead_clicks: deadClicks,
      clarity_avg_scroll_depth: avgScrollDepth,
      clarity_quick_backs: quickBacks,
      clarity_script_errors: scriptErrors,
      clarity_avg_engagement_sec: avgEngagementTime,
      clarity_total_sessions: totalSessions,
      data_source: 'api',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

  if (upsertError) {
    return { error: upsertError.message, status: 500 as const };
  }

  // === Per-URL friction → clarity_friction_elements ===
  // (aggregators are already computed above for daily totals — reuse them)
  // Union of all URLs across metrics — some pages have errors but no rage clicks, etc.
  const allUrls = new Set<string>([
    ...Array.from(trafficByUrl.keys()),
    ...Array.from(rageByUrl.keys()),
    ...Array.from(deadByUrl.keys()),
    ...Array.from(quickByUrl.keys()),
    ...Array.from(scriptByUrl.keys()),
    ...Array.from(excessByUrl.keys()),
    ...Array.from(errClickByUrl.keys()),
  ]);

  let frictionUrlsWritten = 0;

  if (allUrls.size > 0) {
    // Lookup landing_page_id by URL pathname match
    const { data: lps } = await supabase
      .from('landing_pages')
      .select('id, shopify_url')
      .eq('user_id', userId);
    const lpByPath: Record<string, string> = {};
    for (const lp of (lps ?? []) as Array<{ id: string; shopify_url: string | null }>) {
      if (lp.shopify_url) {
        try { lpByPath[new URL(lp.shopify_url).pathname] = lp.id; } catch { /* ignore malformed */ }
      }
    }

    // Z-score on rage-click EVENT counts so top offenders surface (rage clicks are rare;
    // we rank pages by raw event count)
    const rageVals = Array.from(rageByUrl.values()).map(v => Math.round(v.eventCount));
    const mean = rageVals.length ? rageVals.reduce((a, b) => a + b, 0) / rageVals.length : 0;
    const variance = rageVals.length ? rageVals.reduce((a, b) => a + (b - mean) ** 2, 0) / rageVals.length : 0;
    const sd = Math.sqrt(variance) || 1;
    const topUrls = new Set<string>(
      Array.from(rageByUrl.entries())
        .sort((a, b) => b[1].eventCount - a[1].eventCount)
        .slice(0, 3)
        .map(([u]) => u)
    );

    const frictionRows = Array.from(allUrls).map(url => {
      let path = url;
      try { path = new URL(url).pathname; } catch { /* keep raw */ }

      // total_sessions from Traffic metric — falls back to max session count seen in frustration metrics if Traffic is missing
      const trafficSess = trafficByUrl.get(url)?.sessions ?? 0;
      const fallbackSess = Math.max(
        rageByUrl.get(url)?.totalSessions ?? 0,
        deadByUrl.get(url)?.totalSessions ?? 0,
        quickByUrl.get(url)?.totalSessions ?? 0,
      );
      const totalSess = trafficSess > 0 ? trafficSess : fallbackSess;

      // Event counts (raw # of events) from subTotal — better than session count for ranking friction
      const rage = Math.round(rageByUrl.get(url)?.eventCount ?? 0);
      const dead = Math.round(deadByUrl.get(url)?.eventCount ?? 0);
      const quick = Math.round(quickByUrl.get(url)?.eventCount ?? 0);
      const excess = Math.round(excessByUrl.get(url)?.eventCount ?? 0);
      const scriptErr = Math.round(scriptByUrl.get(url)?.eventCount ?? 0);
      const errClick = Math.round(errClickByUrl.get(url)?.eventCount ?? 0);

      const avgScroll = scrollByUrl.get(url) ?? null;
      const eng = engageByUrl.get(url);
      const avgEngage = eng && totalSess > 0 ? eng.active / totalSess : null;

      return {
        date: dateStr,
        landing_page_id: lpByPath[path] ?? null,
        page_url: url,
        element_selector: 'page_aggregate',
        total_sessions: totalSess,
        rage_click_count: rage,
        dead_click_count: dead,
        quick_back_count: quick,
        excessive_scroll_count: excess,
        script_error_count: scriptErr,
        error_click_count: errClick,
        avg_scroll_depth_pct: avgScroll,
        avg_engagement_time_sec: avgEngage,
        rage_click_zscore: sd > 0 ? Number(((rage - mean) / sd).toFixed(3)) : null,
        is_top_offender: topUrls.has(url),
        raw_clarity_payload: { source: 'live-insights', day_offset: 1, captured_at: new Date().toISOString() },
      };
    });

    const { error: frictionErr } = await supabase
      .from('clarity_friction_elements')
      .upsert(frictionRows, { onConflict: 'date,page_url,element_selector' });

    if (frictionErr) {
      console.warn('clarity_friction_elements upsert (non-fatal):', frictionErr.message);
    } else {
      frictionUrlsWritten = frictionRows.length;
    }
  }

  return {
    synced: true,
    date: dateStr,
    metrics: {
      total_sessions: totalSessions,
      engagement_score: engagementScore,
      rage_clicks: rageClicks,
      dead_clicks: deadClicks,
      quick_backs: quickBacks,
      script_errors: scriptErrors,
      avg_scroll_depth: avgScrollDepth,
      avg_engagement_sec: avgEngagementTime,
    },
    friction_urls: frictionUrlsWritten,
    status: 200 as const,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await runSync(auth.userId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error, detail: (result as { detail?: string }).detail }, { status: result.status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('sync/clarity POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET handler for Vercel Cron (Vercel cron only sends GET).
// Authenticates via Authorization: Bearer ${CRON_SECRET} OR x-sync-secret header.
export async function GET(request: NextRequest) {
  try {
    const cronHeader = request.headers.get('authorization');
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const syncSecret = request.headers.get('x-sync-secret');
    const expectedSync = process.env.MARKETING_SYNC_SECRET;

    const cronOk = expectedCron && cronHeader === expectedCron;
    const syncOk = syncSecret && expectedSync && syncSecret === expectedSync;

    if (!cronOk && !syncOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runSync(null);
    if ('error' in result) {
      return NextResponse.json({ error: result.error, detail: (result as { detail?: string }).detail }, { status: result.status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('sync/clarity GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
