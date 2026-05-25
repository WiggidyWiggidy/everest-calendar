import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

async function authenticateSync(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) return { authenticated: true, userId: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, userId: user.id };
  return { authenticated: false, userId: null };
}

const BRAND_TERMS = ['kryo', 'isu-001', 'isu001', 'ice shower', 'portable ice bath', 'everest labs'];

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const siteUrl = process.env.GSC_SITE_URL;
    if (!siteUrl || !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
      return NextResponse.json({
        error: 'GSC OAuth credentials not configured',
        missing: [!siteUrl && 'GSC_SITE_URL', !process.env.GOOGLE_OAUTH_REFRESH_TOKEN && 'GOOGLE_OAUTH_REFRESH_TOKEN'].filter(Boolean),
      }, { status: 400 });
    }

    let days = 7;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.days) days = Math.min(Math.max(parseInt(body.days, 10), 3), 486);
    } catch { /* defaults */ }

    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() - 3);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - days + 1);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const accessToken = await getGoogleAccessTokenFromRefreshToken();
    const searchRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: startStr, endDate: endStr, dimensions: ['query', 'date'], rowLimit: 25000 }),
    });
    if (!searchRes.ok) {
      const err = await searchRes.text();
      return NextResponse.json({ error: 'GSC API error', status: searchRes.status, detail: err.slice(0, 1000) }, { status: 502 });
    }

    const searchData = await searchRes.json();
    const rows = searchData.rows ?? [];
    const supabase = auth.userId ? await createClient() : createServiceClient();
    let inserted = 0;
    const errors: string[] = [];
    const dailyTotals: Record<string, { impressions: number; clicks: number }> = {};

    for (const row of rows) {
      const query = String(row.keys?.[0] ?? '').toLowerCase();
      const date = row.keys?.[1];
      if (!date) continue;
      const isBranded = BRAND_TERMS.some(term => query.includes(term));
      if (!isBranded) continue;
      const impressions = Math.round(row.impressions ?? 0);
      const clicks = Math.round(row.clicks ?? 0);
      const { error } = await supabase.from('brand_tracking_daily').upsert({
        date,
        source: 'google_search_console',
        term: query,
        impressions,
        clicks,
        avg_position: row.position ? Math.round(row.position * 100) / 100 : null,
      }, { onConflict: 'date,source,term' });
      if (error) errors.push(`${date} ${query}: ${error.message}`);
      else inserted++;
      if (!dailyTotals[date]) dailyTotals[date] = { impressions: 0, clicks: 0 };
      dailyTotals[date].impressions += impressions;
      dailyTotals[date].clicks += clicks;
    }

    for (const [date, totals] of Object.entries(dailyTotals)) {
      const { error } = await supabase.from('brand_tracking_daily').upsert({
        date,
        source: 'google_search_console',
        term: '_branded_total',
        impressions: totals.impressions,
        clicks: totals.clicks,
      }, { onConflict: 'date,source,term' });
      if (error) errors.push(`${date} _branded_total: ${error.message}`);
    }

    return NextResponse.json({
      synced: true,
      date_range: { start: startStr, end: endStr },
      total_rows: rows.length,
      branded_rows_inserted: inserted,
      daily_totals: dailyTotals,
      errors: errors.length ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    console.error('sync/gsc error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
