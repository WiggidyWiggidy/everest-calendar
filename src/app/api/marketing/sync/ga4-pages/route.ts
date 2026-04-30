// /api/marketing/sync/ga4-pages
// Per-page GA4 sync. Pulls 90 days of pagePath × date metrics from GA4 Data API and writes to ga_pages_daily.
// Reveals which pages bleed users (bounce rate, exit rate) vs convert (ATC, purchase events) per URL.
// Wired into process-directives daily 06:00 UTC cron.
//
// Default scope: KRYO pages only (page_path contains 'kryo' or '/products/' or top KRYO LP variants).
// Override with kryo_only=false in body to pull ALL pages.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const DEFAULT_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

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
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
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

interface GA4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const propertyId = process.env.GA_PROPERTY_ID;
    if (!propertyId || !process.env.GA_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({
        error: 'GA4 credentials not configured',
        missing: [!propertyId && 'GA_PROPERTY_ID', !process.env.GA_SERVICE_ACCOUNT_JSON && 'GA_SERVICE_ACCOUNT_JSON'].filter(Boolean),
      }, { status: 400 });
    }

    let days = 90;
    let kryoOnly = true;
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body.days === 'number') days = Math.min(Math.max(parseInt(body.days), 1), 365);
      if (body.kryo_only === false) kryoOnly = false;
    } catch { /* defaults */ }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });

    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const until = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Single GA4 runReport — date × pagePath × pageTitle with the rich engagement metric set
    const reportBody = {
      dateRanges: [{ startDate: since, endDate: until }],
      dimensions: [
        { name: 'date' },
        { name: 'pagePath' },
        { name: 'pageTitle' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'activeUsers' },
        { name: 'averageSessionDuration' },
        { name: 'userEngagementDuration' },
        { name: 'engagementRate' },
        { name: 'bounceRate' },
        { name: 'eventCount' },
        { name: 'addToCarts' },
        { name: 'checkouts' },
        { name: 'ecommercePurchases' },
        { name: 'purchaseRevenue' },
        { name: 'itemsViewed' },
      ],
      // Filter to KRYO-related pages by default. /products/kryo* + /pages/kryo*.
      ...(kryoOnly && {
        dimensionFilter: {
          orGroup: {
            expressions: [
              { filter: { fieldName: 'pagePath', stringFilter: { value: '/products/kryo', matchType: 'BEGINS_WITH' } } },
              { filter: { fieldName: 'pagePath', stringFilter: { value: '/pages/kryo', matchType: 'CONTAINS' } } },
              { filter: { fieldName: 'pagePath', stringFilter: { value: '/kryo', matchType: 'CONTAINS' } } },
            ],
          },
        },
      }),
      limit: 10000,
    };

    const reportRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reportBody),
      }
    );

    if (!reportRes.ok) {
      const err = await reportRes.text();
      return NextResponse.json({ error: 'GA4 runReport failed', status: reportRes.status, detail: err.slice(0, 1000) }, { status: 502 });
    }

    const json = await reportRes.json();
    const rows: GA4Row[] = json.rows ?? [];

    const supabase = auth.userId ? await createClient() : createServiceClient();
    void DEFAULT_USER_ID;

    let upserted = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const dims = row.dimensionValues ?? [];
      const mets = row.metricValues ?? [];
      const yyyymmdd = dims[0]?.value ?? '';
      const date = yyyymmdd.length === 8 ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : null;
      if (!date) continue;
      const page_path = dims[1]?.value ?? null;
      const page_title = dims[2]?.value ?? null;
      if (!page_path) continue;

      const num = (i: number, fallback = 0): number => {
        const v = mets[i]?.value;
        if (v === undefined || v === null) return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };

      const sessions = Math.round(num(0));
      const pageviews = Math.round(num(1));
      const totalUsers = Math.round(num(2));
      const newUsers = Math.round(num(3));
      const activeUsers = Math.round(num(4));
      const avgSessionDur = num(5);
      const engagementDur = num(6);
      const engagementRate = num(7);
      const bounceRate = num(8);
      const eventsPerSession = sessions > 0 ? num(9) / sessions : 0;
      const addToCarts = Math.round(num(10));
      const beginCheckouts = Math.round(num(11));
      const purchases = Math.round(num(12));
      const purchaseRevenue = num(13);
      const viewItems = Math.round(num(14));

      const record = {
        date,
        page_path,
        page_title,
        sessions,
        screen_page_views: pageviews,
        total_users: totalUsers,
        new_users: newUsers,
        active_users: activeUsers,
        avg_session_duration_sec: avgSessionDur,
        user_engagement_duration_sec: engagementDur,
        engagement_rate: engagementRate,
        bounce_rate: bounceRate,
        events_per_session: eventsPerSession,
        add_to_carts: addToCarts,
        begin_checkouts: beginCheckouts,
        purchases,
        purchase_revenue: purchaseRevenue,
        view_items: viewItems,
        view_to_atc_rate: viewItems > 0 ? addToCarts / viewItems : null,
        atc_to_checkout_rate: addToCarts > 0 ? beginCheckouts / addToCarts : null,
        checkout_to_purchase_rate: beginCheckouts > 0 ? purchases / beginCheckouts : null,
        page_conversion_rate: sessions > 0 ? purchases / sessions : null,
      };

      const { error: upErr } = await supabase
        .from('ga_pages_daily')
        .upsert(record, { onConflict: 'date,page_path' });
      if (upErr) errors.push(`${date} ${page_path}: ${upErr.message}`);
      else upserted++;
    }

    return NextResponse.json({
      success: true,
      kryo_only: kryoOnly,
      days_range: { since, until },
      rows_returned: rows.length,
      rows_upserted: upserted,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    console.error('sync/ga4-pages error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
