#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const OUT_ROOT = '/Users/happy/Desktop/02_Marketing/KRYO/route_audits';
const SINCE = process.argv.find(a => a.startsWith('--since='))?.split('=')[1] || '2026-05-13';
const WRITE_INBOX = process.argv.includes('--inbox');

if (!SUPABASE_URL || !SUPABASE_KEY || !META_TOKEN) {
  console.error('Missing EVEREST_SUPABASE_URL/KEY or META_ACCESS_TOKEN');
  process.exit(1);
}

function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach(x => p.append(k, x));
    else p.set(k, String(v));
  }
  return p.toString();
}

async function sbGet(table, params) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?${qs(params)}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

function norm(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/$/, '') || `${u.protocol}//${u.host}`;
  } catch { return String(raw || '').split('?')[0].replace(/\/$/, ''); }
}

function withEnGb(raw) {
  const u = new URL(raw);
  if (!u.pathname.startsWith('/en-gb/')) u.pathname = `/en-gb${u.pathname}`;
  return u.toString();
}

function classifyUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'invalid'; }
  const p = u.pathname;
  if (p === '/' || p === '') return 'homepage';
  if (p.includes('/products/kryo') || p.includes('/products/kryo2') || p.includes('/products/kryo_')) return 'kryo_product';
  if (p.includes('/products/')) return 'other_product';
  return 'other_page';
}

async function probe(raw) {
  const out = { url: raw, ok: false, status: null, final_url: null, title: null, canonical: null, routes_root: null, error: null };
  try {
    const tmp = `/tmp/kryo-route-audit-${process.pid}-${Math.random().toString(16).slice(2)}.html`;
    const meta = execFileSync('curl', [
      '-sS', '-L', '--max-time', '20',
      '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X) EverestLabsRouteAudit/1.0',
      '-o', tmp,
      '-w', '%{http_code}\\n%{url_effective}',
      raw,
    ], { encoding: 'utf8' });
    const [statusLine, ...urlLines] = meta.split('\n');
    const html = fs.readFileSync(tmp, 'utf8');
    fs.rmSync(tmp, { force: true });
    out.status = Number(statusLine);
    out.ok = out.status >= 200 && out.status < 300;
    out.final_url = urlLines.join('\n').trim() || raw;
    out.title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    out.canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || null;
    out.routes_root = html.match(/Shopify\.routes\.root\s*=\s*"([^"]+)"/)?.[1] || null;
  } catch (e) { out.error = e.message; }
  return out;
}

async function metaAd(adId) {
  const fields = 'id,name,status,effective_status,creative{id,name,object_story_spec,asset_feed_spec,url_tags},adset{id,name,status,effective_status},campaign{id,name,status,effective_status}';
  const u = new URL(`https://graph.facebook.com/v25.0/${adId}`);
  u.searchParams.set('fields', fields);
  u.searchParams.set('access_token', META_TOKEN);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Meta ${adId} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const c = data.creative || {};
  const ld = c.object_story_spec?.link_data || {};
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    effective_status: data.effective_status,
    campaign: data.campaign,
    adset: data.adset,
    creative_id: c.id,
    creative_name: c.name,
    link: ld.link || ld.call_to_action?.value?.link || null,
    cta_link: ld.call_to_action?.value?.link || null,
    cta_type: ld.call_to_action?.type || null,
    url_tags: c.url_tags || null,
    is_dynamic: Boolean(c.asset_feed_spec),
  };
}

const metrics = await sbGet('meta_ad_metrics_daily', {
  select: 'meta_ad_id,spend,clicks,outbound_clicks,landing_page_views,impressions,purchases,date',
  date: `gte.${SINCE}`,
  spend: 'gt.0',
  limit: '2000',
});
const spendByAd = new Map();
for (const r of metrics) {
  const id = r.meta_ad_id;
  const a = spendByAd.get(id) || { meta_ad_id: id, spend: 0, clicks: 0, outbound_clicks: 0, landing_page_views: 0, impressions: 0, purchases: 0, dates: new Set() };
  a.spend += Number(r.spend || 0);
  a.clicks += Number(r.clicks || 0);
  a.outbound_clicks += Number(r.outbound_clicks || 0);
  a.landing_page_views += Number(r.landing_page_views || 0);
  a.impressions += Number(r.impressions || 0);
  a.purchases += Number(r.purchases || 0);
  if (r.date) a.dates.add(r.date);
  spendByAd.set(id, a);
}

const clarityRows = await sbGet('clarity_friction_elements', {
  select: 'date,page_url,total_sessions,dead_click_count,quick_back_count,script_error_count',
  date: `gte.${SINCE}`,
  limit: '5000',
});

