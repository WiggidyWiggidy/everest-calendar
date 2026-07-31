#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const PROD = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
const MS_PER_HOUR = 60 * 60 * 1000;
const execFileAsync = promisify(execFile);

const THRESHOLDS = {
  ad_traffic_hours: 24,
  funnel_hours: 48,
  render_hours: 24,
};

function parseArgs(argv) {
  const args = { outDir: '', failOnBlockers: false, noNetwork: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--fail-on-blockers') args.failOnBlockers = true;
    else if (arg === '--no-network') args.noNetwork = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-source-health.mjs [--out DIR] [--fail-on-blockers] [--no-network]');
      process.exit(0);
    }
  }
  return args;
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim().replace(/^export\s+/, '');
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

async function loadEnv() {
  await loadEnvFile(path.join(os.homedir(), '.zshenv'));
  await loadEnvFile(path.join(repoRoot, '.env.local'));
}

async function fetchText(url, options = {}, timeoutMs = 15000, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 750 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function curlText(url, headers = {}, timeoutSeconds = 20) {
  const args = ['-sS', '--max-time', String(timeoutSeconds), '--retry', '3', '--retry-delay', '1', '--retry-all-errors'];
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
  args.push(url);
  const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 2 * 1024 * 1024 });
  return { ok: true, status: null, text: stdout };
}

async function curlPostJson(url, payload, headers = {}, timeoutSeconds = 30) {
  const args = ['-sS', '--max-time', String(timeoutSeconds), '--retry', '2', '--retry-delay', '1', '--retry-all-errors', '-X', 'POST', '-H', 'Content-Type: application/json'];
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
  args.push('-d', JSON.stringify(payload), url);
  const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 4 * 1024 * 1024 });
  return { ok: true, status: null, text: stdout };
}

