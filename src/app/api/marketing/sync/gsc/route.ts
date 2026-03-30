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

  const sa = JSON.parse(Buffer.from(saJson, 'base64').toString('utf-8'));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
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
}

// Branded terms to track -- add more as brand grows
const BRAND_TERMS = ['kryo', 'isu-001', 'isu001', 'ice shower', 'portable ice bath', 'everest labs'];

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const siteUrl = process.env.GSC_SITE_URL;
    if (!siteUrl || !process.env.GA_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({
        error: 'GSC credentials not configured',
        missing: [!siteUrl && 'GSC_SITE_URL', !process.env.GA_SERVICE_ACCOUNT_JSON && 'GA_SERVICE_ACCOUNT_JSON'].filter(Boolean),
      }, { status: 400 });
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });
    }

    // Query last 3 days (GSC data has 2-3 day delay)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 4);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const searchRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startStr,
          endDate: endStr,
          dimensions: ['query', 'date'],
          rowLimit: 500,
        }),
      }
    );

    if (!searchRes.ok) {
      const err = await searchRes.text();
      return NextResponse.json({ error: 'GSC API error', detail: err }, { status: 500 });
    }

    const searchData = await searchRes.json();
    const rows = searchData.rows ?? [];

    // Filter for branded terms and upsert
    const supabase = await createClient();
    let inserted = 0;

    for (const row of rows) {
      const query = (row.keys?.[0] ?? '').toLowerCase();
      const date = row.keys?.[1];

      // Check if query contains any branded term
      const isBranded = BRAND_TERMS.some(term => query.includes(term));
      if (!isBranded) continue;

      const { error } = await supabase
        .from('brand_tracking_daily')
        .upsert({
          date,
          source: 'google_search_console',
          term: query,
          impressions: Math.round(row.impressions ?? 0),
          clicks: Math.round(row.clicks ?? 0),
          avg_position: row.position ? Math.round(row.position * 100) / 100 : null,
        }, { onConflict: 'date,source,term' });

      if (!error) inserted++;
    }

    // Also insert total branded search volume per day
    const dailyTotals: Record<string, { impressions: number; clicks: number }> = {};
    for (const row of rows) {
      const query = (row.keys?.[0] ?? '').toLowerCase();
      const date = row.keys?.[1];
      const isBranded = BRAND_TERMS.some(term => query.includes(term));
      if (!isBranded) continue;

      if (!dailyTotals[date]) dailyTotals[date] = { impressions: 0, clicks: 0 };
      dailyTotals[date].impressions += Math.round(row.impressions ?? 0);
      dailyTotals[date].clicks += Math.round(row.clicks ?? 0);
    }

    for (const [date, totals] of Object.entries(dailyTotals)) {
      await supabase
        .from('brand_tracking_daily')
        .upsert({
          date,
          source: 'google_search_console',
          term: '_branded_total',
          impressions: totals.impressions,
          clicks: totals.clicks,
        }, { onConflict: 'date,source,term' });
    }

    return NextResponse.json({
      synced: true,
      date_range: { start: startStr, end: endStr },
      total_rows: rows.length,
      branded_rows_inserted: inserted,
      daily_totals: dailyTotals,
    });
  } catch (err) {
    console.error('sync/gsc error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
