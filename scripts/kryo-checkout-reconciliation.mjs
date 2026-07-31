#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const CART_EVENTS = [
  'page_view', 'product_view', 'product_viewed', 'hero_cta_click', 'sticky_cta_click',
  'cart_add_request', 'add_to_cart', 'product_added_to_cart', 'cart_add_failed', 'cart_view',
  'cart_checkout_click', 'cart_exit_without_checkout', 'checkout_start', 'checkout_started', 'order_placed',
];

function parseArgs(argv) {
  const args = { windowDays: 14, startDate: '', endDate: '', productPath: '/products/kryo2', outDir: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--window-days') args.windowDays = Math.min(Math.max(Number(argv[++i]), 1), 90);
    else if (arg === '--start-date') args.startDate = argv[++i];
    else if (arg === '--end-date') args.endDate = argv[++i];
    else if (arg === '--product-path') args.productPath = argv[++i];
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-checkout-reconciliation.mjs [--window-days N] [--start-date YYYY-MM-DD --end-date YYYY-MM-DD] [--product-path /products/kryo2] [--out DIR]');
      process.exit(0);
    }
  }
  return args;
}

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

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function latestJsonUnder(baseDir, fileName) {
  try {
    for (const preferred of ['latest', 'latest-gate', 'latest-smoke']) {
      const candidate = path.join(baseDir, preferred, fileName);
      try {
        const stat = await fs.stat(candidate);
        return { path: candidate, json: await readJson(candidate), mtimeMs: stat.mtimeMs };
      } catch {}
    }
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(baseDir, entry.name));
    const withStats = await Promise.all(dirs.map(async (dir) => ({ dir, stat: await fs.stat(dir) })));
    withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (const item of withStats) {
      const candidate = path.join(item.dir, fileName);
      try {
        const stat = await fs.stat(candidate);
        return { path: candidate, json: await readJson(candidate), mtimeMs: stat.mtimeMs };
      } catch {}
    }
  } catch {}
  return null;
}

function eventName(row) {
  if (row.event_type === 'product_added_to_cart') return 'add_to_cart';
  if (row.event_type === 'checkout_started') return 'checkout_start';
  if (row.event_type === 'product_viewed') return 'product_view';
  return row.event_type || '';
}

function sessionKey(row) {
  return row.session_id || row.anonymous_id || `row:${row.ts}:${row.event_type}`;
}

function pct(num, denom) {
  return denom > 0 ? Number(((num / denom) * 100).toFixed(1)) : null;
}

function countSessions(rows, events) {
  const allowed = new Set(events);
  return new Set(rows.filter((row) => allowed.has(eventName(row))).map(sessionKey)).size;
}

function countEvents(rows, events) {
  const allowed = new Set(events);
  return rows.filter((row) => allowed.has(eventName(row))).length;
}

function includesProductPath(pagePath, productPath) {
  return String(pagePath || '').includes(productPath) || (/\/products\/kryo2/i.test(String(pagePath || '')) && productPath === '/products/kryo2');
}

