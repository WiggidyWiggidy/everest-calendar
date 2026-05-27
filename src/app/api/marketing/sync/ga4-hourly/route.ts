import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createHash, createSign } from 'crypto';

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

    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(sa.private_key, 'base64url');
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

interface GA4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

function rowKey(parts: Array<string | null | undefined>): string {
  return createHash('sha256')
    .update(parts.map(p => p ?? '').join('\u001f'))
    .digest('hex');
}

function dateHourToIso(dateHour: string, timezoneOffset = '+04:00'): string | null {
  if (!/^\d{10}$/.test(dateHour)) return null;
  const y = dateHour.slice(0, 4);
  const m = dateHour.slice(4, 6);
  const d = dateHour.slice(6, 8);
  const h = dateHour.slice(8, 10);
  const parsed = new Date(`${y}-${m}-${d}T${h}:00:00${timezoneOffset}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function metricNumber(row: GA4Row, index: number, fallback = 0): number {
  const v = row.metricValues?.[index]?.value;
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function runGa4Report(propertyId: string, accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GA4 runReport failed ${res.status}: ${detail.slice(0, 1000)}`);
  }
  return res.json() as Promise<{ rows?: GA4Row[]; rowCount?: number }>;
}

function mergeGa4Rows(primaryRows: GA4Row[] = [], extraRows: GA4Row[] = []): GA4Row[] {
  const keyFor = (row: GA4Row) => (row.dimensionValues ?? []).map(d => d.value ?? '').join('\u001f');
  const extraByKey = new Map(extraRows.map(row => [keyFor(row), row]));
  return primaryRows.map(row => {
    const extra = extraByKey.get(keyFor(row));
    if (!extra) return row;
    return {
      dimensionValues: row.dimensionValues,
      metricValues: [...(row.metricValues ?? []), ...(extra.metricValues ?? [])],
    };
  });
}

async function runMergedGa4Report(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>,
  primaryMetrics: Array<{ name: string }>,
  extraMetrics: Array<{ name: string }>,
) {
  const primary = await runGa4Report(propertyId, accessToken, { ...body, metrics: primaryMetrics });
  if (extraMetrics.length === 0) return primary;
  const extra = await runGa4Report(propertyId, accessToken, { ...body, metrics: extraMetrics });
  return { ...primary, rows: mergeGa4Rows(primary.rows ?? [], extra.rows ?? []) };
}

