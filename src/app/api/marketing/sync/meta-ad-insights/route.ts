import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { META_ATTRIBUTION_WINDOW } from '@/lib/marketing-attribution';

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

interface MetaAction {
  action_type: string;
  value?: string;
  [key: string]: string | undefined;
}

interface MetaInsightRow {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  date_start?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaAction[];
}

interface InsightsPayload {
  data?: MetaInsightRow[];
  paging?: {
    next?: string;
    cursors?: { after?: string };
  };
  error?: unknown;
}

function normalizeAdAccountId(raw: string | undefined) {
  if (!raw) return null;
  return raw.startsWith('act_') ? raw : `act_${raw}`;
}

function parseMcpToolPayload(payload: unknown): InsightsPayload {
  if (!payload || typeof payload !== 'object') throw new Error('Empty Pipeboard response');
  const root = payload as Record<string, unknown>;
  if (root.error) throw new Error(`Pipeboard MCP error: ${JSON.stringify(root.error)}`);

  const result = root.result as Record<string, unknown> | undefined;
  if (!result) throw new Error('Pipeboard MCP response missing result');

  const structured = result.structuredContent;
  if (structured && typeof structured === 'object') return structured as InsightsPayload;

  const content = result.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const text = (item as Record<string, unknown>).text;
      if (typeof text !== 'string') continue;
      try {
        return JSON.parse(text) as InsightsPayload;
      } catch {
        // Continue looking for a JSON text block.
      }
    }
  }

  throw new Error('Pipeboard MCP response did not contain JSON insight data');
}

async function fetchPipeboardInsights(
  token: string,
  accountId: string,
  date: string,
): Promise<MetaInsightRow[]> {
  const rows: MetaInsightRow[] = [];
  let after = '';

  for (let page = 0; page < 20; page++) {
    const response = await fetch('https://meta-ads.mcp.pipeboard.co/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `meta-insights-${date}-${page}`,
        method: 'tools/call',
        params: {
          name: 'get_insights',
          arguments: {
            account_id: accountId,
            time_range: { since: date, until: date },
            level: 'ad',
            limit: 500,
            after,
            compact: true,
            action_attribution_windows: META_ATTRIBUTION_WINDOW,
          },
        },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Pipeboard HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }

    const json = await response.json();
    const toolData = parseMcpToolPayload(json);
    if (toolData.error) throw new Error(`Pipeboard insights error: ${JSON.stringify(toolData.error)}`);
    rows.push(...(toolData.data ?? []));

    const nextAfter = toolData.paging?.cursors?.after;
    if (!nextAfter || nextAfter === after || !(toolData.paging?.next)) break;
    after = nextAfter;
  }

  return rows;
}

async function fetchGraphInsights(
  token: string,
  accountId: string,
  since: string,
  until: string,
): Promise<MetaInsightRow[]> {
  const fields = 'account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions,action_values,purchase_roas';
  const rows: MetaInsightRow[] = [];
  let nextUrl: string | null = `https://graph.facebook.com/v25.0/${accountId}/insights?` +
    `level=ad&fields=${fields}&time_increment=1` +
    `&action_attribution_windows=${encodeURIComponent(JSON.stringify(META_ATTRIBUTION_WINDOW))}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&limit=500&access_token=${token}`;

  while (nextUrl) {
    const pageRes = await fetch(nextUrl, { cache: 'no-store' });
    if (!pageRes.ok) {
      const detail = await pageRes.text();
      throw new Error(`Meta Insights API ${pageRes.status}: ${detail}`);
    }
    const pageJson: InsightsPayload = await pageRes.json();
    rows.push(...(pageJson.data ?? []));
    nextUrl = pageJson.paging?.next ?? null;
  }

  return rows;
}

