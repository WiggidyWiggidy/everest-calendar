#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    startDate: '2026-06-01',
    endDate: '2026-06-14',
    productPath: '/products/kryo2',
    outDir: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--start-date') args.startDate = argv[++i];
    else if (arg === '--end-date') args.endDate = argv[++i];
    else if (arg === '--product-path') args.productPath = argv[++i];
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-readiness-audit.mjs [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--product-path /products/kryo2] [--out DIR]');
      process.exit(0);
    }
  }
  return args;
}

async function loadLocalEnv() {
  const envPath = path.join(repoRoot, '.env.local');
  try {
    const raw = await fs.readFile(envPath, 'utf8');
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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

async function metaGet(edge, params = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return { skipped: true, reason: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID missing' };
  const cleanAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const url = new URL(`https://graph.facebook.com/v25.0/${edge.replace('{account}', cleanAccountId)}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set('access_token', token);
  const res = await fetchWithRetry(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json, status: res.status };
  return json;
}

function eventName(row) {
  if (row.event_type === 'product_added_to_cart') return 'add_to_cart';
  if (row.event_type === 'checkout_started') return 'checkout_start';
  if (row.event_type === 'product_viewed') return 'product_view';
  return row.event_type || '';
}

function sessionKey(row) {
  return row.session_id || row.anonymous_id || `${row.ts}:${row.event_type}`;
}

function pct(num, denom) {
  return denom > 0 ? Number(((num / denom) * 100).toFixed(1)) : null;
}

async function buildCartSummary(args) {
  const rows = await supabaseGet('attribution_touches', {
    select: 'ts,session_id,anonymous_id,event_type,page_path,is_internal,traffic_class,meta_ad_id',
    ts: `gte.${args.startDate}T00:00:00.000Z`,
    order: 'ts.asc',
    limit: '20000',
  });
  const filtered = (rows || []).filter((row) => !row.is_internal && row.ts <= `${args.endDate}T23:59:59.999Z`);
  const kryoSessions = new Set(filtered.filter((row) => (row.page_path || '').includes(args.productPath)).map(sessionKey));
  const sessionRows = filtered.filter((row) => kryoSessions.has(sessionKey(row)));
  const sessionsByEvent = (event) => new Set(sessionRows.filter((row) => eventName(row) === event).map(sessionKey)).size;
  const eventsByEvent = (event) => sessionRows.filter((row) => eventName(row) === event).length;
  const atc = sessionsByEvent('add_to_cart');
  const checkoutClick = sessionsByEvent('cart_checkout_click');
  const checkoutStart = sessionsByEvent('checkout_start');
  const purchases = sessionsByEvent('order_placed');
  const cartAddRequests = eventsByEvent('cart_add_request');
  const cartAddFailed = eventsByEvent('cart_add_failed');
  return {
    window: { start_date: args.startDate, end_date: args.endDate, product_path: args.productPath },
    rows_scanned: filtered.length,
    kryo_sessions: kryoSessions.size,
    paid_meta_events: sessionRows.filter((row) => row.traffic_class === 'paid_meta').length,
    funnel_sessions: {
      product_page_views: sessionsByEvent('page_view') + sessionsByEvent('product_view'),
      add_to_carts: atc,
      cart_views: sessionsByEvent('cart_view'),
      cart_checkout_clicks: checkoutClick,
      checkout_starts: checkoutStart,
      purchases,
      atc_no_checkout: Array.from(new Set(sessionRows.filter((row) => eventName(row) === 'add_to_cart').map(sessionKey))).filter((id) => !new Set(sessionRows.filter((row) => eventName(row) === 'checkout_start').map(sessionKey)).has(id)).length,
    },
    funnel_rates_pct: {
      atc_to_checkout_click: pct(checkoutClick, atc),
      atc_to_checkout_start: pct(checkoutStart, atc),
      checkout_start_to_purchase: pct(purchases, checkoutStart),
    },
    technical_events: {
      cart_add_requests: cartAddRequests,
      cart_add_failed: cartAddFailed,
      cart_add_failure_rate_pct: pct(cartAddFailed, cartAddRequests),
    },
  };
}

async function latestProofSummary() {
  const base = path.join(repoRoot, 'artifacts/kryo-proof');
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(base, entry.name));
    const withStats = await Promise.all(dirs.map(async (dir) => ({ dir, stat: await fs.stat(dir) })));
    withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (const item of withStats) {
      const qcPath = path.join(item.dir, 'qc.json');
      try {
        const qc = JSON.parse(await fs.readFile(qcPath, 'utf8'));
        return {
          dir: item.dir,
          generated_at: qc.generated_at,
          desktop_status: qc.desktop?.http_status ?? null,
          mobile_status: qc.mobile?.http_status ?? null,
          pixel_version: qc.desktop?.pixel_version ?? null,
          tracking_probe_found: Boolean(qc.tracking_probe?.supabase_row_found),
          proof_packet: path.join(item.dir, 'proof_packet.md'),
        };
      } catch {}
    }
  } catch {}
  return null;
}

function classifyReadiness({ account, guardrails, cart, proof }) {
  const blockers = [];
  const warnings = [];
  if (account && !account.skipped && !account.error && String(account.account_status) !== '1') {
    blockers.push(`Meta account not active: account_status=${account.account_status}, disable_reason=${account.disable_reason ?? 'n/a'}`);
  }
  if (account?.error) warnings.push(`Meta account read failed: ${JSON.stringify(account.error).slice(0, 200)}`);
  const openHighUrlTags = guardrails.filter((row) => row.status !== 'resolved' && row.alert_type === 'meta_url_tags_missing' && ['high', 'critical'].includes(row.severity));
  if (openHighUrlTags.length) blockers.push(`${openHighUrlTags.length} high URL-tag guardrail alert(s) open`);
  if (cart.funnel_sessions.add_to_carts >= 3 && cart.funnel_sessions.cart_checkout_clicks === 0) blockers.push('Checkout-click tracking is missing/zero for KRYO sessions');
  if ((cart.funnel_rates_pct.atc_to_checkout_start ?? 100) < 20 && cart.funnel_sessions.add_to_carts >= 5) warnings.push(`ATC→checkout below target: ${cart.funnel_rates_pct.atc_to_checkout_start}%`);
  if ((cart.technical_events.cart_add_failure_rate_pct ?? 0) >= 10) warnings.push(`Cart add failure rate above 10%: ${cart.technical_events.cart_add_failure_rate_pct}%`);
  if (!proof) warnings.push('No local proof packet found yet');
  else if (!proof.tracking_probe_found) warnings.push('Latest proof packet did not verify Supabase tracking row');
  const status = blockers.length ? 'blocked' : warnings.length ? 'caution' : 'ready';
  return { status, blockers, warnings };
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-readiness/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const [guardrails, account, campaigns, cart, proof] = await Promise.all([
    supabaseGet('marketing_guardrail_alerts', { select: 'id,alert_type,severity,entity_type,entity_id,status,evidence,first_seen_at,last_seen_at', status: 'neq.resolved', order: 'last_seen_at.desc', limit: '50' }).catch((err) => ({ error: err.message })),
    metaGet('{account}', { fields: 'account_status,disable_reason,currency,timezone_name,amount_spent,balance,spend_cap' }),
    metaGet('{account}/campaigns', { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget', limit: '100' }),
    buildCartSummary(args),
    latestProofSummary(),
  ]);

  const guardrailRows = Array.isArray(guardrails) ? guardrails : [];
  const kryoCampaigns = Array.isArray(campaigns?.data) ? campaigns.data.filter((row) => /kryo|dubai/i.test(row.name || '')) : [];
  const readiness = classifyReadiness({ account, guardrails: guardrailRows, cart, proof });
  const report = {
    generated_at: new Date().toISOString(),
    readiness,
    meta_account: account,
    kryo_campaigns: kryoCampaigns,
    open_guardrails: guardrailRows,
    cart_abandon: cart,
    latest_proof: proof,
  };

  const jsonPath = path.join(outDir, 'readiness.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const md = `# KRYO Marketing Readiness Audit\n\nGenerated: ${report.generated_at}\nStatus: ${readiness.status.toUpperCase()}\n\n## Blockers\n${readiness.blockers.length ? readiness.blockers.map((x) => `- ${x}`).join('\n') : '- None'}\n\n## Warnings\n${readiness.warnings.length ? readiness.warnings.map((x) => `- ${x}`).join('\n') : '- None'}\n\n## Key numbers\n- KRYO sessions: ${cart.kryo_sessions}\n- Paid Meta events: ${cart.paid_meta_events}\n- ATC sessions: ${cart.funnel_sessions.add_to_carts}\n- Checkout click sessions: ${cart.funnel_sessions.cart_checkout_clicks}\n- Checkout start sessions: ${cart.funnel_sessions.checkout_starts}\n- ATC→checkout start: ${cart.funnel_rates_pct.atc_to_checkout_start ?? 'n/a'}%\n- Cart add failure rate: ${cart.technical_events.cart_add_failure_rate_pct ?? 'n/a'}%\n- Open guardrails: ${guardrailRows.length}\n- Latest proof packet: ${proof?.proof_packet ?? 'none'}\n\nRaw JSON: ${jsonPath}\n`;
  const mdPath = path.join(outDir, 'readiness.md');
  await fs.writeFile(mdPath, md);
  console.log(JSON.stringify({ status: readiness.status, blockers: readiness.blockers, warnings: readiness.warnings, report: mdPath, json: jsonPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
