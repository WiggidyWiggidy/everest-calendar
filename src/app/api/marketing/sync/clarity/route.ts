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
    // numOfDays: 1=24h, 2=48h, 3=72h. We use 2 to catch yesterday reliably.
    const clarityRes = await fetch(
      `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=2&dimension1=URL`,
      {
        headers: {
          Authorization: `Bearer ${clarityToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!clarityRes.ok) {
      const err = await clarityRes.text();
      return NextResponse.json({ error: 'Clarity API error', detail: err }, { status: 500 });
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

    return NextResponse.json({
      synced: true,
      date: dateStr,
      metrics: { engagementScore, rageClicks, deadClicks, avgScrollDepth },
    });
  } catch (err) {
    console.error('sync/clarity error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