function classify({ proof, endpointOk, checkoutVisible, atcSessions, checkoutClickSessions, checkoutStartSessions, ga4BeginCheckouts, cartAddFailureRate }) {
  if (!endpointOk) return 'tracking_endpoint_or_internal_probe_broken';
  if (!checkoutVisible) return 'checkout_button_not_visible_in_browser_proof';
  if (atcSessions >= 3 && checkoutClickSessions === 0 && (checkoutStartSessions > 0 || ga4BeginCheckouts > 0)) return 'checkout_click_event_missing_but_downstream_checkout_exists';
  if (atcSessions >= 3 && checkoutClickSessions === 0 && checkoutStartSessions === 0 && ga4BeginCheckouts === 0) return 'cart_abandonment_or_checkout_click_listener_missing';
  if ((cartAddFailureRate ?? 0) >= 10) return 'cart_add_reliability_noise_present';
  if (!proof) return 'needs_browser_proof_refresh';
  return 'measurement_likely_ok';
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();
  const endDate = args.endDate || new Date().toISOString().slice(0, 10);
  const startDate = args.startDate || new Date(new Date(`${endDate}T00:00:00.000Z`).getTime() - (args.windowDays - 1) * 86400000).toISOString().slice(0, 10);
  const sinceIso = `${startDate}T00:00:00.000Z`;
  const untilIso = `${endDate}T23:59:59.999Z`;
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-checkout-reconciliation/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(outDir, { recursive: true });

  const [touches, ga4Rows, proofRaw] = await Promise.all([
    supabaseGet('attribution_touches', {
      select: 'ts,session_id,anonymous_id,event_type,page_path,is_internal,traffic_class,channel,meta_campaign_id,meta_ad_id,event_metadata',
      ts: `gte.${sinceIso}`,
      event_type: `in.(${CART_EVENTS.join(',')})`,
      order: 'ts.asc',
      limit: '20000',
    }),
    supabaseGet('ga4_page_hourly', {
      select: 'report_hour,page_path,country,device_category,session_source_medium,session_campaign_name,sessions,add_to_carts,begin_checkouts,purchases,purchase_revenue,synced_at',
      report_hour: `gte.${sinceIso}`,
      order: 'report_hour.desc',
      limit: '20000',
    }).catch((err) => ({ __error: err.message })),
    latestJsonUnder(path.join(repoRoot, 'artifacts/kryo-proof'), 'qc.json'),
  ]);

  const allTouchRows = (touches || []).filter((row) => row.ts <= untilIso);
  const realRows = allTouchRows.filter((row) => !row.is_internal);
  const productSessionIds = new Set(realRows.filter((row) => includesProductPath(row.page_path, args.productPath)).map(sessionKey));
  const productRows = realRows.filter((row) => productSessionIds.has(sessionKey(row)));
  const internalCheckoutRows = allTouchRows.filter((row) => row.is_internal && row.traffic_class === 'internal_qa' && eventName(row) === 'cart_checkout_click');

  const ga4ProductRows = Array.isArray(ga4Rows)
    ? ga4Rows.filter((row) => includesProductPath(row.page_path, args.productPath))
    : [];
  const ga4 = ga4ProductRows.reduce((acc, row) => {
    acc.sessions += Number(row.sessions || 0);
    acc.add_to_carts += Number(row.add_to_carts || 0);
    acc.begin_checkouts += Number(row.begin_checkouts || 0);
    acc.purchases += Number(row.purchases || 0);
    acc.purchase_revenue += Number(row.purchase_revenue || 0);
    if (!acc.latest_synced_at || String(row.synced_at || '') > acc.latest_synced_at) acc.latest_synced_at = row.synced_at || null;
    return acc;
  }, { sessions: 0, add_to_carts: 0, begin_checkouts: 0, purchases: 0, purchase_revenue: 0, latest_synced_at: null });

  const atcSessions = countSessions(productRows, ['add_to_cart']);
  const checkoutClickSessions = countSessions(productRows, ['cart_checkout_click']);
  const checkoutStartSessions = countSessions(productRows, ['checkout_start']);
  const purchaseSessions = countSessions(productRows, ['order_placed']);
  const cartAddRequests = countEvents(productRows, ['cart_add_request']);
  const cartAddFailed = countEvents(productRows, ['cart_add_failed']);
  const cartAddFailureRate = pct(cartAddFailed, cartAddRequests);
  const proof = proofRaw?.json ?? null;
  const checkoutVisible = Boolean((proof?.desktop?.checkout_controls_visible ?? 0) > 0 && (proof?.mobile?.checkout_controls_visible ?? 0) > 0);
  const endpointOk = Boolean(proof?.tracking_probe?.supabase_row_found || internalCheckoutRows.length > 0);
  const diagnosis = classify({ proof, endpointOk, checkoutVisible, atcSessions, checkoutClickSessions, checkoutStartSessions, ga4BeginCheckouts: ga4.begin_checkouts, cartAddFailureRate });

  const report = {
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, product_path: args.productPath, window_days: args.windowDays },
    diagnosis,
    measurement_checks: {
      browser_checkout_visible: checkoutVisible,
      internal_endpoint_persistence_ok: endpointOk,
      internal_checkout_probe_rows: internalCheckoutRows.length,
      latest_proof_path: proofRaw?.path ?? null,
      latest_proof_age_minutes: proofRaw ? Math.round((Date.now() - proofRaw.mtimeMs) / 60000) : null,
      proof_tracking_probe_found: Boolean(proof?.tracking_probe?.supabase_row_found),
    },
    first_party_real_user_funnel: {
      kryo_sessions: productSessionIds.size,
      add_to_cart_sessions: atcSessions,
      cart_checkout_click_sessions: checkoutClickSessions,
      checkout_start_sessions: checkoutStartSessions,
      purchase_sessions: purchaseSessions,
      atc_to_checkout_click_pct: pct(checkoutClickSessions, atcSessions),
      atc_to_checkout_start_pct: pct(checkoutStartSessions, atcSessions),
      checkout_start_to_purchase_pct: pct(purchaseSessions, checkoutStartSessions),
      cart_add_requests: cartAddRequests,
      cart_add_failed: cartAddFailed,
      cart_add_failure_rate_pct: cartAddFailureRate,
    },
    ga4_page_hourly: {
      source_status: Array.isArray(ga4Rows) ? 'ok' : 'error',
      error: ga4Rows?.__error ?? null,
      product_rows: ga4ProductRows.length,
      ...ga4,
      atc_to_begin_checkout_pct: pct(ga4.begin_checkouts, ga4.add_to_carts),
      begin_checkout_to_purchase_pct: pct(ga4.purchases, ga4.begin_checkouts),
    },
    recommended_next_step: diagnosis === 'checkout_click_event_missing_but_downstream_checkout_exists'
      ? 'Treat cart_checkout_click as instrumentation-missing; fix/verify event listener before optimizing cart UX.'
      : diagnosis === 'cart_abandonment_or_checkout_click_listener_missing'
        ? 'Run an internal browser proof with checkout click enabled or inspect listener binding before concluding true abandonment.'
        : diagnosis === 'tracking_endpoint_or_internal_probe_broken'
          ? 'Fix tracking endpoint/probe first; all cart abandonment metrics are untrusted.'
          : 'Keep monitoring; no storefront mutation from this report.',
  };

  const jsonPath = path.join(outDir, 'checkout-reconciliation.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const md = `# KRYO Checkout Reconciliation\n\nGenerated: ${report.generated_at}\nDiagnosis: ${diagnosis}\n\n## Measurement checks\n- Browser checkout visible: ${checkoutVisible ? 'PASS' : 'FAIL'}\n- Internal endpoint persistence: ${endpointOk ? 'PASS' : 'FAIL'}\n- Internal checkout probe rows: ${internalCheckoutRows.length}\n- Latest proof: ${proofRaw?.path ?? 'missing'}\n\n## First-party real-user funnel\n- KRYO sessions: ${productSessionIds.size}\n- Add-to-cart sessions: ${atcSessions}\n- Cart checkout-click sessions: ${checkoutClickSessions}\n- Checkout-start sessions: ${checkoutStartSessions}\n- Purchase sessions: ${purchaseSessions}\n- ATC→checkout click: ${report.first_party_real_user_funnel.atc_to_checkout_click_pct ?? 'n/a'}%\n- ATC→checkout start: ${report.first_party_real_user_funnel.atc_to_checkout_start_pct ?? 'n/a'}%\n- Cart add failure rate: ${cartAddFailureRate ?? 'n/a'}%\n\n## GA4 page-hourly cross-check\n- Source status: ${report.ga4_page_hourly.source_status}\n- Product rows: ${ga4ProductRows.length}\n- Sessions: ${ga4.sessions}\n- Add-to-carts: ${ga4.add_to_carts}\n- Begin checkouts: ${ga4.begin_checkouts}\n- Purchases: ${ga4.purchases}\n- ATC→begin checkout: ${report.ga4_page_hourly.atc_to_begin_checkout_pct ?? 'n/a'}%\n\n## Recommended next step\n${report.recommended_next_step}\n\n## Safety\n- Read-only plus internal QA evidence only.\n- Does not activate ads.\n- Does not mutate storefront.\n\nRaw JSON: ${jsonPath}\n`;
  const mdPath = path.join(outDir, 'checkout-reconciliation.md');
  await fs.writeFile(mdPath, md);
  console.log(JSON.stringify({ diagnosis, report: mdPath, json: jsonPath, first_party: report.first_party_real_user_funnel, ga4: report.ga4_page_hourly }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
