/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getGoogleAccessTokenFromRefreshToken } from '@/lib/google-oauth';

type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SyncOptions = {
  days: number;
  freshDays: number;
  includeHourly: boolean;
  searchType: string;
  writeFindings: boolean;
};

const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3/sites';
const DAILY_DIMENSIONS = ['date', 'query', 'page', 'country', 'device'];
const HOURLY_DIMENSIONS = ['hour', 'query', 'page', 'country', 'device'];
const ROW_LIMIT = 25000;
const BRAND_TERMS = ['kryo', 'isu-001', 'isu001', 'ice shower', 'portable ice bath', 'everest labs'];

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

function pacificDate(offsetDays = 0) {
  const base = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseOptions(raw: any): SyncOptions {
  return {
    days: Math.min(Math.max(Number(raw?.days ?? 14), 3), 486),
    freshDays: Math.min(Math.max(Number(raw?.freshDays ?? 2), 1), 7),
    includeHourly: raw?.includeHourly !== false,
    searchType: String(raw?.searchType ?? 'web'),
    writeFindings: raw?.writeFindings !== false,
  };
}

function normalisePage(page: string) {
  if (!page) return '';
  try {
    const url = new URL(page);
    const path = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    const country = url.searchParams.get('country');
    return country ? `${path}?country=${country}` : path;
  } catch {
    return page.split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '') || page;
  }
}