function numberValue(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionValue(actions: MetaAction[], names: string[]) {
  const entry = actions.find(a => names.includes(a.action_type));
  return numberValue(entry?.value);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pipeboardToken = process.env.PIPEBOARD_API_TOKEN;
    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = normalizeAdAccountId(process.env.META_AD_ACCOUNT_ID);
    if (!adAccountId || (!pipeboardToken && !metaToken)) {
      return NextResponse.json({
        error: 'Meta credentials not configured',
        missing: [
          !adAccountId && 'META_AD_ACCOUNT_ID',
          !pipeboardToken && !metaToken && 'PIPEBOARD_API_TOKEN or META_ACCESS_TOKEN',
        ].filter(Boolean),
      }, { status: 400 });
    }

    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();

    let days = 7;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.days) days = Math.min(Math.max(parseInt(body.days, 10), 1), 90);
    } catch { /* default */ }

    const untilDate = new Date();
    const sinceDate = new Date(Date.now() - (days - 1) * 86400000);
    const iso = (d: Date) => d.toISOString().split('T')[0];
    const source = pipeboardToken ? 'pipeboard' : 'meta_graph';

    const allRows: MetaInsightRow[] = [];
    if (pipeboardToken) {
      for (let d = new Date(sinceDate); d <= untilDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const date = iso(d);
        allRows.push(...await fetchPipeboardInsights(pipeboardToken, adAccountId, date));
      }
    } else if (metaToken) {
      allRows.push(...await fetchGraphInsights(metaToken, adAccountId, iso(sinceDate), iso(untilDate)));
    }

    let synced = 0;
    const errors: string[] = [];
    const accountByDate = new Map<string, {
      spend: number;
      impressions: number;
      clicks: number;
      purchases: number;
      revenue: number;
    }>();

    for (const row of allRows) {
      if (!row.ad_id) continue;
      const date = row.date_start || iso(untilDate);
      const actions = row.actions ?? [];
      const actionValues = row.action_values ?? [];
      const purchases = actionValue(actions, ['purchase']);
      const revenue = actionValue(actionValues, ['purchase']);
      const spend = numberValue(row.spend);
      const impressions = Math.trunc(numberValue(row.impressions));
      const clicks = Math.trunc(numberValue(row.clicks));
      const outboundClicks = Math.trunc(actionValue(actions, ['link_click']));
      const landingPageViews = Math.trunc(actionValue(actions, ['landing_page_view']));
      const addToCarts = Math.trunc(actionValue(actions, ['add_to_cart', 'omni_add_to_cart']));
      const initiateCheckouts = Math.trunc(actionValue(actions, ['initiate_checkout', 'omni_initiated_checkout']));
      const roasFromMeta = row.purchase_roas?.find(r => r.action_type === 'offsite_conversion.fb_pixel_purchase')?.value
        ?? row.purchase_roas?.[0]?.value;
      const roas = roasFromMeta ? numberValue(roasFromMeta) : (spend > 0 ? revenue / spend : 0);

      const record = {
        meta_ad_id: row.ad_id,
        date,
        impressions,
        clicks,
        spend,
        ctr: row.ctr ? numberValue(row.ctr) : null,
        cpc: row.cpc ? numberValue(row.cpc) : null,
        cpm: row.cpm ? numberValue(row.cpm) : null,
        purchases: Math.trunc(purchases),
        revenue,
        roas,
        cost_per_purchase: purchases > 0 ? spend / purchases : null,
        outbound_clicks: outboundClicks,
        cost_per_outbound_click: outboundClicks > 0 ? spend / outboundClicks : null,
        landing_page_views: landingPageViews,
        cost_per_lpv: landingPageViews > 0 ? spend / landingPageViews : null,
        add_to_carts: addToCarts,
        cost_per_atc: addToCarts > 0 ? spend / addToCarts : null,
        initiate_checkouts: initiateCheckouts,
        cost_per_ic: initiateCheckouts > 0 ? spend / initiateCheckouts : null,
        reach: Math.trunc(numberValue(row.reach)),
        frequency: row.frequency ? numberValue(row.frequency) : null,
        adset_id: row.adset_id ?? null,
        campaign_id: row.campaign_id ?? null,
        ad_name: row.ad_name ?? null,
        adset_name: row.adset_name ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('meta_ad_metrics_daily')
        .upsert(record, { onConflict: 'meta_ad_id,date' });

      if (upsertErr) {
        errors.push(`${row.ad_id}/${date}: ${upsertErr.message}`);
      } else {
        synced++;
        const account = accountByDate.get(date) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
        account.spend += spend;
        account.impressions += impressions;
        account.clicks += clicks;
        account.purchases += purchases;
        account.revenue += revenue;
        accountByDate.set(date, account);
      }
    }

    for (const [date, account] of accountByDate) {
      const { error: summaryErr } = await supabase
        .from('marketing_metrics_daily')
        .upsert({
          user_id: auth.userId || '174f2dff-7a96-464c-a919-b473c328d531',
          date,
          meta_spend: account.spend,
          meta_impressions: account.impressions,
          meta_clicks: account.clicks,
          meta_purchases: Math.trunc(account.purchases),
          meta_roas: account.spend > 0 ? account.revenue / account.spend : 0,
          meta_cost_per_purchase: account.purchases > 0 ? account.spend / account.purchases : null,
          data_source: source,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date' });
      if (summaryErr) errors.push(`summary/${date}: ${summaryErr.message}`);
    }

    return NextResponse.json({
      synced,
      days,
      source,
      account_id: adAccountId,
      rows_from_source: allRows.length,
      dates_written: accountByDate.size,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('sync/meta-ad-insights error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
