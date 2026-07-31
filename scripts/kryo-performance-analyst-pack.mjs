#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);
const DAY_MS = 86400000;

function parseArgs(argv) {
  const args = { windowDays: 45, startDate: '', endDate: '', outDir: '', refreshHealth: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--window-days') args.windowDays = Math.min(Math.max(Number(argv[++i] || 45), 7), 180);
    else if (arg === '--start-date') args.startDate = argv[++i] || '';
    else if (arg === '--end-date') args.endDate = argv[++i] || '';
    else if (arg === '--out') args.outDir = argv[++i] || '';
    else if (arg === '--refresh-health') args.refreshHealth = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-performance-analyst-pack.mjs [--window-days 45] [--start-date YYYY-MM-DD --end-date YYYY-MM-DD] [--refresh-health] [--out DIR]');
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

function supabaseEnv() {
  return {
    base: (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function sanitizeError(value = '') {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/apikey:\s*[A-Za-z0-9._-]+/g, 'apikey: [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]')
    .slice(0, 1200);
}

async function curlJson(url, headers = {}, timeoutSeconds = 30) {
  const args = ['-sS', '--max-time', String(timeoutSeconds), '--retry', '3', '--retry-delay', '1', '--retry-all-errors'];
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
  args.push(url);
  const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(stdout || 'null');
}

async function runNodeScript(script, extraArgs = []) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [script, ...extraArgs], { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: sanitizeError(err.stderr || err.message) };
  }
}

function restUrl(table, params) {
  const { base } = supabaseEnv();
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [k, v] of params) url.searchParams.append(k, v);
  return url.toString();
}

async function sbAll(table, params, { pageSize = 1000, maxPages = 100 } = {}) {
  const { base, key } = supabaseEnv();
  if (!base || !key) throw new Error('Supabase URL/key missing');
  const url = restUrl(table, params);
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const chunk = await curlJson(url, {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Range: `${start}-${end}`,
    });
    if (!Array.isArray(chunk)) return chunk;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function sbMaybe(table, params, options) {
  try {
    return { ok: true, rows: await sbAll(table, params, options), error: null };
  } catch (err) {
    return { ok: false, rows: [], error: sanitizeError(err instanceof Error ? err.message : String(err)) };
  }
}

function dateDaysAgoFrom(baseDate, days) {
  const d = new Date(baseDate.getTime() - (days - 1) * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function resolveWindow(args) {
  if (args.startDate && args.endDate) return { startDate: args.startDate, endDate: args.endDate, days: Math.round((Date.parse(args.endDate) - Date.parse(args.startDate)) / DAY_MS) + 1 };
  const end = new Date(Date.now() - DAY_MS);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = dateDaysAgoFrom(end, args.windowDays);
  return { startDate, endDate, days: args.windowDays };
}

function n(value) { return Number(value || 0); }
function pct(num, den, digits = 1) { return den ? Number(((num / den) * 100).toFixed(digits)) : null; }
function money(value) { return Number(n(value).toFixed(2)); }
function safeRate(num, den) { return den ? num / den : null; }
function uniq(values) { return new Set(values.filter(Boolean)); }
function maxBy(rows, keyFn) {
  let best = null;
  for (const row of rows) if (!best || keyFn(row) > keyFn(best)) best = row;
  return best;
}
function sourceById(sourceHealth, id) { return (sourceHealth?.sources || []).find((source) => source.id === id) || null; }
function metricPolicy(sourceHealth, key) { return sourceHealth?.metric_policy?.[key] || { usable: false }; }

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

function aggregateMeta(rows) {
  const byAd = new Map();
  const byDay = new Map();
  const totals = { rows: rows.length, spend: 0, impressions: 0, clicks: 0, outbound_clicks: 0, landing_page_views: 0, add_to_carts: 0, initiate_checkouts: 0, purchases: 0, revenue: 0 };
  for (const row of rows) {
    const values = {
      spend: n(row.spend), impressions: n(row.impressions), clicks: n(row.clicks), outbound_clicks: n(row.outbound_clicks),
      landing_page_views: n(row.landing_page_views), add_to_carts: n(row.add_to_carts), initiate_checkouts: n(row.initiate_checkouts), purchases: n(row.purchases), revenue: n(row.revenue),
    };
    for (const key of Object.keys(values)) totals[key] += values[key];
    const adKey = row.meta_ad_id || row.ad_name || 'unknown_ad';
    if (!byAd.has(adKey)) byAd.set(adKey, { meta_ad_id: row.meta_ad_id || null, ad_name: row.ad_name || 'unknown', spend: 0, impressions: 0, clicks: 0, landing_page_views: 0, add_to_carts: 0, initiate_checkouts: 0, purchases: 0, revenue: 0, dates: [] });
    const ad = byAd.get(adKey);
    for (const key of ['spend', 'impressions', 'clicks', 'landing_page_views', 'add_to_carts', 'initiate_checkouts', 'purchases', 'revenue']) ad[key] += values[key];
    ad.dates.push(row.date);
    if (!byDay.has(row.date)) byDay.set(row.date, { date: row.date, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
    const day = byDay.get(row.date);
    for (const key of ['spend', 'impressions', 'clicks', 'purchases', 'revenue']) day[key] += values[key];
  }
  const decoratePaid = (row) => ({
    ...row,
    spend: money(row.spend),
    revenue: money(row.revenue),
    ctr_pct: pct(row.clicks, row.impressions, 2),
    cpc: row.clicks ? money(row.spend / row.clicks) : null,
    cost_per_lpv: row.landing_page_views ? money(row.spend / row.landing_page_views) : null,
    cost_per_atc: row.add_to_carts ? money(row.spend / row.add_to_carts) : null,
    cost_per_purchase: row.purchases ? money(row.spend / row.purchases) : null,
    roas: row.spend ? Number((row.revenue / row.spend).toFixed(2)) : null,
    lpv_to_atc_rate_pct: pct(row.add_to_carts, row.landing_page_views),
    atc_to_purchase_rate_pct: pct(row.purchases, row.add_to_carts),
  });
  return {
    totals: decoratePaid(totals),
    max_date: rows.length ? rows.map((r) => r.date).sort().at(-1) : null,
    min_date: rows.length ? rows.map((r) => r.date).sort()[0] : null,
    by_ad: Array.from(byAd.values()).map(decoratePaid).sort((a, b) => b.spend - a.spend).slice(0, 12),
    daily: Array.from(byDay.values()).map(decoratePaid).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function aggregateTouch(rows) {
  const external = rows.filter((r) => !r.is_internal);
  const kryoSessionIds = uniq(external.filter((r) => String(r.page_path || '').toLowerCase().includes('kryo')).map((r) => r.session_id || r.anonymous_id));
  const kryo = external.filter((r) => kryoSessionIds.has(r.session_id || r.anonymous_id));
  const sessions = uniq(kryo.map((r) => r.session_id || r.anonymous_id));
  const eventCounts = {};
  const eventSessions = {};
  const byChannel = {};
  const byDevice = {};
  const byCountry = {};
  const byPage = {};
  const byDay = {};
  for (const row of kryo) {
    const sid = row.session_id || row.anonymous_id;
    const event = row.event_type || 'unknown';
    eventCounts[event] = (eventCounts[event] || 0) + 1;
    if (!eventSessions[event]) eventSessions[event] = new Set();
    if (sid) eventSessions[event].add(sid);
    const channel = row.channel || row.utm_source || 'unknown';
    byChannel[channel] = (byChannel[channel] || 0) + 1;
    const device = row.device_type || 'unknown';
    byDevice[device] = (byDevice[device] || 0) + 1;
    const country = row.ip_country || 'unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
    const page = String(row.page_path || 'unknown').split('?')[0];
    byPage[page] = (byPage[page] || 0) + 1;
    const day = String(row.ts || '').slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, sessions: new Set(), events: 0, cart_views: new Set(), checkout_clicks: new Set(), whatsapp_clicks: new Set(), chat_clicks: new Set() };
    byDay[day].events += 1;
    if (sid) byDay[day].sessions.add(sid);
    if (event === 'cart_view') byDay[day].cart_views.add(sid);
    if (event === 'cart_checkout_click') byDay[day].checkout_clicks.add(sid);
    if (event === 'whatsapp_click') byDay[day].whatsapp_clicks.add(sid);
    if (event === 'chatway_click' || event === 'shopify_inbox_click') byDay[day].chat_clicks.add(sid);
  }
  const sessionCount = (...events) => uniq(kryo.filter((r) => events.includes(r.event_type)).map((r) => r.session_id || r.anonymous_id)).size;
  const asSorted = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  const sessionEvents = Object.fromEntries(Object.entries(eventSessions).map(([key, set]) => [key, set.size]));
  const cartViews = sessionCount('cart_view');
  const checkoutClicks = sessionCount('cart_checkout_click');
  const whatsappClicks = sessionCount('whatsapp_click');
  const chatClicks = sessionCount('chatway_click') + sessionCount('shopify_inbox_click');
  const addToCarts = sessionCount('add_to_cart', 'product_added_to_cart');
  return {
    rows: rows.length,
    external_rows: external.length,
    kryo_rows: kryo.length,
    kryo_sessions: sessions.size,
    event_counts: eventCounts,
    event_sessions: sessionEvents,
    session_funnel: {
      product_view: sessionCount('product_view'),
      hero_cta_click: sessionCount('hero_cta_click'),
      add_to_cart: addToCarts,
      cart_view: cartViews,
      cart_checkout_click: checkoutClicks,
      cart_exit_without_checkout: sessionCount('cart_exit_without_checkout'),
      whatsapp_click: whatsappClicks,
      chat_click: chatClicks,
      cart_to_checkout_click_rate_pct: pct(checkoutClicks, cartViews),
      whatsapp_or_chat_rate_pct: pct(whatsappClicks + chatClicks, sessions.size),
    },
    top_channels: asSorted(byChannel).slice(0, 10),
    top_devices: asSorted(byDevice).slice(0, 10),
    top_countries: asSorted(byCountry).slice(0, 10),
    top_pages: asSorted(byPage).slice(0, 12),
    daily: Object.values(byDay).map((day) => ({
      date: day.date,
      sessions: day.sessions.size,
      events: day.events,
      cart_view_sessions: day.cart_views.size,
      checkout_click_sessions: day.checkout_clicks.size,
      whatsapp_click_sessions: day.whatsapp_clicks.size,
      chat_click_sessions: day.chat_clicks.size,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function aggregateShopify(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.checkouts_started += n(row.checkouts_started);
    acc.checkouts_completed += n(row.checkouts_completed);
    acc.checkouts_abandoned += n(row.checkouts_abandoned);
    acc.abandoned_value += n(row.abandoned_value);
    return acc;
  }, { checkouts_started: 0, checkouts_completed: 0, checkouts_abandoned: 0, abandoned_value: 0 });
  return {
    rows: rows.length,
    max_date: rows.map((r) => r.date).sort().at(-1) || null,
    min_date: rows.map((r) => r.date).sort()[0] || null,
    totals: { ...totals, abandoned_value: money(totals.abandoned_value), checkout_completion_rate_pct: pct(totals.checkouts_completed, totals.checkouts_started), abandonment_rate_pct: pct(totals.checkouts_abandoned, totals.checkouts_started) },
    daily: rows.map((r) => ({ date: r.date, checkouts_started: n(r.checkouts_started), checkouts_completed: n(r.checkouts_completed), checkouts_abandoned: n(r.checkouts_abandoned), abandoned_value: money(r.abandoned_value) })),
  };
}

function aggregateClarity(rows) {
  const totals = rows.reduce((acc, row) => {
    const sessions = n(row.total_sessions);
    acc.sessions += sessions;
    acc.dead_clicks += n(row.dead_click_count);
    acc.rage_clicks += n(row.rage_click_count);
    acc.quick_backs += n(row.quick_back_count);
    acc.script_errors += n(row.script_error_count);
    if (row.avg_scroll_depth_pct != null && sessions > 0) { acc.scroll_weighted += n(row.avg_scroll_depth_pct) * sessions; acc.scroll_sessions += sessions; }
    if (row.avg_engagement_time_sec != null && sessions > 0) { acc.engagement_weighted += n(row.avg_engagement_time_sec) * sessions; acc.engagement_sessions += sessions; }
    return acc;
  }, { sessions: 0, dead_clicks: 0, rage_clicks: 0, quick_backs: 0, script_errors: 0, scroll_weighted: 0, scroll_sessions: 0, engagement_weighted: 0, engagement_sessions: 0 });
  const byUrl = new Map();
  for (const row of rows) {
    const key = row.page_url || 'unknown';
    if (!byUrl.has(key)) byUrl.set(key, { page_url: key, sessions: 0, dead_clicks: 0, rage_clicks: 0, quick_backs: 0, script_errors: 0 });
    const item = byUrl.get(key);
    item.sessions += n(row.total_sessions); item.dead_clicks += n(row.dead_click_count); item.rage_clicks += n(row.rage_click_count); item.quick_backs += n(row.quick_back_count); item.script_errors += n(row.script_error_count);
  }
  return {
    rows: rows.length,
    max_date: rows.map((r) => r.date).sort().at(-1) || null,
    totals: {
      sessions: totals.sessions,
      avg_scroll_depth_pct_weighted: totals.scroll_sessions ? Number((totals.scroll_weighted / totals.scroll_sessions).toFixed(1)) : null,
      avg_engagement_time_sec_weighted: totals.engagement_sessions ? Number((totals.engagement_weighted / totals.engagement_sessions).toFixed(1)) : null,
      dead_clicks: totals.dead_clicks,
      rage_clicks: totals.rage_clicks,
      quick_backs: totals.quick_backs,
      script_errors: totals.script_errors,
    },
    top_problem_pages: Array.from(byUrl.values()).sort((a, b) => (b.dead_clicks + b.quick_backs + b.script_errors) - (a.dead_clicks + a.quick_backs + a.script_errors)).slice(0, 10),
  };
}

function aggregateHeatmap(rows) {
  const bySection = new Map();
  for (const row of rows) {
    const key = row.section_id || 'unknown';
    if (!bySection.has(key)) bySection.set(key, { section_id: key, page_url: row.page_url || null, unique_sessions: 0, click_count: 0, dead_click_count: 0, rage_click_count: 0, scroll_abandon_count: 0 });
    const item = bySection.get(key);
    item.unique_sessions += n(row.unique_sessions); item.click_count += n(row.click_count); item.dead_click_count += n(row.dead_click_count); item.rage_click_count += n(row.rage_click_count); item.scroll_abandon_count += n(row.scroll_abandon_count);
  }
  return {
    rows: rows.length,
    max_date: rows.map((r) => r.date).sort().at(-1) || null,
    top_clicked_sections: Array.from(bySection.values()).sort((a, b) => b.click_count - a.click_count).slice(0, 12),
    top_dead_click_sections: Array.from(bySection.values()).sort((a, b) => b.dead_click_count - a.dead_click_count).slice(0, 12),
    top_scroll_abandon_sections: Array.from(bySection.values()).sort((a, b) => b.scroll_abandon_count - a.scroll_abandon_count).slice(0, 12),
  };
}

function aggregateIntent(rows) {
  const totals = rows.reduce((acc, row) => {
    const sessions = n(row.sessions);
    acc.sessions += sessions;
    acc.returning_sessions += n(row.returning_sessions);
    acc.checkout_clicks += n(row.checkout_clicks);
    acc.chat_clicks += n(row.chat_clicks);
    acc.faq_opens += n(row.faq_opens);
    acc.atc_failed_sessions += n(row.atc_failed_sessions);
    for (const key of ['scroll50_rate_pct', 'scroll90_rate_pct', 'hero_cta_rate_pct', 'cart_view_rate_pct', 'atc_session_rate_pct']) {
      if (row[key] != null && sessions > 0) { acc.weighted[key] += n(row[key]) * sessions; acc.weight[key] += sessions; }
    }
    return acc;
  }, { sessions: 0, returning_sessions: 0, checkout_clicks: 0, chat_clicks: 0, faq_opens: 0, atc_failed_sessions: 0, weighted: { scroll50_rate_pct: 0, scroll90_rate_pct: 0, hero_cta_rate_pct: 0, cart_view_rate_pct: 0, atc_session_rate_pct: 0 }, weight: { scroll50_rate_pct: 0, scroll90_rate_pct: 0, hero_cta_rate_pct: 0, cart_view_rate_pct: 0, atc_session_rate_pct: 0 } });
  const weighted = {};
  for (const key of Object.keys(totals.weighted)) weighted[key] = totals.weight[key] ? Number((totals.weighted[key] / totals.weight[key]).toFixed(1)) : null;
  return {
    rows: rows.length,
    max_date: rows.map((r) => r.date).sort().at(-1) || null,
    totals: {
      sessions: totals.sessions,
      returning_sessions: totals.returning_sessions,
      returning_session_rate_pct: pct(totals.returning_sessions, totals.sessions),
      checkout_clicks: totals.checkout_clicks,
      chat_clicks: totals.chat_clicks,
      faq_opens: totals.faq_opens,
      atc_failed_sessions: totals.atc_failed_sessions,
      ...weighted,
    },
    by_variant: rows.reduce((acc, row) => {
      const key = row.variant_path || 'unknown';
      if (!acc[key]) acc[key] = { variant_path: key, sessions: 0, checkout_clicks: 0, chat_clicks: 0, faq_opens: 0 };
      acc[key].sessions += n(row.sessions); acc[key].checkout_clicks += n(row.checkout_clicks); acc[key].chat_clicks += n(row.chat_clicks); acc[key].faq_opens += n(row.faq_opens);
      return acc;
    }, {}),
  };
}


function aggregateLeads(rows) {
  const byExperiment = new Map();
  const byAd = new Map();
  const byStatus = {};
  for (const row of rows) {
    byStatus[row.status || 'unknown'] = (byStatus[row.status || 'unknown'] || 0) + 1;
    const exp = row.experiment_key || row.experiment_id || 'unknown';
    if (!byExperiment.has(exp)) byExperiment.set(exp, { experiment: exp, leads: 0, qualified: 0, deposit_paid: 0, closed_won: 0 });
    const e = byExperiment.get(exp);
    e.leads += 1;
    if (['qualified', 'deposit_offered', 'deposit_paid', 'closed_won'].includes(row.status)) e.qualified += 1;
    if (row.status === 'deposit_paid') e.deposit_paid += 1;
    if (row.status === 'closed_won') e.closed_won += 1;
    const ad = row.meta_ad_id || 'unknown';
    if (!byAd.has(ad)) byAd.set(ad, { meta_ad_id: ad, leads: 0, qualified: 0 });
    const a = byAd.get(ad);
    a.leads += 1;
    if (['qualified', 'deposit_offered', 'deposit_paid', 'closed_won'].includes(row.status)) a.qualified += 1;
  }
  return {
    rows: rows.length,
    max_created_at: rows.map((r) => r.created_at).filter(Boolean).sort().at(-1) || null,
    status_counts: byStatus,
    by_experiment: Array.from(byExperiment.values()).sort((a, b) => b.leads - a.leads),
    by_ad: Array.from(byAd.values()).sort((a, b) => b.leads - a.leads),
  };
}

function aggregateDeposits(rows) {
  const byExperiment = new Map();
  const byAd = new Map();
  const totals = { rows: rows.length, deposit_links_sent: 0, deposits_initiated: 0, deposits_completed: 0, deposit_revenue: 0 };
  for (const row of rows) {
    if (row.event_type === 'deposit_link_sent') totals.deposit_links_sent += 1;
    if (row.event_type === 'deposit_initiated') totals.deposits_initiated += 1;
    if (row.event_type === 'deposit_completed') { totals.deposits_completed += 1; totals.deposit_revenue += n(row.amount); }
    const exp = row.experiment_key || row.experiment_id || 'unknown';
    if (!byExperiment.has(exp)) byExperiment.set(exp, { experiment: exp, deposit_links_sent: 0, deposits_completed: 0, deposit_revenue: 0 });
    const e = byExperiment.get(exp);
    if (row.event_type === 'deposit_link_sent') e.deposit_links_sent += 1;
    if (row.event_type === 'deposit_completed') { e.deposits_completed += 1; e.deposit_revenue += n(row.amount); }
    const ad = row.meta_ad_id || 'unknown';
    if (!byAd.has(ad)) byAd.set(ad, { meta_ad_id: ad, deposits_completed: 0, deposit_revenue: 0 });
    const a = byAd.get(ad);
    if (row.event_type === 'deposit_completed') { a.deposits_completed += 1; a.deposit_revenue += n(row.amount); }
  }
  totals.deposit_revenue = money(totals.deposit_revenue);
  return {
    rows: rows.length,
    max_created_at: rows.map((r) => r.created_at).filter(Boolean).sort().at(-1) || null,
    totals,
    by_experiment: Array.from(byExperiment.values()).map((r) => ({ ...r, deposit_revenue: money(r.deposit_revenue) })).sort((a, b) => b.deposit_revenue - a.deposit_revenue),
    by_ad: Array.from(byAd.values()).map((r) => ({ ...r, deposit_revenue: money(r.deposit_revenue) })).sort((a, b) => b.deposit_revenue - a.deposit_revenue),
  };
}

function paidLeadCosts(meta, leads, deposits, touch) {
  const spendByAd = new Map((meta.by_ad || []).map((ad) => [ad.meta_ad_id || 'unknown', ad.spend || 0]));
  const totalSpend = meta.totals?.spend || 0;
  const leadCount = leads.rows || 0;
  const completedDeposits = deposits.totals?.deposits_completed || 0;
  const byAd = (leads.by_ad || []).map((row) => {
    const spend = spendByAd.get(row.meta_ad_id) || 0;
    const dep = (deposits.by_ad || []).find((d) => d.meta_ad_id === row.meta_ad_id) || { deposits_completed: 0, deposit_revenue: 0 };
    return {
      meta_ad_id: row.meta_ad_id,
      spend: money(spend),
      leads: row.leads,
      qualified: row.qualified,
      deposits_completed: dep.deposits_completed,
      deposit_revenue: dep.deposit_revenue,
      cost_per_whatsapp_lead: row.leads ? money(spend / row.leads) : null,
      cost_per_qualified_lead: row.qualified ? money(spend / row.qualified) : null,
      cost_per_deposit_completed: dep.deposits_completed ? money(spend / dep.deposits_completed) : null,
    };
  });
  return {
    total_spend: money(totalSpend),
    whatsapp_click_sessions: touch.session_funnel?.whatsapp_click || 0,
    whatsapp_leads: leadCount,
    deposits_completed: completedDeposits,
    cost_per_whatsapp_click: (touch.session_funnel?.whatsapp_click || 0) ? money(totalSpend / touch.session_funnel.whatsapp_click) : null,
    cost_per_whatsapp_lead: leadCount ? money(totalSpend / leadCount) : null,
    cost_per_deposit_completed: completedDeposits ? money(totalSpend / completedDeposits) : null,
    by_ad: byAd.sort((a, b) => b.spend - a.spend),
    caveat: 'Only valid as a paid-cost verdict when source-health says paid Meta data is fresh and ad IDs/UTMs are populated on leads.',
  };
}

function aggregateGa4(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.sessions += n(row.sessions); acc.views += n(row.screen_page_views); acc.users += n(row.total_users); acc.new_users += n(row.new_users);
    acc.add_to_carts += n(row.add_to_carts); acc.begin_checkouts += n(row.begin_checkouts); acc.purchases += n(row.purchases); acc.revenue += n(row.purchase_revenue);
    acc.events += n(row.event_count);
    if (row.average_session_duration_sec != null && n(row.sessions) > 0) { acc.duration_weighted += n(row.average_session_duration_sec) * n(row.sessions); acc.duration_sessions += n(row.sessions); }
    return acc;
  }, { sessions: 0, views: 0, users: 0, new_users: 0, add_to_carts: 0, begin_checkouts: 0, purchases: 0, revenue: 0, events: 0, duration_weighted: 0, duration_sessions: 0 });
  const bySource = {};
  for (const row of rows) {
    const source = row.session_source_medium || 'unknown';
    if (!bySource[source]) bySource[source] = { source_medium: source, sessions: 0, purchases: 0, revenue: 0 };
    bySource[source].sessions += n(row.sessions); bySource[source].purchases += n(row.purchases); bySource[source].revenue += n(row.purchase_revenue);
  }
  return {
    rows: rows.length,
    max_hour: rows.map((r) => r.report_hour).filter(Boolean).sort().at(-1) || null,
    min_hour: rows.map((r) => r.report_hour).filter(Boolean).sort()[0] || null,
    totals: {
      sessions: totals.sessions,
      screen_page_views: totals.views,
      total_users: totals.users,
      new_users: totals.new_users,
      add_to_carts: totals.add_to_carts,
      begin_checkouts: totals.begin_checkouts,
      purchases: totals.purchases,
      purchase_revenue: money(totals.revenue),
      avg_session_duration_sec_weighted: totals.duration_sessions ? Number((totals.duration_weighted / totals.duration_sessions).toFixed(1)) : null,
    },
    top_source_medium: Object.values(bySource).map((r) => ({ ...r, revenue: money(r.revenue) })).sort((a, b) => b.sessions - a.sessions).slice(0, 10),
  };
}

function buildObservations({ meta, touch, shopify, clarity, heatmap, intent, sourceHealth, ga4, leads, deposits }) {
  const paidUsable = Boolean(metricPolicy(sourceHealth, 'paid_atc_purchase_verdicts').usable);
  const observations = [];
  const interpretations = [];
  const hypotheses = [];
  const recommendations = [];
  const cannotSay = [];

  if (meta.totals.rows > 0) {
    observations.push(`Historical Meta rows cover ${meta.min_date || 'n/a'} to ${meta.max_date || 'n/a'} with ${meta.totals.impressions} impressions, ${meta.totals.clicks} clicks, A$${meta.totals.spend} spend, ${meta.totals.purchases} purchases and A$${meta.totals.revenue} revenue.`);
    if (!paidUsable) cannotSay.push('Current CPA, current ROAS, current winner and scale readiness are blocked because paid Meta verdicts are not fresh. Historical Meta numbers are label-only, not a current recommendation source.');
    const bestRevenueAd = maxBy(meta.by_ad, (ad) => ad.revenue || 0);
    if (bestRevenueAd?.revenue > 0) observations.push(`Historical revenue is concentrated in “${bestRevenueAd.ad_name}”: A$${bestRevenueAd.revenue} revenue from A$${bestRevenueAd.spend} spend.`);
  } else {
    cannotSay.push('No Meta rows were found inside the selected window.');
  }

  if (touch.session_funnel.cart_view > 0) {
    observations.push(`First-party KRYO sessions show ${touch.session_funnel.cart_view} cart-view sessions but only ${touch.session_funnel.cart_checkout_click} checkout-click sessions (${touch.session_funnel.cart_to_checkout_click_rate_pct ?? 'n/a'}%).`);
    if ((safeRate(touch.session_funnel.cart_checkout_click, touch.session_funnel.cart_view) ?? 1) < 0.15) {
      interpretations.push('The largest measured onsite leak is not pure top-of-page interest. It is high-intent hesitation between cart and checkout. This usually points to trust, delivery certainty, offer clarity, payment confidence or hidden-cost anxiety.');
      recommendations.push('Prioritise the next messaging test around cart/CTA trust: dispatch certainty, refundable deposit, WhatsApp concierge, warranty/returns, and exact “what happens after I pay” proof near every high-intent CTA.');
    }
  }

  if (touch.session_funnel.whatsapp_click + touch.session_funnel.chat_click > 0) {
    observations.push(`Chat intent exists but is small: ${touch.session_funnel.whatsapp_click} WhatsApp-click sessions and ${touch.session_funnel.chat_click} chat-click sessions from ${touch.kryo_sessions} tracked KRYO sessions.`);
    hypotheses.push('A low-friction WhatsApp capture could convert the “interested but not ready” segment if it is presented as securing access, dispatch priority, or concierge eligibility instead of generic support.');
  } else {
    hypotheses.push('WhatsApp may be under-presented or under-instrumented. Treat missing clicks as a measurement/UI problem before assuming no demand for chat.');
  }

  if (shopify.totals.checkouts_started > 0) observations.push(`Shopify funnel shows ${shopify.totals.checkouts_started} started checkouts, ${shopify.totals.checkouts_completed} completed and ${shopify.totals.checkouts_abandoned} abandoned in the window.`);
  else cannotSay.push('Shopify has too few checkout starts for a statistically stable checkout-abandonment diagnosis.');

  if (clarity.totals.sessions > 0) {
    observations.push(`Clarity captured ${clarity.totals.sessions} KRYO page sessions with weighted ${clarity.totals.avg_scroll_depth_pct_weighted ?? 'n/a'}% scroll depth, ${clarity.totals.dead_clicks} dead clicks, ${clarity.totals.quick_backs} quick backs and ${clarity.totals.script_errors} script errors.`);
    if (clarity.totals.dead_clicks || clarity.totals.script_errors) {
      interpretations.push('There is measurable friction/noise on the page. Before calling a copy test a winner or loser, the page needs a proof pass for broken click targets, slow/errored scripts and misleading interactive elements.');
      recommendations.push('Use Clarity top-offender sections as the QA map before message changes: fix broken intent paths first, then test urgency/trust copy.');
    }
  }

  if (intent.totals.sessions > 0) {
    observations.push(`Intent view reports ${intent.totals.sessions} sessions, ${intent.totals.returning_session_rate_pct ?? 'n/a'}% returning sessions, ${intent.totals.scroll50_rate_pct ?? 'n/a'}% scroll50, ${intent.totals.scroll90_rate_pct ?? 'n/a'}% scroll90 and ${intent.totals.hero_cta_rate_pct ?? 'n/a'}% hero CTA rate.`);
    if ((intent.totals.returning_session_rate_pct ?? 0) > 8) interpretations.push('A meaningful returning-visitor pool exists. This supports a two-lane launch funnel: instant purchase for hyper-buyers, WhatsApp/deposit capture for warm returners.');
  }

  const ga4Source = sourceById(sourceHealth, 'ga4');
  if (ga4.rows > 0) observations.push(`GA4 warehouse has ${ga4.rows} historical rows inside the window through ${ga4.max_hour || 'n/a'}, but source-health status is ${ga4Source?.status || 'unknown'}.`);
  if (!metricPolicy(sourceHealth, 'ga4_gsc').usable) cannotSay.push('GA4/GSC cannot be used for current acquisition-quality or SEO recommendations until Pipeboard quota/GSC access are restored.');
  if (!metricPolicy(sourceHealth, 'paid_atc_purchase_verdicts').usable) cannotSay.push('Cost per WhatsApp lead/deposit can be computed structurally, but cannot be used as a current paid verdict until Meta spend rows are fresh after ads restart.');
  if ((leads.rows || 0) === 0) hypotheses.push('The lead spine is ready, but the page or ads have not yet generated captured WhatsApp signups in this window.');

  if (heatmap.top_dead_click_sections[0]?.dead_click_count > 0) recommendations.push(`Inspect section “${heatmap.top_dead_click_sections[0].section_id}” first; it is the top dead-click section in the selected heatmap rows.`);
  recommendations.push('Keep sales and lead capture as separate lanes: primary CTA for buy/deposit, secondary sticky WhatsApp CTA for securing dispatch access. Do not blend the CTAs into one vague action.');
  hypotheses.push('The strongest launch architecture is likely scarcity + trust + concierge: live units remaining, August dispatch proof, refundable deposit path, and WhatsApp as the bridge for buyers who need reassurance.');

  return { observations, interpretations, hypotheses, recommendations, cannot_say_yet: cannotSay };
}

function formatTable(rows, columns) {
  if (!rows.length) return ['_No rows._'];
  const lines = [];
  lines.push(`| ${columns.map((c) => c.label).join(' | ')} |`);
  lines.push(`| ${columns.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${columns.map((c) => String(row[c.key] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
  return lines;
}

async function main() {
  const args = parseArgs(process.argv);
  await loadEnv();
  const window = resolveWindow(args);
  if (args.refreshHealth) await runNodeScript('scripts/kryo-source-health.mjs');

  const sourceHealth = await readJson(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json')) || { sources: [], metric_policy: {} };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-performance-analyst-pack/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const startTs = `${window.startDate}T00:00:00+00:00`;
  const endTs = `${window.endDate}T23:59:59+00:00`;
  const readEntries = Object.entries({
    meta: sbMaybe('meta_ad_metrics_daily', [
      ['select', 'date,meta_ad_id,ad_name,adset_name,campaign_id,adset_id,spend,impressions,clicks,outbound_clicks,landing_page_views,add_to_carts,initiate_checkouts,purchases,revenue'],
      ['date', `gte.${window.startDate}`], ['date', `lte.${window.endDate}`], ['order', 'date.asc'],
    ], { pageSize: 1000, maxPages: 20 }),
    touches: sbMaybe('attribution_touches', [
      ['select', 'ts,session_id,anonymous_id,event_type,page_path,channel,device_type,ip_country,is_internal,utm_source,utm_medium,utm_campaign,utm_content,meta_ad_id,landing_page_id,event_metadata'],
      ['ts', `gte.${startTs}`], ['ts', `lte.${endTs}`], ['order', 'ts.asc'],
    ], { pageSize: 1000, maxPages: 80 }),
    shopify: sbMaybe('shopify_funnel_daily', [
      ['select', 'date,checkouts_started,checkouts_completed,checkouts_abandoned,abandoned_value'],
      ['date', `gte.${window.startDate}`], ['date', `lte.${window.endDate}`], ['order', 'date.asc'],
    ], { pageSize: 1000, maxPages: 5 }),
    clarity: sbMaybe('clarity_friction_elements', [
      ['select', 'date,page_url,total_sessions,dead_click_count,rage_click_count,quick_back_count,script_error_count,avg_scroll_depth_pct,avg_engagement_time_sec'],
      ['date', `gte.${window.startDate}`], ['date', `lte.${window.endDate}`], ['page_url', 'ilike.*kryo*'], ['order', 'date.asc'],
    ], { pageSize: 1000, maxPages: 20 }),
    heatmap: sbMaybe('clarity_section_heatmap', [
      ['select', 'date,page_url,section_id,unique_sessions,click_count,dead_click_count,rage_click_count,scroll_abandon_count'],
      ['date', `gte.${window.startDate}`], ['date', `lte.${window.endDate}`], ['page_url', 'ilike.*kryo*'], ['order', 'date.asc'],
    ], { pageSize: 1000, maxPages: 20 }),
    intent: sbMaybe('vw_kryo_intent_daily', [
      ['select', 'date,variant_path,sessions,returning_sessions,scroll50_rate_pct,scroll90_rate_pct,hero_cta_rate_pct,cart_view_rate_pct,atc_session_rate_pct,checkout_clicks,cart_to_checkout_rate_pct,cart_exit_rate_pct,chat_clicks,faq_opens,atc_failed_sessions'],
      ['date', `gte.${window.startDate}`], ['date', `lte.${window.endDate}`], ['order', 'date.asc'],
    ], { pageSize: 1000, maxPages: 10 }),
    ga4: sbMaybe('ga4_page_hourly', [
      ['select', 'report_hour,page_path,country,device_category,session_source_medium,sessions,screen_page_views,total_users,new_users,average_session_duration_sec,event_count,add_to_carts,begin_checkouts,purchases,purchase_revenue'],
      ['report_hour', `gte.${startTs}`], ['report_hour', `lte.${endTs}`], ['page_path', 'ilike.*kryo*'], ['order', 'report_hour.asc'],
    ], { pageSize: 1000, maxPages: 20 }),
    leads: sbMaybe('kryo_leads', [
      ['select', 'id,created_at,source,status,session_id,anonymous_id,phone_e164,meta_campaign_id,meta_adset_id,meta_ad_id,creative_id,angle_id,hook_id,landing_page_version,experiment_id,experiment_key,channel,market,device_type'],
      ['created_at', `gte.${startTs}`], ['created_at', `lte.${endTs}`], ['order', 'created_at.asc'],
    ], { pageSize: 1000, maxPages: 20 }),
    deposits: sbMaybe('kryo_deposit_events', [
      ['select', 'id,created_at,lead_id,experiment_id,event_type,amount,currency,payment_provider,meta_campaign_id,meta_adset_id,meta_ad_id,landing_page_version,raw_payload'],
      ['created_at', `gte.${startTs}`], ['created_at', `lte.${endTs}`], ['order', 'created_at.asc'],
    ], { pageSize: 1000, maxPages: 20 }),
  });
  const reads = Object.fromEntries(await Promise.all(readEntries.map(async ([key, promise]) => [key, await promise])));

  const meta = aggregateMeta(reads.meta.rows);
  const touch = aggregateTouch(reads.touches.rows);
  const shopify = aggregateShopify(reads.shopify.rows);
  const clarity = aggregateClarity(reads.clarity.rows);
  const heatmap = aggregateHeatmap(reads.heatmap.rows);
  const intent = aggregateIntent(reads.intent.rows);
  const ga4 = aggregateGa4(reads.ga4.rows);
  const leads = aggregateLeads(reads.leads.rows);
  const deposits = aggregateDeposits(reads.deposits.rows);
  const leadCosts = paidLeadCosts(meta, leads, deposits, touch);
  const analysis = buildObservations({ meta, touch, shopify, clarity, heatmap, intent, sourceHealth, ga4, leads, deposits });
  const errors = Object.fromEntries(Object.entries(reads).filter(([, v]) => !v.ok).map(([k, v]) => [k, v.error]));

  const pack = {
    generated_at: new Date().toISOString(),
    mutation_performed: false,
    purpose: 'Read-only deterministic analyst pack for chat-based KRYO marketing insight. Not a dashboard and not a live website change.',
    window: { start_date: window.startDate, end_date: window.endDate, days: window.days, complete_days_only: true },
    source_confidence: {
      source_health_generated_at: sourceHealth.generated_at || null,
      paid_current_verdicts_usable: Boolean(metricPolicy(sourceHealth, 'paid_atc_purchase_verdicts').usable),
      onsite_intent_usable: Boolean(metricPolicy(sourceHealth, 'onsite_intent').usable),
      shopify_orders_revenue_usable: Boolean(metricPolicy(sourceHealth, 'shopify_orders_revenue').usable),
      ga4_gsc_usable: Boolean(metricPolicy(sourceHealth, 'ga4_gsc').usable),
      sources: Object.fromEntries(['pipeboard_meta', 'ga4', 'gsc', 'clarity', 'shopify_funnel', 'attribution_touches', 'shopify_admin_theme'].map((id) => {
        const s = sourceById(sourceHealth, id);
        return [id, s ? { status: s.status, max_timestamp: s.max_timestamp, usable: s.usable_for_recommendations, blocker: s.blocker || null } : null];
      })),
    },
    exact_results: { meta_historical: meta, first_party_touches: touch, shopify_funnel: shopify, clarity_friction: clarity, clarity_heatmap: heatmap, onsite_intent_view: intent, ga4_historical_or_stale: ga4, whatsapp_leads: leads, deposit_events: deposits, paid_lead_costs: leadCosts },
    analyst_layers: analysis,
    read_errors: errors,
    artifacts: {
      source_health: path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.md'),
      growth_brief: path.join(repoRoot, 'artifacts/kryo-growth-decision-brief/latest/growth-decision-brief.md'),
    },
  };

  const jsonPath = path.join(outDir, 'analyst-pack.json');
  await fs.writeFile(jsonPath, JSON.stringify(pack, null, 2));
  const latestDir = path.join(repoRoot, 'artifacts/kryo-performance-analyst-pack/latest');
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(latestDir, 'analyst-pack.json'), JSON.stringify(pack, null, 2));

  const lines = [];
  lines.push('# KRYO Performance Analyst Pack');
  lines.push('');
  lines.push(`Generated: ${pack.generated_at}`);
  lines.push(`Window: ${window.startDate} to ${window.endDate} (${window.days} complete days)`);
  lines.push('Mutation performed: no');
  lines.push('');
  lines.push('## Source confidence');
  lines.push(`- Paid current CPA/ROAS/winner claims usable: ${pack.source_confidence.paid_current_verdicts_usable ? 'yes' : 'no'}`);
  lines.push(`- Onsite intent usable: ${pack.source_confidence.onsite_intent_usable ? 'yes' : 'no'}`);
  lines.push(`- Shopify orders/revenue usable: ${pack.source_confidence.shopify_orders_revenue_usable ? 'yes' : 'no'}`);
  lines.push(`- GA4/GSC usable: ${pack.source_confidence.ga4_gsc_usable ? 'yes' : 'no'}`);
  for (const [id, s] of Object.entries(pack.source_confidence.sources)) if (s) lines.push(`- ${id}: ${s.status}; max=${s.max_timestamp || 'n/a'}; usable=${s.usable ? 'yes' : 'no'}${s.blocker ? `; blocker=${s.blocker}` : ''}`);
  lines.push('');
  lines.push('## Exact results');
  lines.push(`- Historical Meta: A$${meta.totals.spend} spend, ${meta.totals.impressions} impressions, ${meta.totals.clicks} clicks, ${meta.totals.landing_page_views} LPVs, ${meta.totals.add_to_carts} ATCs, ${meta.totals.initiate_checkouts} ICs, ${meta.totals.purchases} purchases, A$${meta.totals.revenue} revenue, ROAS ${meta.totals.roas ?? 'n/a'}. Max date ${meta.max_date || 'n/a'}.`);
  lines.push(`- First-party KRYO sessions: ${touch.kryo_sessions}; cart views ${touch.session_funnel.cart_view}; checkout clicks ${touch.session_funnel.cart_checkout_click}; cart exits ${touch.session_funnel.cart_exit_without_checkout}; WhatsApp clicks ${touch.session_funnel.whatsapp_click}; chat clicks ${touch.session_funnel.chat_click}.`);
  lines.push(`- WhatsApp lead spine: ${leads.rows} leads, ${deposits.totals.deposits_completed} deposits completed, ${leadCosts.cost_per_whatsapp_lead == null ? 'n/a' : `A$${leadCosts.cost_per_whatsapp_lead}`} cost per WhatsApp lead, ${leadCosts.cost_per_whatsapp_click == null ? 'n/a' : `A$${leadCosts.cost_per_whatsapp_click}`} cost per WhatsApp click when paid data is fresh.`);
  lines.push(`- Shopify funnel: ${shopify.totals.checkouts_started} started, ${shopify.totals.checkouts_completed} completed, ${shopify.totals.checkouts_abandoned} abandoned, A$${shopify.totals.abandoned_value} abandoned value.`);
  lines.push(`- Clarity friction: ${clarity.totals.sessions} sessions, ${clarity.totals.dead_clicks} dead clicks, ${clarity.totals.quick_backs} quick backs, ${clarity.totals.script_errors} script errors, ${clarity.totals.avg_scroll_depth_pct_weighted ?? 'n/a'}% weighted avg scroll.`);
  lines.push(`- Intent view: ${intent.totals.sessions} sessions, ${intent.totals.returning_session_rate_pct ?? 'n/a'}% returning, ${intent.totals.scroll50_rate_pct ?? 'n/a'}% scroll50, ${intent.totals.scroll90_rate_pct ?? 'n/a'}% scroll90, ${intent.totals.hero_cta_rate_pct ?? 'n/a'}% hero CTA.`);
  lines.push('');
  lines.push('## Top historical Meta ads by spend');
  lines.push(...formatTable(meta.by_ad.slice(0, 8), [
    { key: 'ad_name', label: 'Ad' }, { key: 'spend', label: 'Spend' }, { key: 'landing_page_views', label: 'LPV' }, { key: 'add_to_carts', label: 'ATC' }, { key: 'purchases', label: 'Purchases' }, { key: 'revenue', label: 'Revenue' }, { key: 'roas', label: 'ROAS' }, { key: 'cost_per_atc', label: 'Cost/ATC' },
  ]));
  lines.push('');
  lines.push('## Top touch pages');
  lines.push(...formatTable(touch.top_pages.slice(0, 8), [{ key: 'key', label: 'Page' }, { key: 'value', label: 'Events' }]));
  lines.push('');
  lines.push('## Observations');
  for (const item of analysis.observations) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Interpretations');
  for (const item of analysis.interpretations) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Hypotheses');
  for (const item of analysis.hypotheses) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Recommendations');
  for (const item of analysis.recommendations) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Cannot say yet');
  for (const item of analysis.cannot_say_yet) lines.push(`- ${item}`);
  if (Object.keys(errors).length) {
    lines.push('');
    lines.push('## Read errors');
    for (const [key, value] of Object.entries(errors)) lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push(`Raw JSON: ${jsonPath}`);

  const mdPath = path.join(outDir, 'analyst-pack.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(latestDir, 'analyst-pack.md'), `${lines.join('\n')}\n`);

  console.log(JSON.stringify({ status: 'ok', report: mdPath, json: jsonPath, latest: path.join(latestDir, 'analyst-pack.md'), mutation_performed: false, read_errors: Object.keys(errors) }, null, 2));
}

main().catch((err) => {
  console.error(sanitizeError(err instanceof Error ? err.stack || err.message : String(err)));
  process.exit(1);
});
