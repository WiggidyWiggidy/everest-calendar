import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { localDateHourToIso, META_ACCOUNT_TIMEZONE } from '@/lib/timezones';
import { META_ATTRIBUTION_WINDOW } from '@/lib/marketing-attribution';

type Action = { action_type: string; value: string };
type Insight = {
  ad_id: string;
  date_start: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  actions?: Action[];
  action_values?: Action[];
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
};

function authorized(request: NextRequest) {
  return request.headers.get('x-sync-secret') === process.env.MARKETING_SYNC_SECRET;
}

function action(actions: Action[] | undefined, names: string[]) {
  return Number(actions?.find(item => names.includes(item.action_type))?.value ?? 0);
}

async function graphJson(url: string, attempts = 3): Promise<{ data?: Insight[]; paging?: { next?: string } }> {
  let last = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return res.json();
      last = `${res.status}: ${(await res.text()).slice(0, 800)}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise(resolve => setTimeout(resolve, 350 * 2 ** (attempt - 1)));
  }
  throw new Error(`Meta hourly insights failed after ${attempts} attempts: ${last}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const account = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!account || !token) return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days ?? 8), 2), 14);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const fields = 'ad_id,date_start,impressions,reach,clicks,spend,actions,action_values';
    let next: string | undefined = `https://graph.facebook.com/v25.0/${account}/insights?` +
      `level=ad&fields=${encodeURIComponent(fields)}&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` +
      `&action_attribution_windows=${encodeURIComponent(JSON.stringify(META_ATTRIBUTION_WINDOW))}` +
      `&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${encodeURIComponent(token)}`;
    const rows: Insight[] = [];
    while (next) {
      const page = await graphJson(next);
      rows.push(...(page.data ?? []));
      next = page.paging?.next;
    }

    const records = rows.map(row => {
      const hour = row.hourly_stats_aggregated_by_advertiser_time_zone?.slice(0, 2) ?? '';
      const reportHour = localDateHourToIso(`${row.date_start.replace(/-/g, '')}${hour}`, META_ACCOUNT_TIMEZONE);
      if (!reportHour) return null;
      return {
        meta_ad_id: row.ad_id,
        report_hour: reportHour,
        account_timezone: META_ACCOUNT_TIMEZONE,
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        link_clicks: action(row.actions, ['link_click']),
        landing_page_views: action(row.actions, ['landing_page_view']),
        spend: Number(row.spend ?? 0),
        add_to_carts: action(row.actions, ['add_to_cart', 'omni_add_to_cart']),
        checkouts_started: action(row.actions, ['initiate_checkout', 'omni_initiated_checkout']),
        purchases: action(row.actions, ['purchase', 'omni_purchase']),
        revenue: action(row.action_values, ['purchase', 'omni_purchase']),
        raw_payload: row,
        synced_at: new Date().toISOString(),
      };
    }).filter(Boolean);

    const supabase = createServiceClient();
    let upserted = 0;
    for (let index = 0; index < records.length; index += 500) {
      const batch = records.slice(index, index + 500);
      const { error } = await supabase.from('meta_ad_metrics_hourly').upsert(batch, { onConflict: 'meta_ad_id,report_hour' });
      if (error) throw new Error(error.message);
      upserted += batch.length;
    }
    await supabase.from('meta_ad_metrics_hourly').delete().lt('report_hour', new Date(Date.now() - 15 * 86400000).toISOString());
    return NextResponse.json({ success: true, days, rows_returned: rows.length, rows_upserted: upserted, account_timezone: META_ACCOUNT_TIMEZONE });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
