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
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
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

async function getGoogleAccessToken() {
  const oauth = await getOAuthAccessToken();
  if (oauth) return { accessToken: oauth, authMethod: 'oauth_refresh_token' };
  const sa = await getServiceAccountAccessToken();
  if (sa) return { accessToken: sa, authMethod: 'service_account' };
  return { accessToken: null, authMethod: 'none' };
}

function classifyQueryGroup(query: string): string {
  const q = query.toLowerCase();
  if (/\bkryo\b/.test(q)) return 'kryo_exact';
  if (/everest labs|everest ice bath|everest water filter/.test(q)) return 'branded';
  if (/portable ice bath|ice shower|cold plunge shower|cold shower machine/.test(q)) return 'kryo_adjacent';
  if (/ice bath|cold plunge|cold therapy|morning benefits|benefits/.test(q)) return 'cold_therapy_adjacent';
  return 'irrelevant_or_other';
}

function inferProductHandle(page: string): string {
  if (/kryo/i.test(page)) return 'kryo2';
  return 'kryo2';
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const siteUrl = process.env.GSC_SITE_URL;
    if (!siteUrl) {
      return NextResponse.json({ error: 'GSC_SITE_URL not configured' }, { status: 400 });
    }

    const { accessToken, authMethod } = await getGoogleAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 8);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const searchRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: startStr,
        endDate: endStr,
        dimensions: ['query', 'page', 'country', 'device', 'date'],
        rowLimit: 5000,
      }),
    });

    if (!searchRes.ok) {
      return NextResponse.json({ error: 'GSC API error', detail: await searchRes.text() }, { status: 500 });
    }

    const searchData = await searchRes.json();
    const rows = searchData.rows ?? [];
    const supabase = auth.userId ? await createClient() : createServiceClient();
    let upserted = 0;
    let brandedUpserted = 0;

    for (const row of rows) {
      const [queryRaw, pageRaw, countryRaw, deviceRaw, dateRaw] = row.keys ?? [];
      const query = String(queryRaw ?? '').trim().toLowerCase();
      const page = String(pageRaw ?? '').trim();
      const country = countryRaw ? String(countryRaw).trim() : null;
      const device = deviceRaw ? String(deviceRaw).trim() : null;
      const reportDate = String(dateRaw ?? '').trim();
      if (!query || !page || !reportDate) continue;
      const queryGroup = classifyQueryGroup(query);
      const productHandle = inferProductHandle(page);

      const { error } = await supabase.from('kryo_search_daily').upsert({
        report_date: reportDate,
        query,
        page,
        country,
        device,
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        ctr: row.ctr ?? null,
        avg_position: row.position ?? null,
        query_group: queryGroup,
        product_handle: productHandle,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'report_date,query,page,country,device,product_handle' });
      if (!error) upserted++;

      if (queryGroup === 'branded' || queryGroup === 'kryo_exact') {
        const { error: brandError } = await supabase.from('brand_tracking_daily').upsert({
          date: reportDate,
          source: 'google_search_console',
          term: query,
          impressions: Math.round(row.impressions ?? 0),
          clicks: Math.round(row.clicks ?? 0),
          avg_position: row.position ? Math.round(row.position * 100) / 100 : null,
        }, { onConflict: 'date,source,term' });
        if (!brandError) brandedUpserted++;
      }
    }

    return NextResponse.json({
      synced: true,
      auth_method: authMethod,
      date_range: { start: startStr, end: endStr },
      total_rows: rows.length,
      kryo_search_rows_upserted: upserted,
      branded_rows_upserted: brandedUpserted,
    });
  } catch (err) {
    console.error('sync/gsc error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