function productHandleFromPage(normalizedPage: string) {
  const match = normalizedPage.match(/\/products\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function classifyQuery(query: string, normalizedPage = '') {
  const q = query.toLowerCase();
  const p = normalizedPage.toLowerCase();
  if (/\bkryo\b|\bkryo2\b|kryo\s*2|kryo shower|kryotherapy/.test(q) || /\/products\/kryo/.test(p)) {
    return 'exact_kryo';
  }
  if (
    q.includes('ice shower') ||
    q.includes('cold shower') ||
    q.includes('cold plunge') ||
    q.includes('portable ice bath') ||
    q.includes('cryotherapy') ||
    q.includes('cryo') ||
    p.includes('/blogs/news/cold') ||
    p.includes('/blogs/news/ice')
  ) {
    return 'kryo_adjacent';
  }
  if (q.includes('everest labs') || (q.includes('everest') && (q.includes('ice') || q.includes('bath') || q.includes('shower')))) {
    return 'everest_brand';
  }
  if (q.includes('everlast') || q.includes('cryobuilt')) return 'typo_competitor';
  return 'irrelevant';
}

function dailyPayload(row: GscRow, dataState: string, firstIncompleteDate: string | null, searchType: string) {
  const [date = '', query = '', page = '', country = '', device = ''] = row.keys ?? [];
  const normalizedPage = normalisePage(page);
  const isFinal = dataState === 'final' || !firstIncompleteDate || date < firstIncompleteDate;
  return {
    date,
    query: query.toLowerCase(),
    page,
    normalized_page: normalizedPage,
    product_handle: productHandleFromPage(normalizedPage),
    country,
    device,
    search_type: searchType,
    data_state: dataState,
    is_final: isFinal,
    first_incomplete_date: firstIncompleteDate,
    query_group: classifyQuery(query, normalizedPage),
    clicks: Math.round(row.clicks ?? 0),
    impressions: Math.round(row.impressions ?? 0),
    ctr: row.ctr ?? 0,
    avg_position: row.position ?? null,
    fetched_at: new Date().toISOString(),
    raw_payload: row,
  };
}

function hourlyPayload(row: GscRow, firstIncompleteHour: string | null, searchType: string) {
  const [hour = '', query = '', page = '', country = '', device = ''] = row.keys ?? [];
  const normalizedPage = normalisePage(page);
  const isFinal = !firstIncompleteHour || hour < firstIncompleteHour;
  return {
    hour_start: hour,
    query: query.toLowerCase(),
    page,
    normalized_page: normalizedPage,
    product_handle: productHandleFromPage(normalizedPage),
    country,
    device,
    search_type: searchType,
    data_state: 'hourly_all',
    is_final: isFinal,
    first_incomplete_hour: firstIncompleteHour,
    query_group: classifyQuery(query, normalizedPage),
    clicks: Math.round(row.clicks ?? 0),
    impressions: Math.round(row.impressions ?? 0),
    ctr: row.ctr ?? 0,
    avg_position: row.position ?? null,
    fetched_at: new Date().toISOString(),
    raw_payload: row,
  };
}

async function queryGsc(accessToken: string, siteUrl: string, body: Record<string, any>) {
  const allRows: GscRow[] = [];
  let startRow = 0;
  let metadata: Record<string, any> = {};
  let responseAggregationType: string | undefined;

  while (true) {
    const res = await fetch(`${GSC_API_BASE}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, rowLimit: ROW_LIMIT, startRow }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`GSC API ${res.status}: ${JSON.stringify(json).slice(0, 1000)}`);
    const rows = json.rows ?? [];
    allRows.push(...rows);
    metadata = { ...metadata, ...(json.metadata ?? {}) };
    responseAggregationType = json.responseAggregationType ?? responseAggregationType;
    if (rows.length < ROW_LIMIT) break;
    startRow += ROW_LIMIT;
  }
  return { rows: allRows, metadata, responseAggregationType };
}

async function upsertChunked(supabase: any, table: string, rows: any[], onConflict: string) {
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) errors.push(`${table}: ${error.message}`);
    else upserted += chunk.length;
  }
  return { upserted, errors };
}

function aggregate(rows: any[], keyFn: (row: any) => string) {
  const out = new Map<string, any>();
  for (const row of rows) {
    const key = keyFn(row);
    const cur = out.get(key) ?? { key, clicks: 0, impressions: 0, positionWeighted: 0, positionWeight: 0, is_final: true };
    cur.clicks += row.clicks;
    cur.impressions += row.impressions;
    cur.is_final = cur.is_final && row.is_final;
    if (row.avg_position != null && row.impressions > 0) {
      cur.positionWeighted += Number(row.avg_position) * row.impressions;
      cur.positionWeight += row.impressions;
    }
    out.set(key, cur);
  }
  return Array.from(out.values()).map((row) => ({
    ...row,
    ctr: row.impressions ? row.clicks / row.impressions : 0,
    avg_position: row.positionWeight ? row.positionWeighted / row.positionWeight : null,
  })).sort((a, b) => (b.clicks - a.clicks) || (b.impressions - a.impressions));
}

async function replaceFinding(supabase: any, finding: any) {
  const { error } = await supabase
    .from('marketing_findings')
    .upsert(finding, { onConflict: 'category,finding_key' });
  return error?.message ?? null;
}

async function writeFastFindings(supabase: any, dailyRows: any[], hourlyRows: any[], syncMeta: any) {
  const related = dailyRows.filter((r) => r.query_group !== 'irrelevant');
  const latest48 = hourlyRows.length ? hourlyRows.filter((r) => r.query_group !== 'irrelevant') : related.slice(0, 250);
  const current7 = related.filter((r) => r.date >= pacificDate(-7));
  const prior7 = related.filter((r) => r.date < pacificDate(-7) && r.date >= pacificDate(-14));
  const exactCurrent = current7.filter((r) => r.query_group === 'exact_kryo');
  const exactPrior = prior7.filter((r) => r.query_group === 'exact_kryo');
  const sum = (rows: any[]) => rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });

  const findings = [
    {
      category: 'gsc_fast',
      finding_key: 'latest_48h_click_queries',
      finding_text: 'Fresh GSC 48h KRYO-related click queries cache.',
      evidence: { rows: aggregate(latest48.filter((r) => r.clicks > 0), (r) => `${r.query_group}|${r.query}`).slice(0, 25), source: 'gsc_query_page_hourly_or_daily' },
      refreshed_at: new Date().toISOString(),
      source_rows_n: latest48.length,
    },
    {
      category: 'gsc_fast',
      finding_key: 'zero_click_opportunities',
      finding_text: 'KRYO-adjacent searches with impressions and zero clicks.',
      evidence: { rows: aggregate(current7.filter((r) => r.query_group === 'kryo_adjacent' && r.clicks === 0), (r) => r.query).slice(0, 30) },
      refreshed_at: new Date().toISOString(),
      source_rows_n: current7.length,
    },
    {
      category: 'gsc_fast',
      finding_key: 'pages_receiving_kryo_impressions',
      finding_text: 'Pages receiving KRYO-related search impressions.',
      evidence: { rows: aggregate(current7, (r) => r.normalized_page).slice(0, 30) },
      refreshed_at: new Date().toISOString(),
      source_rows_n: current7.length,
    },
    {
      category: 'gsc_fast',
      finding_key: 'exact_kryo_growth_7d_vs_prior',
      finding_text: 'Exact KRYO demand current 7d vs previous 7d.',
      evidence: { current_7d: sum(exactCurrent), previous_7d: sum(exactPrior) },
      refreshed_at: new Date().toISOString(),
      source_rows_n: exactCurrent.length + exactPrior.length,
    },
    {
      category: 'gsc_fast',
      finding_key: 'country_device_demand',
      finding_text: 'KRYO-related demand by country and device.',
      evidence: { countries: aggregate(current7, (r) => r.country).slice(0, 20), devices: aggregate(current7, (r) => r.device).slice(0, 10) },
      refreshed_at: new Date().toISOString(),
      source_rows_n: current7.length,
    },
    {
      category: 'gsc_fast',
      finding_key: 'freshness_status',
      finding_text: 'Freshest GSC data and final/incomplete status.',
      evidence: syncMeta,
      refreshed_at: new Date().toISOString(),
      source_rows_n: dailyRows.length + hourlyRows.length,
    },
  ];

  const errors = [];
  for (const finding of findings) {
    const error = await replaceFinding(supabase, finding);
    if (error) errors.push(error);
  }
  return errors;
}

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString();
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const siteUrl = process.env.GSC_SITE_URL;
    if (!siteUrl || !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
      return NextResponse.json({
        error: 'GSC OAuth credentials not configured',
        missing: [!siteUrl && 'GSC_SITE_URL', !process.env.GOOGLE_OAUTH_REFRESH_TOKEN && 'GOOGLE_OAUTH_REFRESH_TOKEN'].filter(Boolean),
      }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const options = parseOptions(body);
    const accessToken = await getGoogleAccessTokenFromRefreshToken();
    const supabase = auth.userId ? await createClient() : createServiceClient();

    const finalStart = pacificDate(-options.days);
    const finalEnd = pacificDate(-3);
    const freshStart = pacificDate(-(options.freshDays - 1));
    const freshEnd = pacificDate(0);

    const finalDaily = finalStart <= finalEnd
      ? await queryGsc(accessToken, siteUrl, { startDate: finalStart, endDate: finalEnd, dimensions: DAILY_DIMENSIONS, type: options.searchType, dataState: 'final' })
      : { rows: [], metadata: {}, responseAggregationType: undefined };
    const freshDaily = await queryGsc(accessToken, siteUrl, { startDate: freshStart, endDate: freshEnd, dimensions: DAILY_DIMENSIONS, type: options.searchType, dataState: 'all' });

    let hourly: { rows: GscRow[]; metadata: Record<string, any>; responseAggregationType?: string } = { rows: [], metadata: {}, responseAggregationType: undefined };
    const hourlyErrors: string[] = [];
    if (options.includeHourly) {
      try {
        hourly = await queryGsc(accessToken, siteUrl, { startDate: freshStart, endDate: freshEnd, dimensions: HOURLY_DIMENSIONS, type: options.searchType, dataState: 'hourly_all' });
      } catch (err) {
        hourlyErrors.push((err as Error).message);
      }
    }

    const finalRows = finalDaily.rows.map((row) => dailyPayload(row, 'final', null, options.searchType));
    const freshRows = freshDaily.rows.map((row) => dailyPayload(row, 'all', freshDaily.metadata?.first_incomplete_date ?? null, options.searchType));
    const dailyRows = [...finalRows, ...freshRows].filter((row) => row.date);
    const hourlyRows = hourly.rows.map((row) => hourlyPayload(row, hourly.metadata?.first_incomplete_hour ?? null, options.searchType)).filter((row) => row.hour_start);

    const dailyWrite = await upsertChunked(supabase, 'gsc_query_page_daily', dailyRows, 'date,query,page,country,device,search_type,data_state');
    const hourlyWrite = hourlyRows.length
      ? await upsertChunked(supabase, 'gsc_query_page_hourly', hourlyRows, 'hour_start,query,page,country,device,search_type')
      : { upserted: 0, errors: [] as string[] };

    const compatibilityRows = aggregate(dailyRows.filter((row) => BRAND_TERMS.some((term) => row.query.includes(term))), (row) => `${row.date}|${row.query}`)
      .map((row) => {
        const [date, term] = row.key.split('|');
        return { date, source: 'google_search_console', term, impressions: Math.round(row.impressions), clicks: Math.round(row.clicks), avg_position: row.avg_position };
      });
    const brandWrite = compatibilityRows.length
      ? await upsertChunked(supabase, 'brand_tracking_daily', compatibilityRows, 'date,source,term')
      : { upserted: 0, errors: [] as string[] };

    const syncMeta = {
      site_url: siteUrl,
      requested: { final_start: finalStart, final_end: finalEnd, fresh_start: freshStart, fresh_end: freshEnd },
      newest_daily_date: dailyRows.map((r) => r.date).sort().at(-1) ?? null,
      newest_hour: hourlyRows.map((r) => r.hour_start).sort().at(-1) ?? null,
      first_incomplete_date: freshDaily.metadata?.first_incomplete_date ?? null,
      first_incomplete_hour: hourly.metadata?.first_incomplete_hour ?? null,
      daily_rows_fetched: dailyRows.length,
      hourly_rows_fetched: hourlyRows.length,
      daily_rows_upserted: dailyWrite.upserted,
      hourly_rows_upserted: hourlyWrite.upserted,
      data_source_note: 'GSC dataState=all/hourly_all can include incomplete recent data; rows after first_incomplete_* may change.',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };

    const findingErrors = options.writeFindings ? await writeFastFindings(supabase, dailyRows, hourlyRows, syncMeta) : [];
    const errors = [...dailyWrite.errors, ...hourlyWrite.errors, ...brandWrite.errors, ...hourlyErrors, ...findingErrors];

    const { error: syncRunError } = await supabase.from('gsc_sync_runs').insert({
      status: errors.length ? 'partial_success' : 'success',
      requested_start_date: finalStart,
      requested_end_date: freshEnd,
      newest_daily_date: syncMeta.newest_daily_date,
      newest_hour: syncMeta.newest_hour,
      first_incomplete_date: syncMeta.first_incomplete_date,
      first_incomplete_hour: syncMeta.first_incomplete_hour,
      daily_rows_fetched: dailyRows.length,
      hourly_rows_fetched: hourlyRows.length,
      daily_rows_upserted: dailyWrite.upserted,
      hourly_rows_upserted: hourlyWrite.upserted,
      errors,
      metadata: syncMeta,
      started_at: startedAt,
      finished_at: syncMeta.finished_at,
    });
    if (syncRunError) errors.push(`gsc_sync_runs: ${syncRunError.message}`);

    return NextResponse.json({ synced: true, ...syncMeta, brand_tracking_rows_upserted: brandWrite.upserted, errors });
  } catch (err) {
    console.error('sync/gsc error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
