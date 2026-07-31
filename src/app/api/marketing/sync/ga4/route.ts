import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createSign } from 'crypto';

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

async function getServiceAccountAccessToken(): Promise<string | null> {
  const saJson = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const sa = JSON.parse(Buffer.from(saJson, 'base64').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');

    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(sa.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  } catch {
    return null;
  }
}

async function getOAuthAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function getGoogleAccessToken(): Promise<{ accessToken: string | null; authMethod: string }> {
  const serviceAccountToken = await getServiceAccountAccessToken();
  if (serviceAccountToken) return { accessToken: serviceAccountToken, authMethod: 'service_account' };
  const oauthToken = await getOAuthAccessToken();
  if (oauthToken) return { accessToken: oauthToken, authMethod: 'oauth_refresh_token' };
  return { accessToken: null, authMethod: 'none' };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const propertyId = process.env.GA_PROPERTY_ID;
    if (!propertyId || !process.env.GA_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({
        error: 'GA4 credentials not configured',
        missing: [!propertyId && 'GA_PROPERTY_ID', !process.env.GA_SERVICE_ACCOUNT_JSON && 'GA_SERVICE_ACCOUNT_JSON'].filter(Boolean),
      }, { status: 400 });
    }


    const { accessToken, authMethod: initialAuthMethod } = await getGoogleAccessToken();
    let authMethod = initialAuthMethod;
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });
    }

    let days = 1;
    let startDate: string | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.date) startDate = body.date;
      if (body.days) days = Math.min(Math.max(parseInt(body.days, 10), 1), 30);
    } catch { /* defaults */ }

    if (!startDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = yesterday.toISOString().split('T')[0];
    }

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

      const reportBody = {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'conversions' },
        ],
      };

      const runReport = async (token: string) => fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reportBody),
        }
      );

      let reportRes = await runReport(accessToken);
      let effectiveAuthMethod = authMethod;

      if (!reportRes.ok && authMethod === 'service_account') {
        const oauthToken = await getOAuthAccessToken();
        if (oauthToken) {
          reportRes = await runReport(oauthToken);
          effectiveAuthMethod = 'oauth_refresh_token_after_service_account_failed';
        }
      }

      if (!reportRes.ok) {
        const err = await reportRes.text();
        errors.push(`${dateStr}: ${err.slice(0, 500)}`);
        continue;
      }

      const reportData = await reportRes.json();
      const row = reportData.rows?.[0]?.metricValues ?? [];

      const sessions = parseInt(row[0]?.value ?? '0');
      const users = parseInt(row[1]?.value ?? '0');
      const newUsers = parseInt(row[2]?.value ?? '0');
      const bounceRate = parseFloat(row[3]?.value ?? '0');
      const avgDuration = Math.round(parseFloat(row[4]?.value ?? '0'));
      const conversions = parseInt(row[5]?.value ?? '0');
      const conversionRate = sessions > 0 ? conversions / sessions : 0;

      const { error: upsertError } = await supabase
        .from('marketing_metrics_daily')
        .upsert({
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

      if (effectiveAuthMethod !== authMethod) {
        authMethod = effectiveAuthMethod;
      }
    }

    return NextResponse.json({
      synced: synced.length,
      days_processed: days,
      auth_method: authMethod,
      rows: synced,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('sync/ga4 error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
