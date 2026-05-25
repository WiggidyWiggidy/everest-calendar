export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

function authorized(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function isoDate(daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('days') || '7', 10), 1), 90);
  const start = isoDate(days);
  const supabase = createServiceClient();

  const [daily, pages, search, syncState] = await Promise.all([
    supabase.from('marketing_metrics_daily')
      .select('date,ga_sessions,ga_users,ga_new_users,ga_bounce_rate,ga_avg_session_duration,ga_conversion_rate')
      .gte('date', start).not('ga_sessions', 'is', null).order('date', { ascending: false }),
    supabase.from('ga_pages_daily')
      .select('date,page_path,page_title,sessions,screen_page_views,total_users,new_users,engagement_rate,bounce_rate,user_engagement_duration_sec,events_per_session')
      .gte('date', start).order('date', { ascending: false }).order('sessions', { ascending: false }).limit(100),
    supabase.from('brand_tracking_daily')
      .select('date,term,clicks,impressions,avg_position')
      .gte('date', start).order('date', { ascending: false }).order('impressions', { ascending: false }).limit(100),
    supabase.from('system_config')
      .select('key,value_text,updated_at')
      .in('key', ['google_data_sync.summary', 'google_data_sync.ga4', 'google_data_sync.ga4_pages', 'google_data_sync.gsc']),
  ]);

  return NextResponse.json({
    date_range: { start, days },
    freshness: syncState.data ?? [],
    daily: daily.data ?? [],
    top_pages: pages.data ?? [],
    search_terms: search.data ?? [],
    errors: [daily.error, pages.error, search.error, syncState.error].filter(Boolean).map(e => e?.message),
  });
}
