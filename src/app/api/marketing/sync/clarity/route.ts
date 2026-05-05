import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clarityToken = process.env.CLARITY_API_TOKEN;
    const clarityProjectId = process.env.CLARITY_PROJECT_ID;
    if (!clarityToken || !clarityProjectId) {
      return NextResponse.json({
        error: 'Clarity credentials not configured',
        missing: [!clarityToken && 'CLARITY_API_TOKEN', !clarityProjectId && 'CLARITY_PROJECT_ID'].filter(Boolean),
      }, { status: 400 });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Clarity Export API — correct endpoint (token is project-scoped, no project ID in URL)
    // numOfDays: 1=24h, 2=48h, 3=72h. Try 3 (max) for the broadest window.
    // Diagnostics are now always returned — operator can spot project/domain mismatches.
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
      return NextResponse.json({
        error: 'Clarity API error',
        detail: err,
        // Surface project ID so we can spot wrong-project mismatches
        clarity_project_id_env: clarityProjectId,
      }, { status: 500 });
    }

    // Clarity returns array of metric objects: [{metricName, information:[{dimensionValue, metricValue}]}]
    const clarityData = (await clarityRes.json()) as { metricName: string; information: { dimensionValue: string; metricValue: number }[] }[];

    // Aggregate across all URLs to get site-wide totals
    const sumMetric = (name: string): number => {
      const entry = clarityData.find(m => m.metricName === name);
      if (!entry) return 0;
      return entry.information.reduce((s, r) => s + (r.metricValue ?? 0), 0);
    };

    const avgMetric = (name: string): number | null => {
      const entry = clarityData.find(m => m.metricName === name);
      if (!entry || entry.information.length === 0) return null;
      const total = entry.information.reduce((s, r) => s + (r.metricValue ?? 0), 0);
      return total / entry.information.length;
    };

    const totalTraffic = sumMetric('Traffic');
    const rageClicks = sumMetric('RageClickCount');
    const deadClicks = sumMetric('DeadClickCount');
    const avgScrollDepth = avgMetric('ScrollDepth');
    const avgEngagementTime = avgMetric('EngagementTime');

    // Diagnostics: which URLs returned data, distinct domains seen, total events.
    // Helps spot: wrong project, wrong domain (myshopify.com vs everestlabs.co).
    const trafficEntry = clarityData.find(m => m.metricName === 'Traffic');
    const urlBreakdown = (trafficEntry?.information ?? [])
      .map(r => ({ url: r.dimensionValue, traffic: r.metricValue }))
      .sort((a, b) => (b.traffic || 0) - (a.traffic || 0));
    const distinctDomains = new Set(
      urlBreakdown
        .map(u => { try { return new URL(u.url || '').hostname; } catch { return null; } })
        .filter(Boolean),
    );
    const diagnostics = {
      clarity_project_id_env: clarityProjectId,
      api_window_days: 3,
      metric_names_returned: clarityData.map(m => m.metricName),
      total_traffic_events: totalTraffic,
      distinct_domains: Array.from(distinctDomains),
      top_5_urls: urlBreakdown.slice(0, 5),
    };

    // Derive an engagement score (0-100) from scroll depth + engagement time
    // scroll depth (0-100) weighted 60%, engagement time normalised to 0-100 weighted 40%
    // engagement time: assume 120s = 100 score
    const scrollScore = avgScrollDepth ?? 0;
    const timeScore = avgEngagementTime != null ? Math.min((avgEngagementTime / 120) * 100, 100) : 0;
    const engagementScore = totalTraffic > 0 ? Math.round(scrollScore * 0.6 + timeScore * 0.4) : null;

    // Use service client when authenticated via sync secret (no user session)
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();
    const userId = auth.userId || '174f2dff-7a96-464c-a919-b473c328d531';

    const { error: upsertError } = await supabase
      .from('marketing_metrics_daily')
      .upsert({
        user_id: userId,
        date: dateStr,
        clarity_engagement_score: engagementScore,
        clarity_rage_clicks: rageClicks,
        clarity_dead_clicks: deadClicks,
        clarity_avg_scroll_depth: avgScrollDepth,
        data_source: 'api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Phase 2 W3: emit per-URL friction rows into clarity_friction_elements.
    // Clarity API exposes per-URL aggregates; per-element selectors aren't in the public API yet,
    // so we use element_selector='page_aggregate' as a placeholder. When Clarity exposes element-
    // level heatmap data (or we wire a custom storefront pixel), this same table absorbs it.
    const ragePerUrl = clarityData.find(m => m.metricName === 'RageClickCount')?.information ?? [];
    const deadPerUrl = clarityData.find(m => m.metricName === 'DeadClickCount')?.information ?? [];

    // Collect unique URLs that appear in either rage or dead click metric
    const allUrls = new Set<string>([
      ...ragePerUrl.map(r => r.dimensionValue),
      ...deadPerUrl.map(r => r.dimensionValue),
    ]);

    if (allUrls.size > 0) {
      // Lookup landing_page_id by URL match for the rows we're about to write
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

      // Build per-URL counts. Compute Z-score across the day's URLs to flag top offenders.
      const rageMap = new Map<string, number>();
      ragePerUrl.forEach(r => rageMap.set(r.dimensionValue, r.metricValue ?? 0));
      const deadMap = new Map<string, number>();
      deadPerUrl.forEach(d => deadMap.set(d.dimensionValue, d.metricValue ?? 0));
      const rageVals = Array.from(rageMap.values());
      const mean = rageVals.length ? rageVals.reduce((a, b) => a + b, 0) / rageVals.length : 0;
      const variance = rageVals.length ? rageVals.reduce((a, b) => a + (b - mean) ** 2, 0) / rageVals.length : 0;
      const sd = Math.sqrt(variance) || 1;

      // Identify top-3 by rage count
      const topUrls = new Set<string>(
        Array.from(rageMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([u]) => u)
      );

      const frictionRows = Array.from(allUrls).map(url => {
        let path = url;
        try { path = new URL(url).pathname; } catch { /* keep raw */ }
        const rage = rageMap.get(url) ?? 0;
        const dead = deadMap.get(url) ?? 0;
        return {
          date: dateStr,
          landing_page_id: lpByPath[path] ?? null,
          page_url: url,
          element_selector: 'page_aggregate',
          rage_click_count: rage,
          dead_click_count: dead,
          rage_click_zscore: sd > 0 ? Number(((rage - mean) / sd).toFixed(3)) : null,
          is_top_offender: topUrls.has(url),
          raw_clarity_payload: { source: 'live-insights', day_offset: 1 },
        };
      });

      const { error: frictionErr } = await supabase
        .from('clarity_friction_elements')
        .upsert(frictionRows, { onConflict: 'date,page_url,element_selector' });

      if (frictionErr) {
        console.warn('clarity_friction_elements upsert (non-fatal):', frictionErr.message);
      }
    }

    return NextResponse.json({
      synced: true,
      date: dateStr,
      metrics: { engagementScore, rageClicks, deadClicks, avgScrollDepth },
      friction_urls: allUrls.size,
      // Always include diagnostics so the operator can spot project/domain mismatches
      // without needing a second debug call. Cheap — just metadata about what we read.
      diagnostics,
    });
  } catch (err) {
    console.error('sync/clarity error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