function supabaseEnv() {
  const base = (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { base, key };
}

async function supabaseGet(table, params) {
  const { base, key } = supabaseEnv();
  if (!base || !key) throw new Error('Supabase URL/key missing');
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetchText(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } }, 20000, 3);
  } catch {
    res = await curlText(url.toString(), { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  return JSON.parse(res.text);
}

function isPipeboardUsageLimit(text = '') {
  return /usage limit exceeded|weekly limit|trial commands|upgrade to pro|settings\/billing/i.test(String(text));
}

function sanitizeError(value = '') {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/apikey:\s+[A-Za-z0-9._-]+/g, 'apikey: [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]')
    .slice(0, 1000);
}

async function latestCachedOkProbe(sourceId) {
  const root = path.join(repoRoot, 'artifacts/kryo-source-health');
  let dirs = [];
  try { dirs = await fs.readdir(root); } catch { return null; }
  for (const dir of dirs.sort().reverse()) {
    if (dir === 'latest') continue;
    try {
      const file = path.join(root, dir, 'source-health.json');
      const report = JSON.parse(await fs.readFile(file, 'utf8'));
      const sourceRow = (report.sources || []).find((s) => s.id === sourceId);
      const probe = sourceRow?.evidence?.probe;
      if (probe?.ok && !probe.quota_limited && !sourceRow.evidence?.quota_limited) {
        return {
          source_id: sourceId,
          generated_at: report.generated_at,
          status: sourceRow.status,
          blocker: sourceRow.blocker || null,
          body: probe.body || null,
          probe,
        };
      }
    } catch {}
  }
  return null;
}

async function latestCachedSourceValue(sourceId) {
  const root = path.join(repoRoot, 'artifacts/kryo-source-health');
  let dirs = [];
  try { dirs = await fs.readdir(root); } catch { return null; }
  for (const dir of dirs.sort().reverse()) {
    if (dir === 'latest') continue;
    try {
      const file = path.join(root, dir, 'source-health.json');
      const report = JSON.parse(await fs.readFile(file, 'utf8'));
      const sourceRow = (report.sources || []).find((s) => s.id === sourceId);
      if (sourceRow?.max_timestamp) return sourceRow.max_timestamp;
    } catch {}
  }
  return null;
}

async function maxColumn(table, column) {
  const rows = await supabaseGet(table, { select: column, order: `${column}.desc`, limit: '1' });
  return rows[0]?.[column] ?? null;
}

function ageHours(value) {
  if (!value) return null;
  const dt = new Date(value.includes('T') ? value : `${value}T23:59:59Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.round(((Date.now() - dt.getTime()) / MS_PER_HOUR) * 10) / 10;
}

function freshness(value, thresholdHours) {
  const age = ageHours(value);
  if (age === null) return { age_hours: null, fresh: false, state: 'missing' };
  return { age_hours: age, fresh: age <= thresholdHours, state: age <= thresholdHours ? 'fresh' : 'stale' };
}

function source(id, label, category, maxTimestamp, thresholdHours, status, blocker, usable, evidence = {}) {
  return {
    id,
    label,
    category,
    max_timestamp: maxTimestamp,
    freshness_threshold_hours: thresholdHours,
    ...freshness(maxTimestamp, thresholdHours),
    status,
    blocker,
    usable_for_recommendations: usable,
    evidence,
  };
}

async function metaDirectProbe() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return { ok: false, status: null, blocker: 'missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID' };
  const clean = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const url = new URL(`https://graph.facebook.com/v25.0/${clean}`);
  url.searchParams.set('fields', 'account_status,disable_reason,currency,timezone_name');
  url.searchParams.set('access_token', token);
  let res;
  try { res = await fetchText(url, {}, 15000, 2); }
  catch { res = await curlText(url.toString()); }
  if (!res.ok) {
    let blocker = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(res.text);
      blocker = j.error?.message || blocker;
    } catch {}
    return { ok: false, status: res.status, blocker, body: res.text.slice(0, 500) };
  }
  return { ok: true, status: res.status, body: res.text.slice(0, 500) };
}

async function pipeboardRpc(tool, argumentsPayload) {
  const token = process.env.PIPEBOARD_API_TOKEN;
  if (!token) return { ok: false, status: null, blocker: 'missing PIPEBOARD_API_TOKEN' };
  const payload = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: argumentsPayload } };
  let res;
  try {
    res = await fetchText('https://meta-ads.mcp.pipeboard.co/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(payload),
    }, 20000, 2);
  } catch {
    res = await curlPostJson('https://meta-ads.mcp.pipeboard.co/', payload, { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream' }, 30);
  }
  let parsed = null;
  try { parsed = JSON.parse(res.text); } catch {}
  const result = parsed?.result ?? {};
  const contentText = result.content?.[0]?.text ?? '';
  let blocker = null;
  if (!res.ok) blocker = `HTTP ${res.status}`;
  if (result.isError) blocker = result.structuredContent?.error || contentText || 'Pipeboard returned error';
  return { ok: res.ok && !blocker, status: res.status, blocker, body: contentText || blocker || 'Pipeboard Meta read succeeded' };
}

async function pipeboardMetaProbe() {
  const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1737922103322223';
  const account = await pipeboardRpc('get_account_info', { account_id: accountId });
  if (!account.ok) return account;
  const last7 = await pipeboardRpc('get_insights', { account_id: accountId, date_preset: 'last_7d', level: 'account', fields: ['spend', 'impressions', 'clicks'] });
  if (!last7.ok) return last7;
  let noRecentDelivery = false;
  try {
    const payload = JSON.parse(last7.body);
    noRecentDelivery = Array.isArray(payload.data) && payload.data.length === 0;
  } catch {}
  return { ok: true, status: last7.status, blocker: null, body: noRecentDelivery ? 'Pipeboard Meta connected; last_7d returned no delivery rows.' : 'Pipeboard Meta connected; last_7d returned delivery rows.', no_recent_delivery: noRecentDelivery, account_body: account.body.slice(0, 500) };
}


async function pipeboardGoogleAnalyticsProbe() {
  const token = process.env.PIPEBOARD_API_TOKEN;
  if (!token) return { ok: false, status: null, blocker: 'missing PIPEBOARD_API_TOKEN' };
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'run_google_analytics_report',
      arguments: {
        property_id: process.env.GA_PROPERTY_ID || '353715595',
        dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
        limit: 1,
        returnPropertyQuota: true,
      },
    },
  };
  let res;
  try {
    res = await fetchText('https://google-analytics.mcp.pipeboard.co/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(payload),
    }, 30000, 3);
  } catch {
    res = await curlPostJson('https://google-analytics.mcp.pipeboard.co/', payload, { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream' }, 45);
  }
  let parsed = null;
  try { parsed = JSON.parse(res.text); } catch {}
  const result = parsed?.result ?? {};
  const contentText = result.content?.[0]?.text ?? '';
  let blocker = null;
  if (!res.ok) blocker = `HTTP ${res.status}`;
  if (result.isError) blocker = result.structuredContent?.error || contentText || 'Pipeboard GA4 returned error';
  if (blocker) return { ok: false, status: res.status, blocker, body: contentText.slice(0, 500) };
  let rows = null;
  try { rows = JSON.parse(contentText).rows?.length ?? 0; } catch {}
  return { ok: true, status: res.status, blocker: null, body: `Pipeboard GA4 report succeeded; rows=${rows ?? 'n/a'}` };
}

async function shopifyThemeProbe() {
  if (!process.env.MARKETING_SYNC_SECRET) return { ok: false, status: null, blocker: 'missing MARKETING_SYNC_SECRET' };
  let res;
  try {
    res = await fetchText(`${PROD}/api/marketing/theme/info`, { headers: { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET } }, 20000, 3);
  } catch {
    res = await curlText(`${PROD}/api/marketing/theme/info`, { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET }, 25);
  }
  if (!res.ok) return { ok: false, status: res.status, blocker: `HTTP ${res.status}: ${res.text.slice(0, 200)}` };
  let detail = 'theme/info ok';
  try {
    const j = JSON.parse(res.text);
    detail = `live_theme=${j.live_theme?.id ?? 'n/a'} ${j.live_theme?.name ?? ''}`.trim();
  } catch {}
  return { ok: true, status: res.status, body: detail };
}

async function safeMax(table, column, sourceId) {
  try { return { value: await maxColumn(table, column) }; }
  catch (err) {
    const cached = sourceId ? await latestCachedSourceValue(sourceId) : null;
    return { value: cached, error: sanitizeError(err instanceof Error ? err.message : String(err)), used_cache: Boolean(cached) };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await loadEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-source-health/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const [metaMax, ga4Max, gscMax, marketingDailyMax, clarityMax, shopifyFunnelMax, attributionMax] = await Promise.all([
    safeMax('meta_ad_metrics_daily', 'date', 'pipeboard_meta'),
    safeMax('ga4_page_hourly', 'report_hour', 'ga4'),
    safeMax('gsc_query_page_daily', 'date', 'gsc'),
    safeMax('marketing_metrics_daily', 'date', 'marketing_metrics_daily'),
    safeMax('clarity_friction_elements', 'date', 'clarity'),
    safeMax('shopify_funnel_daily', 'date', 'shopify_funnel'),
    safeMax('attribution_touches', 'ts', 'attribution_touches'),
  ]);

  const rawProbes = args.noNetwork ? {} : {
    metaDirect: await metaDirectProbe().catch((err) => ({ ok: false, blocker: err.message })),
    pipeboardMeta: await pipeboardMetaProbe().catch((err) => ({ ok: false, blocker: err.message })),
    shopifyTheme: await shopifyThemeProbe().catch((err) => ({ ok: false, blocker: err.message })),
    googleAnalytics: await pipeboardGoogleAnalyticsProbe().catch((err) => ({ ok: false, blocker: err.message })),
  };
  const [cachedPipeboardMeta, cachedGa4] = await Promise.all([
    latestCachedOkProbe('pipeboard_meta'),
    latestCachedOkProbe('ga4'),
  ]);
  const probes = { ...rawProbes };
  if (!probes.pipeboardMeta?.ok && isPipeboardUsageLimit(`${probes.pipeboardMeta?.blocker || ''} ${probes.pipeboardMeta?.body || ''}`) && cachedPipeboardMeta) {
    probes.pipeboardMeta = { ...probes.pipeboardMeta, ok: true, quota_limited: true, cached_ok: cachedPipeboardMeta, no_recent_delivery: /no recent Meta delivery/i.test(cachedPipeboardMeta.blocker || cachedPipeboardMeta.body || '') };
  }
  if (!probes.googleAnalytics?.ok && isPipeboardUsageLimit(`${probes.googleAnalytics?.blocker || ''} ${probes.googleAnalytics?.body || ''}`) && cachedGa4) {
    probes.googleAnalytics = { ...probes.googleAnalytics, ok: true, quota_limited: true, cached_ok: cachedGa4 };
  }

  const sources = [];
  const metaFresh = freshness(metaMax.value, THRESHOLDS.ad_traffic_hours).fresh;
  const pipeboardConnected = Boolean(probes.pipeboardMeta?.ok);
  const pipeboardNoRecentDelivery = Boolean(probes.pipeboardMeta?.no_recent_delivery);
  const pipeboardStatus = pipeboardConnected ? (metaFresh ? 'ok' : 'stale') : 'blocked';
  const pipeboardBlocker = pipeboardConnected
    ? (metaFresh ? (probes.pipeboardMeta?.quota_limited ? `Pipeboard usage limit hit; last successful probe ${probes.pipeboardMeta.cached_ok?.generated_at}` : null) : pipeboardNoRecentDelivery ? `connected; no recent Meta delivery rows in last_7d${probes.pipeboardMeta?.quota_limited ? `; Pipeboard usage limit hit, using cached probe from ${probes.pipeboardMeta.cached_ok?.generated_at}` : ''}` : `connected; warehouse stale${probes.pipeboardMeta?.quota_limited ? `; Pipeboard usage limit hit, using cached probe from ${probes.pipeboardMeta.cached_ok?.generated_at}` : ''}`)
    : (probes.pipeboardMeta?.blocker || 'not checked');
  const pipeboardUsable = pipeboardConnected && metaFresh;
  const metaDirectStatus = probes.metaDirect?.ok ? (metaFresh ? 'ok' : 'stale') : (pipeboardConnected ? 'deprecated' : 'blocked');
  const metaDirectBlocker = probes.metaDirect?.ok ? (metaFresh ? null : 'warehouse stale') : (pipeboardConnected ? `direct Meta unavailable (${probes.metaDirect?.blocker || 'not checked'}); Pipeboard Meta is canonical` : (probes.metaDirect?.blocker || 'not checked'));
  sources.push(source('meta_direct', 'Meta direct token/app', 'ad_traffic', metaMax.value, THRESHOLDS.ad_traffic_hours, metaDirectStatus, metaDirectBlocker, probes.metaDirect?.ok && metaFresh, { max_query_error: metaMax.error, probe: probes.metaDirect || null, canonical: pipeboardConnected ? false : true }));
  sources.push(source('pipeboard_meta', 'Pipeboard Meta', 'ad_traffic', metaMax.value, THRESHOLDS.ad_traffic_hours, pipeboardStatus, pipeboardBlocker, pipeboardUsable, { max_query_error: metaMax.error, probe: probes.pipeboardMeta || null, canonical: true, quota_limited: Boolean(probes.pipeboardMeta?.quota_limited), cached_ok: probes.pipeboardMeta?.cached_ok || null }));
  const ga4PipeboardOk = Boolean(probes.googleAnalytics?.ok);
  const ga4PipeboardBlocker = probes.googleAnalytics?.blocker || 'Pipeboard GA4 unavailable';
  const ga4Status = ga4PipeboardOk ? (probes.googleAnalytics?.quota_limited ? 'quota_limited' : 'ok') : 'blocked';
  const ga4Usable = ga4PipeboardOk && !probes.googleAnalytics?.quota_limited;
  const ga4MaxTimestamp = ga4Usable ? new Date().toISOString() : ga4Max.value;
  const ga4Blocker = ga4Usable ? null : probes.googleAnalytics?.quota_limited ? `Pipeboard usage limit hit; last successful GA4 probe ${probes.googleAnalytics.cached_ok?.generated_at}; warehouse stale at ${ga4Max.value || 'n/a'}` : `${ga4PipeboardBlocker}; warehouse stale at ${ga4Max.value || 'n/a'}`;
  sources.push(source('ga4', 'GA4', 'funnel_conversion', ga4MaxTimestamp, THRESHOLDS.funnel_hours, ga4Status, ga4Blocker, ga4Usable, { max_query_error: ga4Max.error, warehouse_max: ga4Max.value, probe: probes.googleAnalytics || null, canonical_connector: 'pipeboard_google_analytics', fallback_connector: 'analytics-mcp-service-account', quota_limited: Boolean(probes.googleAnalytics?.quota_limited), cached_ok: probes.googleAnalytics?.cached_ok || null }));
  sources.push(source('gsc', 'Google Search Console', 'traffic_quality', gscMax.value, THRESHOLDS.funnel_hours, freshness(gscMax.value, THRESHOLDS.funnel_hours).fresh ? 'ok' : 'blocked', freshness(gscMax.value, THRESHOLDS.funnel_hours).fresh ? null : 'permission removed / stale warehouse; Tom must re-add Search Console access', freshness(gscMax.value, THRESHOLDS.funnel_hours).fresh, { max_query_error: gscMax.error }));
  sources.push(source('clarity', 'Microsoft Clarity', 'funnel_conversion', clarityMax.value, THRESHOLDS.funnel_hours, freshness(clarityMax.value, THRESHOLDS.funnel_hours).fresh ? 'ok' : 'stale', freshness(clarityMax.value, THRESHOLDS.funnel_hours).fresh ? null : 'clarity warehouse stale', freshness(clarityMax.value, THRESHOLDS.funnel_hours).fresh, { max_query_error: clarityMax.error }));
  sources.push(source('shopify_funnel', 'Shopify funnel', 'funnel_conversion', shopifyFunnelMax.value, THRESHOLDS.funnel_hours, freshness(shopifyFunnelMax.value, THRESHOLDS.funnel_hours).fresh ? 'ok' : 'stale', freshness(shopifyFunnelMax.value, THRESHOLDS.funnel_hours).fresh ? null : 'shopify_funnel_daily stale', freshness(shopifyFunnelMax.value, THRESHOLDS.funnel_hours).fresh, { max_query_error: shopifyFunnelMax.error }));
  sources.push(source('attribution_touches', 'Attribution touches', 'funnel_conversion', attributionMax.value, THRESHOLDS.funnel_hours, freshness(attributionMax.value, THRESHOLDS.funnel_hours).fresh ? 'ok' : 'stale', freshness(attributionMax.value, THRESHOLDS.funnel_hours).fresh ? null : 'first-party touch events stale', freshness(attributionMax.value, THRESHOLDS.funnel_hours).fresh, { max_query_error: attributionMax.error }));
  sources.push(source('shopify_admin_theme', 'Shopify Admin/theme API', 'website_ops', new Date().toISOString(), THRESHOLDS.render_hours, probes.shopifyTheme?.ok ? 'ok' : 'blocked', probes.shopifyTheme?.ok ? null : (probes.shopifyTheme?.blocker || 'not checked'), Boolean(probes.shopifyTheme?.ok), { probe: probes.shopifyTheme || null }));

  const metricPolicy = {
    paid_atc_purchase_verdicts: { canonical_source: 'meta_ad_metrics_daily', usable: sources.some((s) => ['meta_direct', 'pipeboard_meta'].includes(s.id) && s.usable_for_recommendations), rule: 'Use Meta pixel metrics only when Meta source has fresh delivery rows; connected/no-delivery may support a no-spend status, not CPA/ROAS verdicts.' },
    onsite_intent: { canonical_source: 'vw_kryo_intent_daily', usable: sources.find((s) => s.id === 'attribution_touches')?.usable_for_recommendations ?? false, rule: 'Pool 7-day session-weighted windows.' },
    whatsapp_interest: { canonical_source: "attribution_touches event_type='whatsapp_click'", usable: sources.find((s) => s.id === 'attribution_touches')?.usable_for_recommendations ?? false, rule: 'Clicks only; conversations/closes need Tom/manual source.' },
    shopify_orders_revenue: { canonical_source: 'shopify_funnel_daily', usable: sources.find((s) => s.id === 'shopify_funnel')?.usable_for_recommendations ?? false, rule: 'Use only when fresh.' },
    ga4_gsc: { canonical_source: 'Pipeboard Google Analytics for GA4; gsc_query_page_daily for GSC', usable: sources.find((s) => s.id === 'ga4')?.usable_for_recommendations && sources.find((s) => s.id === 'gsc')?.usable_for_recommendations, rule: 'GA4 can use Pipeboard Google Analytics when connected; GSC still needs Search Console access or a connector.' },
  };

  const blockers = sources.filter((s) => s.status === 'blocked');
  const stale = sources.filter((s) => s.status === 'stale');
  const report = {
    generated_at: new Date().toISOString(),
    status: blockers.length ? 'blocked' : stale.length ? 'stale_sources' : 'ok',
    thresholds: THRESHOLDS,
    sources,
    metric_policy: metricPolicy,
    mandatory_before_marketing_analysis: true,
    notes: [
      'Stale sources may be shown only under historical/cached sections.',
      'Do not use old first-party add_to_cart/order_placed rows as verdict metrics until revalidated.',
      'This command is read-only and does not trigger sync routes.',
    ],
  };

  const jsonPath = path.join(outDir, 'source-health.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.mkdir(path.join(repoRoot, 'artifacts/kryo-source-health/latest'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json'), JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# KRYO Source Health');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Status: ${report.status.toUpperCase()}`);
  lines.push('');
  lines.push('## Sources');
  for (const s of sources) lines.push(`- ${s.status.toUpperCase()} — ${s.label}: max=${s.max_timestamp ?? 'n/a'}, age=${s.age_hours ?? 'n/a'}h, usable=${s.usable_for_recommendations ? 'yes' : 'no'}${s.blocker ? `, blocker=${s.blocker}` : ''}`);
  lines.push('');
  lines.push('## Metric policy');
  for (const [k, v] of Object.entries(metricPolicy)) lines.push(`- ${k}: source=${v.canonical_source}; usable=${v.usable ? 'yes' : 'no'}; ${v.rule}`);
  lines.push('');
  lines.push(`Raw JSON: ${jsonPath}`);
  const mdPath = path.join(outDir, 'source-health.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.md'), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ status: report.status, blockers: blockers.length, stale: stale.length, report: mdPath, json: jsonPath }, null, 2));
  if (args.failOnBlockers && blockers.length) process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
