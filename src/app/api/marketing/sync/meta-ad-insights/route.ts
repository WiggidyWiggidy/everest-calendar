import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

interface MetaInsightRow {
  ad_id: string;
  date_start: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  purchase_roas?: { action_type: string; value: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!metaToken || !adAccountId) {
      return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 400 });
    }

    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();

    // Accept days param for backfill (default 7, max 90)
    let days = 7;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.days) days = Math.min(Math.max(parseInt(body.days), 1), 90);
    } catch { /* use default */ }

    // Get all discovered ad IDs from meta_ads
    const { data: adRows, error: adErr } = await supabase
      .from('meta_ads')
      .select('meta_ad_id');

    if (adErr) {
      return NextResponse.json({ error: adErr.message }, { status: 500 });
    }

    if (!adRows || adRows.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No ads discovered yet. Run meta-campaigns sync first.' });
    }

    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const until = new Date().toISOString().split('T')[0];

    const fields = 'ad_id,impressions,clicks,spend,ctr,cpc,cpm,actions,action_values,purchase_roas';

    // Fetch insights at ad level for the entire account
    const allRows: MetaInsightRow[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/v25.0/${adAccountId}/insights?` +
      `level=ad&fields=${fields}&time_increment=1` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
      `&limit=500&access_token=${metaToken}`;

    while (nextUrl) {
      const pageRes = await fetch(nextUrl);
      if (!pageRes.ok) {
        const errText = await pageRes.text();
        return NextResponse.json({ error: 'Meta Insights API error', detail: errText }, { status: 502 });
      }
      const pageJson: { data?: MetaInsightRow[]; paging?: { next?: string } } = await pageRes.json();
      allRows.push(...(pageJson.data ?? []));
      nextUrl = pageJson.paging?.next ?? null;
    }

    // Filter to only ads we've discovered
    const knownAdIds = new Set(adRows.map(r => r.meta_ad_id));
    const relevantRows = allRows.filter(r => knownAdIds.has(r.ad_id));

    let synced = 0;
    const errors: string[] = [];

    for (const row of relevantRows) {
      const actions = row.actions ?? [];
      const actionValues = row.action_values ?? [];
      const purchases = actions.find(a => a.action_type === 'purchase')?.value;
      const revenue = actionValues.find(a => a.action_type === 'purchase')?.value;
      const roasEntry = (row.purchase_roas ?? []);
      const roas = roasEntry.find(r => r.action_type === 'offsite_conversion.fb_pixel_purchase')?.value
        ?? roasEntry[0]?.value;

      const spend = parseFloat(row.spend ?? '0');
      const purchaseCount = purchases ? parseInt(purchases, 10) : 0;

      const record = {
        meta_ad_id: row.ad_id,
        date: row.date_start,
        impressions: parseInt(row.impressions ?? '0', 10),
        clicks: parseInt(row.clicks ?? '0', 10),
        spend,
        ctr: row.ctr ? parseFloat(row.ctr) / 100 : null,
        cpc: row.cpc ? parseFloat(row.cpc) : null,
        cpm: row.cpm ? parseFloat(row.cpm) : null,
        purchases: purchaseCount,
        revenue: revenue ? parseFloat(revenue) : 0,
        roas: roas ? parseFloat(roas) : null,
        cost_per_purchase: purchaseCount > 0 ? spend / purchaseCount : null,
      };

      const { error: upsertErr } = await supabase
        .from('meta_ad_metrics_daily')
        .upsert(record, { onConflict: 'meta_ad_id,date' });

      if (upsertErr) {
        errors.push(`${row.ad_id}/${row.date_start}: ${upsertErr.message}`);
      } else {
        synced++;
      }
    }

    return NextResponse.json({
      synced,
      days,
      ads_known: adRows.length,
      rows_from_meta: allRows.length,
      rows_matched: relevantRows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('sync/meta-ad-insights error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
