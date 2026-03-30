import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Sync ad-level performance metrics from Meta Insights API → ad_metrics_daily
// Called by: ad-performance-monitor scheduled task, or manually via GET
// Auth: MARKETING_SYNC_SECRET header OR user session

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  const supabase = createServiceClient();

  if (secret !== process.env.MARKETING_SYNC_SECRET) {
    // Fall back to session auth
    const { createClient } = await import('@/lib/supabase/server');
    const sessionSupabase = await createClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metaToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!metaToken || !adAccountId) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN and META_AD_ACCOUNT_ID required' }, { status: 400 });
  }

  // Get all creatives with a Meta ad ID (live or paused)
  const { data: creatives, error: creativesErr } = await supabase
    .from('ad_creatives')
    .select('id, meta_ad_id, headline, status')
    .in('status', ['live', 'paused'])
    .not('meta_ad_id', 'is', null);

  if (creativesErr) {
    return NextResponse.json({ error: creativesErr.message }, { status: 500 });
  }

  if (!creatives || creatives.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No live/paused ads with Meta IDs found' });
  }

  const metaAdIds = creatives.map(c => c.meta_ad_id).filter(Boolean);
  const idMap = new Map(creatives.map(c => [c.meta_ad_id, c.id]));

  // Pull last 7 days of insights for all ads in one batch request
  const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];

  const fields = [
    'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm',
    'actions', 'action_values', 'purchase_roas',
  ].join(',');

  const insightsUrl = new URL(`https://graph.facebook.com/v25.0/${adAccountId}/insights`);
  insightsUrl.searchParams.set('level', 'ad');
  insightsUrl.searchParams.set('fields', fields);
  insightsUrl.searchParams.set('time_increment', '1'); // daily
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
  insightsUrl.searchParams.set('filtering', JSON.stringify([{ field: 'ad.id', operator: 'IN', value: metaAdIds }]));
  insightsUrl.searchParams.set('limit', '200');
  insightsUrl.searchParams.set('access_token', metaToken);

  const insightsRes = await fetch(insightsUrl.toString());
  if (!insightsRes.ok) {
    const err = await insightsRes.text();
    return NextResponse.json({ error: 'Meta Insights API error', detail: err }, { status: 502 });
  }

  const insightsData = await insightsRes.json();
  const rows = (insightsData.data ?? []) as MetaInsightRow[];

  let synced = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const adCreativeId = idMap.get(row.ad_id);
    if (!adCreativeId) continue;

    // Extract purchases from actions array
    const actions = (row.actions ?? []) as { action_type: string; value: string }[];
    const actionValues = (row.action_values ?? []) as { action_type: string; value: string }[];
    const purchases = actions.find(a => a.action_type === 'purchase')?.value;
    const revenue = actionValues.find(a => a.action_type === 'purchase')?.value;
    const roasEntry = (row.purchase_roas ?? []) as { action_type: string; value: string }[];
    const roas = roasEntry.find(r => r.action_type === 'offsite_conversion.fb_pixel_purchase')?.value
      ?? roasEntry[0]?.value;

    const record = {
      ad_creative_id: adCreativeId,
      date: row.date_start,
      impressions: parseInt(row.impressions ?? '0', 10),
      clicks: parseInt(row.clicks ?? '0', 10),
      spend: parseFloat(row.spend ?? '0'),
      ctr: row.ctr ? parseFloat(row.ctr) / 100 : null, // Meta returns % as string like "1.23"
      cpc: row.cpc ? parseFloat(row.cpc) : null,
      cpm: row.cpm ? parseFloat(row.cpm) : null,
      purchases: purchases ? parseInt(purchases, 10) : 0,
      revenue: revenue ? parseFloat(revenue) : null,
      roas: roas ? parseFloat(roas) : null,
    };

    const { error: upsertErr } = await supabase
      .from('ad_metrics_daily')
      .upsert(record, { onConflict: 'ad_creative_id,date' });

    if (upsertErr) {
      errors.push(`${row.ad_id}/${row.date_start}: ${upsertErr.message}`);
    } else {
      synced++;
    }
  }

  return NextResponse.json({
    synced,
    ads_checked: creatives.length,
    rows_from_meta: rows.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// GET: Same as POST, allows manual trigger from browser
export async function GET(request: NextRequest) {
  return POST(request);
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