const METRICS = [
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
];

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const propertyId = process.env.GA_PROPERTY_ID;
    const hasServiceAccount = Boolean(process.env.GA_SERVICE_ACCOUNT_JSON);
    const hasOAuth = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
    if (!propertyId || (!hasServiceAccount && !hasOAuth)) {
      return NextResponse.json({
        error: 'GA4 credentials not configured',
        missing: [
          !propertyId && 'GA_PROPERTY_ID',
          !hasServiceAccount && !hasOAuth && 'GA_SERVICE_ACCOUNT_JSON or GOOGLE_OAUTH_*',
        ].filter(Boolean),
      }, { status: 400 });
    }

    let days = 3;
    let includeAllPages = true;
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body.days === 'number') days = Math.min(Math.max(parseInt(String(body.days), 10), 1), 7);
      if (body.kryo_only === true) includeAllPages = false;
    } catch { /* default */ }

    let { accessToken, authMethod } = await getGoogleAccessToken();
    if (!accessToken) return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });

    const reportTimeZone = process.env.GA4_REPORT_TIMEZONE || 'Asia/Dubai';
    const reportTimezoneOffset = process.env.GA4_REPORT_TZ_OFFSET || '+04:00';
    const startDaysAgo = Math.max(days - 1, 0);
    const since = startDaysAgo === 0 ? 'today' : `${startDaysAgo}daysAgo`;
    const until = 'today';
    const dateRanges = [{ startDate: since, endDate: until }];
    const nowIso = new Date().toISOString();
    const todayInReportTimeZone = new Intl.DateTimeFormat('en-CA', {
      timeZone: reportTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const todayDateHourPrefix = todayInReportTimeZone.replace(/-/g, '');

    const pageDimensionFilter = includeAllPages ? undefined : {
      orGroup: {
        expressions: [
          { filter: { fieldName: 'pagePath', stringFilter: { value: '/products/kryo', matchType: 'BEGINS_WITH' } } },
          { filter: { fieldName: 'pagePath', stringFilter: { value: '/pages/kryo', matchType: 'CONTAINS' } } },
          { filter: { fieldName: 'pagePath', stringFilter: { value: '/kryo', matchType: 'CONTAINS' } } },
          { filter: { fieldName: 'pageTitle', stringFilter: { value: '404', matchType: 'CONTAINS', caseSensitive: false } } },
        ],
      },
    };

    let siteReport: { rows?: GA4Row[]; rowCount?: number };
    let pageReport: { rows?: GA4Row[]; rowCount?: number };
    try {
      siteReport = await runMergedGa4Report(propertyId, accessToken, {
        dateRanges,
        dimensions: [{ name: 'dateHour' }],
        limit: 1000,
      }, METRICS.slice(0, 10), METRICS.slice(10, 14));

      pageReport = await runMergedGa4Report(propertyId, accessToken, {
        dateRanges,
        dimensions: [
          { name: 'dateHour' },
          { name: 'pagePath' },
          { name: 'pageTitle' },
          { name: 'country' },
          { name: 'deviceCategory' },
          { name: 'sessionSourceMedium' },
          { name: 'sessionCampaignName' },
        ],
        ...(pageDimensionFilter && { dimensionFilter: pageDimensionFilter }),
        limit: 50000,
      }, METRICS.slice(0, 10), METRICS.slice(10));
    } catch (err) {
      if (authMethod === 'service_account' && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
        const oauthToken = await getOAuthAccessToken();
        if (!oauthToken) throw err;
        accessToken = oauthToken;
        authMethod = 'oauth_refresh_token_after_service_account_failed';
        siteReport = await runMergedGa4Report(propertyId, accessToken, {
          dateRanges,
          dimensions: [{ name: 'dateHour' }],
          limit: 1000,
        }, METRICS.slice(0, 10), METRICS.slice(10, 14));
        pageReport = await runMergedGa4Report(propertyId, accessToken, {
          dateRanges,
          dimensions: [
            { name: 'dateHour' },
            { name: 'pagePath' },
            { name: 'pageTitle' },
            { name: 'country' },
            { name: 'deviceCategory' },
            { name: 'sessionSourceMedium' },
            { name: 'sessionCampaignName' },
          ],
          ...(pageDimensionFilter && { dimensionFilter: pageDimensionFilter }),
          limit: 50000,
        }, METRICS.slice(0, 10), METRICS.slice(10));
      } else {
        throw err;
      }
    }

    const supabase = auth.userId ? await createClient() : createServiceClient();

    const siteRecords = (siteReport.rows ?? []).map(row => {
      const dateHour = row.dimensionValues?.[0]?.value ?? '';
      const reportHour = dateHourToIso(dateHour, reportTimezoneOffset);
      if (!reportHour) return null;
      const sessions = Math.round(metricNumber(row, 0));
      const addToCarts = Math.round(metricNumber(row, 10));
      const beginCheckouts = Math.round(metricNumber(row, 11));
      const purchases = Math.round(metricNumber(row, 12));
      return {
        row_key: rowKey(['site', dateHour]),
        report_hour: reportHour,
        date_hour: dateHour,
        sessions,
        screen_page_views: Math.round(metricNumber(row, 1)),
        total_users: Math.round(metricNumber(row, 2)),
        new_users: Math.round(metricNumber(row, 3)),
        active_users: Math.round(metricNumber(row, 4)),
        average_session_duration_sec: metricNumber(row, 5),
        user_engagement_duration_sec: metricNumber(row, 6),
        engagement_rate: metricNumber(row, 7),
        bounce_rate: metricNumber(row, 8),
        event_count: Math.round(metricNumber(row, 9)),
        add_to_carts: addToCarts,
        begin_checkouts: beginCheckouts,
        purchases,
        purchase_revenue: metricNumber(row, 13),
        raw_payload: row,
        synced_at: nowIso,
      };
    }).filter(Boolean);

    const pageRecords = (pageReport.rows ?? []).map(row => {
      const dims = row.dimensionValues ?? [];
      const dateHour = dims[0]?.value ?? '';
      const reportHour = dateHourToIso(dateHour, reportTimezoneOffset);
      const pagePath = dims[1]?.value ?? '';
      if (!reportHour || !pagePath) return null;
      const sessions = Math.round(metricNumber(row, 0));
      const viewItems = Math.round(metricNumber(row, 14));
      const addToCarts = Math.round(metricNumber(row, 10));
      const beginCheckouts = Math.round(metricNumber(row, 11));
      const purchases = Math.round(metricNumber(row, 12));
      return {
        row_key: rowKey(['page', dateHour, pagePath, dims[2]?.value, dims[3]?.value, dims[4]?.value, dims[5]?.value, dims[6]?.value]),
        report_hour: reportHour,
        date_hour: dateHour,
        page_path: pagePath,
        page_title: dims[2]?.value ?? null,
        country: dims[3]?.value ?? null,
        device_category: dims[4]?.value ?? null,
        session_source_medium: dims[5]?.value ?? null,
        session_campaign_name: dims[6]?.value ?? null,
        sessions,
        screen_page_views: Math.round(metricNumber(row, 1)),
        total_users: Math.round(metricNumber(row, 2)),
        new_users: Math.round(metricNumber(row, 3)),
        active_users: Math.round(metricNumber(row, 4)),
        average_session_duration_sec: metricNumber(row, 5),
        user_engagement_duration_sec: metricNumber(row, 6),
        engagement_rate: metricNumber(row, 7),
        bounce_rate: metricNumber(row, 8),
        event_count: Math.round(metricNumber(row, 9)),
        events_per_session: sessions > 0 ? metricNumber(row, 9) / sessions : 0,
        add_to_carts: addToCarts,
        begin_checkouts: beginCheckouts,
        purchases,
        purchase_revenue: metricNumber(row, 13),
        view_items: viewItems,
        view_to_atc_rate: viewItems > 0 ? addToCarts / viewItems : null,
        atc_to_checkout_rate: addToCarts > 0 ? beginCheckouts / addToCarts : null,
        checkout_to_purchase_rate: beginCheckouts > 0 ? purchases / beginCheckouts : null,
        page_conversion_rate: sessions > 0 ? purchases / sessions : null,
        raw_payload: row,
        synced_at: nowIso,
      };
    }).filter(Boolean);

    const errors: string[] = [];
    const upsertBatch = async (table: string, records: unknown[]) => {
      let upserted = 0;
      for (let i = 0; i < records.length; i += 500) {
        const batch = records.slice(i, i + 500);
        if (batch.length === 0) continue;
        const { error } = await supabase.from(table).upsert(batch, { onConflict: 'row_key' });
        if (error) errors.push(`${table} batch ${i}: ${error.message}`);
        else upserted += batch.length;
      }
      return upserted;
    };

    const siteUpserted = await upsertBatch('ga4_site_hourly', siteRecords);
    const pageUpserted = await upsertBatch('ga4_page_hourly', pageRecords);

    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    await supabase.from('ga4_site_hourly').delete().lt('report_hour', cutoff);
    await supabase.from('ga4_page_hourly').delete().lt('report_hour', cutoff);

    const latestReportHour = siteRecords
      .map(record => (record as { report_hour?: string }).report_hour)
      .filter((hour): hour is string => Boolean(hour))
      .sort()
      .at(-1) ?? null;
    const latestReportHourLagMinutes = latestReportHour
      ? Math.round((Date.now() - new Date(latestReportHour).getTime()) / 60000)
      : null;
    const todaySiteRows = siteRecords.filter(record =>
      ((record as { date_hour?: string }).date_hour ?? '').startsWith(todayDateHourPrefix)
    ).length;
    const warnings = [
      latestReportHour === null ? 'ga4_returned_no_hourly_rows' : null,
      latestReportHourLagMinutes !== null && latestReportHourLagMinutes > 180 ? 'ga4_latest_report_hour_lag_over_3h' : null,
      todaySiteRows === 0 ? 'ga4_no_today_rows_returned' : null,
    ].filter(Boolean);

    return NextResponse.json({
      success: errors.length === 0,
      days_requested: days,
      range: { since, until, report_timezone: reportTimeZone, report_timezone_offset: reportTimezoneOffset },
      include_all_pages: includeAllPages,
      auth_method: authMethod,
      latest_report_hour: latestReportHour,
      latest_report_hour_lag_minutes: latestReportHourLagMinutes,
      today_site_rows: todaySiteRows,
      same_day_ready: Boolean(todaySiteRows > 0 && errors.length === 0),
      site_rows_returned: siteReport.rows?.length ?? 0,
      page_rows_returned: pageReport.rows?.length ?? 0,
      site_rows_upserted: siteUpserted,
      page_rows_upserted: pageUpserted,
      warnings: warnings.length ? warnings : undefined,
      errors: errors.length ? errors.slice(0, 20) : undefined,
    }, { status: errors.length ? 207 : 200 });
  } catch (err) {
    console.error('sync/ga4-hourly error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
