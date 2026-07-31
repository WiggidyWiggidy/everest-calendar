#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const REQUIRED_TAGS = ['utm_source', 'utm_medium', 'utm_campaign_id', 'utm_adset_id', 'utm_ad_id'];

async function loadLocalEnv() {
  try {
    const raw = await fs.readFile(path.join(repoRoot, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

function supabaseHeaders() {
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Supabase service key missing');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function supabaseGet(pathname, params = {}) {
  const base = (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('Supabase URL missing');
  const url = new URL(`${base}/rest/v1/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const res = await fetchWithRetry(url, { headers: supabaseHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function extractUrls(ad) {
  const urls = new Set();
  if (ad.link_url) urls.add(ad.link_url);
  const spec = ad.asset_feed_spec || {};
  for (const row of spec.link_urls || []) {
    if (row.website_url) urls.add(row.website_url);
    if (row.url) urls.add(row.url);
  }
  return Array.from(urls).filter(Boolean);
}

function hasKryoUrl(ad) {
  return extractUrls(ad).some((url) => /kryo/i.test(url)) || /kryo/i.test(ad.name || '') || /kryo/i.test(JSON.stringify(ad.asset_feed_spec || {}));
}

function checkUrl(raw) {
  const result = { url: raw, is_kryo2: /\/products\/kryo2/i.test(raw), has_country_ae: /[?&]country=AE\b/i.test(raw), missing_tags: [], parse_error: null };
  try {
    const url = new URL(raw);
    for (const tag of REQUIRED_TAGS) {
      if (!url.searchParams.has(tag)) result.missing_tags.push(tag);
    }
  } catch (err) {
    result.parse_error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

async function main() {
  await loadLocalEnv();
  const outDir = path.resolve(repoRoot, argValue('--out', `artifacts/kryo-meta-url-audit/${new Date().toISOString().replace(/[:.]/g, '-')}`));
  await fs.mkdir(outDir, { recursive: true });
  const [ads, guardrails] = await Promise.all([
    supabaseGet('meta_ads', { select: 'meta_ad_id,name,status,link_url,asset_feed_spec,creative_id,updated_at', order: 'updated_at.desc', limit: '1000' }),
    supabaseGet('marketing_guardrail_alerts', { select: 'alert_type,severity,entity_id,status,evidence,last_seen_at', status: 'neq.resolved', order: 'last_seen_at.desc', limit: '100' }),
  ]);
  const kryoAds = (ads || []).filter(hasKryoUrl);
  const audited = kryoAds.map((ad) => {
    const urls = extractUrls(ad).map(checkUrl);
    const missingTags = Array.from(new Set(urls.flatMap((url) => url.missing_tags)));
    const bareKryo2 = urls.filter((url) => url.is_kryo2 && !url.has_country_ae).map((url) => url.url);
    return {
      meta_ad_id: ad.meta_ad_id,
      name: ad.name,
      status: ad.status,
      updated_at: ad.updated_at,
      urls,
      missing_required_tags: missingTags,
      bare_kryo2_without_country_ae: bareKryo2,
      risk: missingTags.length || bareKryo2.length ? 'needs_fix_before_spend' : 'ok',
    };
  }).sort((a, b) => (a.risk === b.risk ? 0 : a.risk === 'needs_fix_before_spend' ? -1 : 1));
  const openUrlTagAlerts = (guardrails || []).filter((row) => row.alert_type === 'meta_url_tags_missing');
  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      kryo_ads_audited: audited.length,
      ads_needing_fix: audited.filter((row) => row.risk !== 'ok').length,
      open_url_tag_guardrails: openUrlTagAlerts.length,
    },
    open_url_tag_guardrails: openUrlTagAlerts,
    audited_ads: audited,
  };
  const jsonPath = path.join(outDir, 'meta-url-audit.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const top = audited.filter((row) => row.risk !== 'ok').slice(0, 20);
  const md = `# KRYO Meta URL Audit\n\nGenerated: ${report.generated_at}\n\n- KRYO ads audited: ${report.summary.kryo_ads_audited}\n- Ads needing fix before spend: ${report.summary.ads_needing_fix}\n- Open URL-tag guardrails: ${report.summary.open_url_tag_guardrails}\n\n## Needs fix\n${top.length ? top.map((row) => `- ${row.meta_ad_id} — ${row.name}: missing tags [${row.missing_required_tags.join(', ') || 'none'}], bare KRYO2 URLs ${row.bare_kryo2_without_country_ae.length}`).join('\n') : '- None'}\n\nRaw JSON: ${jsonPath}\n`;
  const mdPath = path.join(outDir, 'meta-url-audit.md');
  await fs.writeFile(mdPath, md);
  console.log(JSON.stringify({ summary: report.summary, report: mdPath, json: jsonPath }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
