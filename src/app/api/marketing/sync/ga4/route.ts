import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

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

async function runGa4DailyReport(propertyId: string, accessToken: string, dateStr: string, includeKeyEvents: boolean) {
  const metrics = [
    { name: 'sessions' },
    { name: 'totalUsers' },
    { name: 'newUsers' },
    { name: 'bounceRate' },
    { name: 'averageSessionDuration' },
    ...(includeKeyEvents ? [{ name: 'keyEvents' }] : []),
  ];
  return fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: dateStr, endDate: dateStr }], metrics }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const propertyId = process.env.GA_PROPERTY_ID;
    if (!propertyId || !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
      return NextResponse.json({
        error: 'GA4 OAuth credentials not configured',
        missing: [!propertyId && 'GA_PROPERTY_ID', !process.env.GOOGLE_OAUTH_REFRESH_TOKEN && 'GOOGLE_OAUTH_REFRESH_TOKEN'].filter(Boolean),
      }, { status: 400 });
    }

    let days = 1;
    let startDate: string | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.date) startDate = body.date;
      if (body.days) days = Math.min(Math.max(parseInt(body.days, 10), 1), 365);
    } catch { /* defaults */ }

    if (!startDate) {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      startDate = yesterday.toISOString().split('T')[0];
    }

    const accessToken = await getGoogleAccessTokenFromRefreshToken();
    const supabase = auth.userId ? await createClient() : createServiceClient();
    let userId = auth.userId;
    if (!userId) {
      const { data: existing } = await supabase.from('marketing_metrics_daily').select('user_id').limit(1);
      userId = existing?.[0]?.user_id;
    }
    if (!userId) return NextResponse.json({ error: 'No user found' }, { status: 400 });

    const synced: Array<{ date: string; sessions: number; users: number; newUsers: number; bounceRate: number; avgDuration: number; conversionRate: number }> = [];
    const errors: string[] = [];

    for (let d = 0; d < days; d++) {
      const day = new Date(`${startDate}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - d);
      const dateStr = day.toISOString().split('T')[0];

      let reportRes = await runGa4DailyReport(propertyId, accessToken, dateStr, true);
      let usedKeyEvents = true;
      if (!reportRes.ok) {
        const firstErr = await reportRes.text();
        // Some properties/API versions may not expose keyEvents. Retry without it so sessions still sync.
        if (/keyEvents|Metric keyEvents|Invalid metric/i.test(firstErr)) {
          reportRes = await runGa4DailyReport(propertyId, accessToken, dateStr, false);
          usedKeyEvents = false;
        } else {
          errors.push(`${dateStr}: ${firstErr.slice(0, 500)}`);
          continue;
        }
      }
      if (!reportRes.ok) {
        const err = await reportRes.text();
        errors.push(`${dateStr}: ${err.slice(0, 500)}`);
        continue;
      }

      const reportData = await reportRes.json();
      const row = reportData.rows?.[0]?.metricValues ?? [];
      const sessions = parseInt(row[0]?.value ?? '0', 10);
      const users = parseInt(row[1]?.value ?? '0', 10);
      const newUsers = parseInt(row[2]?.value ?? '0', 10);
      const bounceRate = parseFloat(row[3]?.value ?? '0');
      const avgDuration = Math.round(parseFloat(row[4]?.value ?? '0'));
      const conversions = usedKeyEvents ? parseFloat(row[5]?.value ?? '0') : 0;
      const conversionRate = sessions > 0 ? conversions / sessions : 0;

      const { error: upsertError } = await supabase.from('marketing_metrics_daily').upsert({
        user_id: userId,
        date: dateStr,
        ga_sessions: sessions,
        ga_users: users,
        ga_new_users: newUsers,
        ga_bounce_rate: bounceRate,
        ga_avg_session_duration: avgDuration,
        ga_conversion_rate: conversionRate,
        data_source: 'api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });

      if (upsertError) errors.push(`${dateStr}: ${upsertError.message}`);
      else synced.push({ date: dateStr, sessions, users, newUsers, bounceRate, avgDuration, conversionRate });
    }

    return NextResponse.json({ synced: synced.length, days_processed: days, rows: synced, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('sync/ga4 error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
