// /api/marketing/sync/meta-breakdowns
// Pulls Meta Insights with breakdown dimensions (age, gender, region, placement)
// per ad for the last 7 days, writes to meta_ad_breakdowns_daily.
//
// Why: covers Tom's "demographic data" + "DCO/copy" tracking requirement.
// Aggregate-only meta-ad-insights doesn't surface which segments are winning.
//
// Auth: MARKETING_SYNC_SECRET header (matches the rest of the sync routes).
// Cadence: chained after /sync/meta-ads in /api/cron/process-directives.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

interface MetaInsightRow {
  ad_id: string;
  date_start: string;
  date_stop: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  // Breakdown dimension values (only one populated per row)
  age?: string;
  gender?: string;
  region?: string;
  country?: string;
  publisher_platform?: string;
  platform_position?: string;
}

const BREAKDOWN_GROUPS: { key: string; params: string[] }[] = [
  { key: 'age_gender', params: ['age', 'gender'] },
  { key: 'region', params: ['region'] },
  { key: 'placement', params: ['publisher_platform', 'platform_position'] },
];

function purchasesFrom(row: MetaInsightRow): { count: number; value: number } {
  const actions = row.actions ?? [];
  const values = row.action_values ?? [];
  const purchaseAction = actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  const purchaseValue = values.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  return {
    count: purchaseAction ? Number(purchaseAction.value) : 0,
    value: purchaseValue ? Number(purchaseValue.value) : 0,
  };
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metaToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!metaToken || !adAccountId) {
    return NextResponse.json(
      {
        error: 'meta credentials not configured',
        missing: [!metaToken && 'META_ACCESS_TOKEN', !adAccountId && 'META_AD_ACCOUNT_ID'].filter(Boolean),
      },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Only sync ads with a meta_ad_id (already pushed to Meta)
  const { data: creatives, error: creativesErr } = await supabase
    .from('ad_creatives')
    .select('id, meta_ad_id, status')
    .in('status', ['live', 'paused', 'live_paused'])
    .not('meta_ad_id', 'is', null);

  if (creativesErr) return NextResponse.json({ error: creativesErr.message }, { status: 500 });
  if (!creatives || creatives.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No live/paused ads with Meta IDs to break down' });
  }

  const idMap = new Map(creatives.map(c => [c.meta_ad_id, c.id]));
  const metaAdIds = creatives.map(c => c.meta_ad_id).filter(Boolean);

  const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const until = new Date().toISOString().split('T')[0];

  const baseFields = [
    'ad_id', 'date_start', 'date_stop',
    'impressions', 'clicks', 'spend',
    'ctr', 'cpc', 'cpm',
    'actions', 'action_values',
  ].join(',');

  let totalRowsWritten = 0;
  const errors: { breakdown: string; error: string }[] = [];
  const groupCounts: Record<string, number> = {};

  for (const group of BREAKDOWN_GROUPS) {
    const url = new URL(`https://graph.facebook.com/v25.0/${adAccountId}/insights`);
    url.searchParams.set('level', 'ad');
    url.searchParams.set('fields', baseFields);
    url.searchParams.set('breakdowns', group.params.join(','));
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('time_range', JSON.stringify({ since, until }));
    url.searchParams.set('filtering', JSON.stringify([{ field: 'ad.id', operator: 'IN', value: metaAdIds }]));
    url.searchParams.set('limit', '500');
    url.searchParams.set('access_token', metaToken);

    let res: Response;
    try {
      res = await fetch(url.toString(), { signal: AbortSignal.timeout(45000) });
    } catch (e) {
      errors.push({ breakdown: group.key, error: `fetch failed: ${(e as Error).message}` });
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      errors.push({ breakdown: group.key, error: `HTTP ${res.status}: ${detail.slice(0, 300)}` });
      continue;
    }

    const data = await res.json();
    const rows = (data.data ?? []) as MetaInsightRow[];

    const inserts = rows.map(r => {
      const adCreativeId = idMap.get(r.ad_id);
      if (!adCreativeId) return null;
      const purchases = purchasesFrom(r);

      // Build the breakdown_value composite from whichever fields the row carries
      const breakdownValue: Record<string, string | undefined> = {};
      for (const p of group.params) {
        const v = (r as Record<string, unknown>)[p];
        if (typeof v === 'string') breakdownValue[p] = v;
      }

      return {
        date: r.date_start,
        ad_creative_id: adCreativeId,
        meta_ad_id: r.ad_id,
        breakdown_type: group.key,
        breakdown_value: breakdownValue,
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        spend: Number(r.spend || 0),
        ctr: r.ctr ? Number(r.ctr) : null,
        cpc: r.cpc ? Number(r.cpc) : null,
        cpm: r.cpm ? Number(r.cpm) : null,
        purchases: purchases.count,
        revenue: purchases.value,
        roas: Number(r.spend || 0) > 0 ? purchases.value / Number(r.spend) : null,
      };
    }).filter(Boolean);

    if (inserts.length === 0) {
      groupCounts[group.key] = 0;
      continue;
    }

    const { error: upErr } = await supabase
      .from('meta_ad_breakdowns_daily')
      .upsert(inserts as Record<string, unknown>[], {
        onConflict: 'date,ad_creative_id,breakdown_type,breakdown_value',
        ignoreDuplicates: false,
      });

    if (upErr) {
      errors.push({ breakdown: group.key, error: `upsert failed: ${upErr.message}` });
    } else {
      totalRowsWritten += inserts.length;
      groupCounts[group.key] = inserts.length;
    }
  }

  return NextResponse.json({
    synced: totalRowsWritten,
    breakdowns_pulled: BREAKDOWN_GROUPS.map(g => g.key),
    rows_per_breakdown: groupCounts,
    creatives_in_scope: creatives.length,
    date_range: { since, until },
    errors,
  });
}