const ads = [];
for (const [adId, spend] of spendByAd.entries()) {
  const meta = await metaAd(adId);
  const clarity = new Map();
  for (const r of clarityRows) {
    if (!String(r.page_url || '').includes(adId)) continue;
    const k = norm(r.page_url);
    const c = clarity.get(k) || { url: k, class: classifyUrl(k), sessions: 0, rows: 0, dead: 0, quick: 0, script: 0, dates: new Set() };
    c.sessions += Number(r.total_sessions || 0);
    c.rows += 1;
    c.dead += Number(r.dead_click_count || 0);
    c.quick += Number(r.quick_back_count || 0);
    c.script += Number(r.script_error_count || 0);
    if (r.date) c.dates.add(r.date);
    clarity.set(k, c);
  }
  const probes = [];
  if (meta.link) {
    probes.push(await probe(meta.link));
    try { probes.push(await probe(withEnGb(meta.link))); } catch {}
  }
  const linkHost = meta.link ? new URL(meta.link).host : null;
  const finalPath = probes[0]?.final_url ? new URL(probes[0].final_url).pathname : null;
  const risk = probes[0]?.status === 404 ? 'critical_404_live_destination'
    : (linkHost === 'everestlabs.co' && finalPath === '/') ? 'critical_redirect_to_homepage'
    : [...clarity.values()].some(x => x.class !== 'kryo_product' && x.sessions > 0) ? 'leakage_detected'
    : 'ok';
  ads.push({
    ...spend,
    spend: Math.round(spend.spend * 100) / 100,
    dates: [...spend.dates].sort(),
    meta,
    probes,
    clarity: [...clarity.values()].map(x => ({ ...x, dates: [...x.dates].sort() })).sort((a,b) => b.sessions - a.sessions),
    risk,
  });
}

const generated_at = new Date().toISOString();
const report = { generated_at, since: SINCE, ads: ads.sort((a,b) => b.spend - a.spend) };
fs.mkdirSync(OUT_ROOT, { recursive: true });
const dir = path.join(OUT_ROOT, generated_at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'));
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'route-audit.json'), JSON.stringify(report, null, 2));

const lines = [];
lines.push(`# KRYO paid route audit — ${generated_at}`);
lines.push(`Since: ${SINCE}`);
for (const ad of report.ads) {
  lines.push(`\n## ${ad.meta.name || ad.meta_ad_id}`);
  lines.push(`- Risk: ${ad.risk}`);
  lines.push(`- Spend: $${ad.spend}; clicks: ${ad.clicks}; outbound: ${ad.outbound_clicks}; LPV: ${ad.landing_page_views}`);
  lines.push(`- Meta status: ${ad.meta.effective_status}`);
  lines.push(`- Meta link: ${ad.meta.link || 'missing'}`);
  for (const p of ad.probes) lines.push(`- Probe: ${p.status} ${p.url} → ${p.final_url}; title=${p.title}; canonical=${p.canonical}; routes.root=${p.routes_root}`);
  for (const c of ad.clarity.slice(0, 8)) lines.push(`- Clarity: ${c.sessions} sessions, ${c.rows} rows, ${c.class}, ${c.url}, dates ${c.dates.join(', ')}`);
}
fs.writeFileSync(path.join(dir, 'route-audit.md'), lines.join('\n') + '\n');

if (WRITE_INBOX && report.ads.some(a => a.risk !== 'ok')) {
  const worst = report.ads.find(a => a.risk !== 'ok');
  const inserted = await sbInsert('platform_inbox', {
    user_id: '174f2dff-7a96-464c-a919-b473c328d531',
    platform: 'marketing',
    contact_name: 'KRYO route audit',
    contact_identifier: `route_audit_${generated_at}`,
    status: 'pending',
    approval_tier: 2,
    raw_content: `URGENT: live Meta KRYO traffic route risk — ${worst.risk}`,
    ai_summary: `Live Meta route audit found ${worst.risk} on ${worst.meta_ad_id}.`,
    ai_recommendation: 'Fix destination before increasing spend. Use the 200-status KRYO URL or add a storefront redirect guard.',
    draft_reply: lines.join('\n').slice(0, 6000),
    metadata: { category: 'route_leak_audit', priority: 'urgent', report_dir: dir, since: SINCE, worst_ad_id: worst.meta_ad_id, risk: worst.risk },
  });
  report.inbox_row = inserted?.[0]?.id || inserted;
  fs.writeFileSync(path.join(dir, 'route-audit.json'), JSON.stringify(report, null, 2));
}

console.log(JSON.stringify({ report_dir: dir, ads_checked: report.ads.length, risks: report.ads.map(a => ({ ad_id: a.meta_ad_id, risk: a.risk, link_status: a.probes[0]?.status, fixed_candidate_status: a.probes[1]?.status, spend: a.spend })), inbox_row: report.inbox_row || null }, null, 2));
