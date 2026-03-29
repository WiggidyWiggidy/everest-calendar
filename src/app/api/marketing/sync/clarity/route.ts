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

    // Clarity Export API
    const clarityRes = await fetch(
      `https://www.clarity.ms/export-data/api/v1/${clarityProjectId}/dashboard?startDate=${dateStr}&endDate=${dateStr}`,
      { headers: { Authorization: `Bearer ${clarityToken}` } }
    );

    if (!clarityRes.ok) {
      const err = await clarityRes.text();
      return NextResponse.json({ error: 'Clarity API error', detail: err }, { status: 500 });
    }

    const clarityData = await clarityRes.json();

    const engagementScore = clarityData.engagementScore ?? null;
    const rageClicks = clarityData.rageClicks ?? null;
    const deadClicks = clarityData.deadClicks ?? null;
    const avgScrollDepth = clarityData.avgScrollDepth ?? null;

    const supabase = await createClient();
    let userId = auth.userId;
    if (!userId) {
      const { data: existing } = await supabase.from('marketing_metrics_daily').select('user_id').limit(1);
      userId = existing?.[0]?.user_id;
    }
    if (!userId) return NextResponse.json({ error: 'No user found' }, { status: 400 });

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
