import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

function authorized(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

async function readJson(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const accessToken = await getGoogleAccessTokenFromRefreshToken();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const accountRes = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', { headers: authHeader });
    const accountSummaries = await readJson(accountRes);

    const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: authHeader });
    const sites = await readJson(sitesRes);

    const propertyId = process.env.GA_PROPERTY_ID || null;
    let ga4Sample: unknown = null;
    if (propertyId) {
      const ga4Res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 25,
        }),
      });
      ga4Sample = await readJson(ga4Res);
    }

    const siteUrl = process.env.GSC_SITE_URL || null;
    let gscSample: unknown = null;
    if (siteUrl) {
      const end = new Date();
      end.setUTCDate(end.getUTCDate() - 3);
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - 10);
      const gscRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          dimensions: ['query', 'page', 'date'],
          rowLimit: 25,
        }),
      });
      gscSample = await readJson(gscRes);
    }

    return NextResponse.json({
      success: true,
      ga4: {
        selected_property_id: propertyId,
        account_summaries_status: accountRes.status,
        account_summaries: accountSummaries,
        sample: ga4Sample,
      },
      gsc: {
        selected_site_url: siteUrl,
        sites_status: sitesRes.status,
        sites,
        sample: gscSample,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
