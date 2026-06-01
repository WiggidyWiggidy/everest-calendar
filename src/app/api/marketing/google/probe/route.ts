import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

function authorized(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

async function json(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const token = await getGoogleAccessTokenFromRefreshToken();
    const headers = { Authorization: `Bearer ${token}` };
    const propertyId = process.env.GA_PROPERTY_ID;
    const siteUrl = process.env.GSC_SITE_URL;
    const ga4 = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'sessions' }], limit: 1 }),
    });
    const gsc = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers });
    return NextResponse.json({
      success: ga4.ok && gsc.ok,
      ga4: { status: ga4.status, body: await json(ga4) },
      gsc: { status: gsc.status, configured_site: siteUrl, body: await json(gsc) },
    }, { status: ga4.ok && gsc.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
