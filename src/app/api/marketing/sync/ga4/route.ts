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

async function getGoogleAccessToken(): Promise<string | null> {
  const saJson = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;

  // Decode base64 service account JSON
  const sa = JSON.parse(Buffer.from(saJson, 'base64').toString('utf-8'));

  // Create JWT for Google OAuth2
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  // Sign with private key
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, 'base64url');

  const jwt = `${header}.${payload}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
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

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const reportRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateStr, endDate: dateStr }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'conversions' },
          ],
        }),
      }
    );

    if (!reportRes.ok) {
      const err = await reportRes.text();
      return NextResponse.json({ error: 'GA4 API error', detail: err }, { status: 500 });
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
        ga_sessions: sessions,
        ga_users: users,
        ga_new_users: newUsers,
        ga_bounce_rate: bounceRate,
        ga_avg_session_duration: avgDuration,
        ga_conversion_rate: conversionRate,
        data_source: 'api',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      synced: true,
      date: dateStr,
      metrics: { sessions, users, newUsers, bounceRate, avgDuration, conversionRate },
    });
  } catch (err) {
    console.error('sync/ga4 error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
