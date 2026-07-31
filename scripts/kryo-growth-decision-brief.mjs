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

function parseArgs(argv) {
  const args = { windowDays: 45, outDir: '', refreshHealth: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--window-days') args.windowDays = Math.min(Math.max(Number(argv[++i] || 45), 7), 90);
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--refresh-health') args.refreshHealth = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-growth-decision-brief.mjs [--window-days 45] [--refresh-health] [--out DIR]');
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

async function curlJson(url, headers = {}, timeoutSeconds = 25) {
  const args = ['-sS', '--max-time', String(timeoutSeconds), '--retry', '3', '--retry-delay', '1', '--retry-all-errors'];
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
  args.push(url);
  const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function sb(table, params) {
  const { base, key } = supabaseEnv();
  if (!base || !key) throw new Error('Supabase URL/key missing');
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [k, v] of params) url.searchParams.append(k, v);
  return curlJson(url.toString(), { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' });
}

async function sbAll(table, params, pageSize = 1000, maxPages = 50) {
  const { base, key } = supabaseEnv();
  if (!base || !key) throw new Error('Supabase URL/key missing');
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [k, v] of params) url.searchParams.append(k, v);
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const chunk = await curlJson(url.toString(), {
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

function isoDateDaysAgoFrom(baseDate, days) {
  const d = new Date(baseDate.getTime() - (days - 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

function pct(n, d) { return d ? Number(((n / d) * 100).toFixed(1)) : null; }
function n(v) { return Number(v || 0); }

async function readJsonIfExists(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function run(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await loadEnv();
  if (args.refreshHealth) await run('node', ['scripts/kryo-source-health.mjs']);

  const end = new Date(Date.now() - 86400000);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = isoDateDaysAgoFrom(end, args.windowDays);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-growth-decision-brief/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const sourceHealth = await readJsonIfExists(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json'));
  const preflight = await readJsonIfExists(path.join(repoRoot, 'artifacts/kryo-preflight/latest/preflight.json'));
  const ledgerRaw = await fs.readFile(path.join(repoRoot, 'marketing/experiments/experiment-ledger.csv'), 'utf8').catch(() => '');
  const ledgerRows = ledgerRaw.trim().split(/\r?\n/).slice(1).filter(Boolean);

  const [touches, shopify, clarity, inbox, experimentsResult] = await Promise.all([
    sbAll('attribution_touches', [
      ['select', 'ts,session_id,anonymous_id,event_type,page_path,channel,device_type,ip_country,is_internal'],
      ['ts', `gte.${startDate}T00:00:00+00:00`],
      ['ts', `lte.${endDate}T23:59:59+00:00`],
      ['order', 'ts.asc'],
    ], 1000, 40).catch((err) => ({ __error: String(err.message || err) })),
    sbAll('shopify_funnel_daily', [
      ['select', 'date,checkouts_started,checkouts_completed,checkouts_abandoned,abandoned_value'],
      ['date', `gte.${startDate}`],
      ['date', `lte.${endDate}`],
      ['order', 'date.asc'],
    ], 1000, 2).catch((err) => ({ __error: String(err.message || err) })),
    sbAll('clarity_friction_elements', [
      ['select', 'date,page_url,total_sessions,dead_click_count,rage_click_count,quick_back_count,script_error_count,avg_scroll_depth_pct,avg_engagement_time_sec'],
      ['date', `gte.${startDate}`],
      ['date', `lte.${endDate}`],
      ['page_url', 'ilike.*kryo*'],
      ['order', 'date.asc'],
    ], 1000, 10).catch((err) => ({ __error: String(err.message || err) })),
    sb('platform_inbox', [
      ['select', 'id,platform,status,category,ai_summary,ai_recommendation,metadata,created_at'],
      ['status', 'eq.pending'],
      ['order', 'created_at.desc'],
      ['limit', '50'],
    ]).catch((err) => ({ __error: String(err.message || err) })),
    sb('marketing_experiments', [
      ['select', 'id,name,status,target_metric,hypothesis,created_at,experiment_scope'],
      ['status', 'in.(approved,running,draft)'],
      ['order', 'created_at.desc'],
      ['limit', '10'],
    ]).catch((err) => ({ __error: String(err.message || err) })),
  ]);

  const allTouchRows = Array.isArray(touches) ? touches.filter((r) => !r.is_internal) : [];
  const kryoSessionIds = new Set(
    allTouchRows
      .filter((r) => String(r.page_path || '').includes('kryo'))
      .map((r) => r.session_id || r.anonymous_id)
      .filter(Boolean)
  );
  const touchRows = allTouchRows.filter((r) => kryoSessionIds.has(r.session_id || r.anonymous_id));
  const sessionIds = new Set(touchRows.map((r) => r.session_id || r.anonymous_id).filter(Boolean));
  const countSessions = (...events) => new Set(touchRows.filter((r) => events.includes(r.event_type)).map((r) => r.session_id || r.anonymous_id).filter(Boolean)).size;
  const cartViews = countSessions('cart_view');
  const checkoutClicks = countSessions('cart_checkout_click');
  const whatsAppClicks = countSessions('whatsapp_click');
  const chatClicks = countSessions('chatway_click') + countSessions('shopify_inbox_click');
  const heroClicks = countSessions('hero_cta_click');
  const addToCarts = countSessions('add_to_cart', 'product_added_to_cart');
  const cartExit = countSessions('cart_exit_without_checkout');

  const shopRows = Array.isArray(shopify) ? shopify : [];
  const shop = shopRows.reduce((acc, r) => {
    acc.checkouts_started += n(r.checkouts_started);
    acc.completed += n(r.checkouts_completed);
    acc.abandoned += n(r.checkouts_abandoned);
    acc.abandoned_value += n(r.abandoned_value);
    return acc;
  }, { checkouts_started: 0, completed: 0, abandoned: 0, abandoned_value: 0 });

  const clarityRows = Array.isArray(clarity) ? clarity : [];
  const clarityTotals = clarityRows.reduce((acc, r) => {
    acc.sessions += n(r.total_sessions);
    acc.dead_clicks += n(r.dead_click_count);
    acc.rage_clicks += n(r.rage_click_count);
    acc.quick_backs += n(r.quick_back_count);
    acc.script_errors += n(r.script_error_count);
    return acc;
  }, { sessions: 0, dead_clicks: 0, rage_clicks: 0, quick_backs: 0, script_errors: 0 });

  const sourceSummary = Object.fromEntries((sourceHealth?.sources || []).map((s) => [s.id, { status: s.status, usable: s.usable_for_recommendations, max: s.max_timestamp, blocker: s.blocker }]));
  const paidUsable = Boolean(sourceHealth?.metric_policy?.paid_atc_purchase_verdicts?.usable);
  const onsiteUsable = Boolean(sourceHealth?.metric_policy?.onsite_intent?.usable);
  const shopifyUsable = Boolean(sourceHealth?.metric_policy?.shopify_orders_revenue?.usable);

  let primaryConstraint = 'measurement_spine_incomplete';
  let constraintReason = 'Qualified WhatsApp leads and deposits are not yet joined to ad, angle, landing-page and experiment identifiers.';
  if (paidUsable && cartViews >= 10 && checkoutClicks / Math.max(cartViews, 1) < 0.2) {
    primaryConstraint = 'cart_to_checkout_trust_gap';
    constraintReason = `Only ${checkoutClicks}/${cartViews} cart-view sessions clicked checkout in the window.`;
  } else if (!paidUsable) {
    primaryConstraint = 'no_current_paid_delivery_verdicts';
    constraintReason = sourceSummary.pipeboard_meta?.blocker || 'Paid Meta source not usable for current verdicts.';
  }

  const experiments = Array.isArray(experimentsResult) ? experimentsResult : [];
  const activeExperiment = experiments.find((row) => row.status === 'running' || row.status === 'approved') || null;
  const csvActiveExperiment = ledgerRows.find((row) => /,running,|,approved,/.test(row)) || null;
  const pendingApprovals = Array.isArray(inbox) ? inbox.filter((r) => ['ad_clone', 'lp_clone', 'angle_launch'].includes(r.category || r.metadata?.category)).length : 0;

  const recommendedAction = !paidUsable
    ? 'Do not make current paid-ad winner/scale claims. Finish measurement spine and restore fresh paid delivery before scaling.'
    : 'Create or approve one experiment targeting the largest observed funnel drop-off, with one variable and one primary metric.';

  const report = {
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, days: args.windowDays, complete_days_only: true },
    founder_interface: {
      current_primary_commercial_constraint: primaryConstraint,
      constraint_reason: constraintReason,
      active_experiment: activeExperiment
        ? { source: 'marketing_experiments', id: activeExperiment.id, name: activeExperiment.name, status: activeExperiment.status, primary_metric: activeExperiment.target_metric || null }
        : csvActiveExperiment
          ? { source: 'csv_ledger', status: 'present' }
          : null,
      data_reliability: {
        paid_meta_current_verdicts_usable: paidUsable,
        onsite_intent_usable: onsiteUsable,
        shopify_orders_revenue_usable: shopifyUsable,
        source_summary: sourceSummary,
      },
      single_highest_leverage_recommended_action: recommendedAction,
      approvals_awaiting_founder: pendingApprovals,
    },
    observed_window_metrics: {
      kryo_tracked_sessions: sessionIds.size,
      hero_cta_sessions: heroClicks,
      add_to_cart_sessions: addToCarts,
      cart_view_sessions: cartViews,
      checkout_click_sessions: checkoutClicks,
      cart_exit_without_checkout_sessions: cartExit,
      whatsapp_click_sessions: whatsAppClicks,
      chat_click_sessions: chatClicks,
      cart_to_checkout_click_rate_pct: pct(checkoutClicks, cartViews),
      shopify_checkouts_started: shop.checkouts_started,
      shopify_checkouts_completed: shop.completed,
      shopify_checkouts_abandoned: shop.abandoned,
      shopify_checkout_completion_rate_pct: pct(shop.completed, shop.checkouts_started),
      clarity_sessions: clarityTotals.sessions,
      clarity_dead_clicks: clarityTotals.dead_clicks,
      clarity_quick_backs: clarityTotals.quick_backs,
      clarity_script_errors: clarityTotals.script_errors,
    },
    limitations: [
      'This is a deterministic operating brief, not a statistical experiment verdict.',
      'WhatsApp clicks are not qualified leads until kryo_leads is populated.',
      'Deposits are not tracked until kryo_deposit_events is populated.',
      'Current paid-ad CPA/ROAS/winner claims remain blocked when source-health says paid_atc_purchase_verdicts unusable.',
    ],
    artifacts: {
      source_health: path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.md'),
      preflight: preflight ? path.join(repoRoot, 'artifacts/kryo-preflight/latest/preflight.md') : null,
      experiment_ledger: path.join(repoRoot, 'marketing/experiments/experiment-ledger.csv'),
    },
    mutation_performed: false,
  };

  const jsonPath = path.join(outDir, 'growth-decision-brief.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const latestDir = path.join(repoRoot, 'artifacts/kryo-growth-decision-brief/latest');
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(latestDir, 'growth-decision-brief.json'), JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# KRYO Growth Decision Brief');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Window: ${startDate} to ${endDate} (${args.windowDays} complete days)`);
  lines.push(`Mutation performed: no`);
  lines.push('');
  lines.push('## Founder interface');
  lines.push(`- Primary commercial constraint: ${report.founder_interface.current_primary_commercial_constraint}`);
  lines.push(`- Why: ${report.founder_interface.constraint_reason}`);
  lines.push(`- Active experiment: ${report.founder_interface.active_experiment ? JSON.stringify(report.founder_interface.active_experiment) : 'none'}`);
  lines.push(`- Data reliable for current paid verdicts: ${paidUsable ? 'yes' : 'no'}`);
  lines.push(`- Single recommended action: ${report.founder_interface.single_highest_leverage_recommended_action}`);
  lines.push(`- Approval items waiting: ${pendingApprovals}`);
  lines.push('');
  lines.push('## Window metrics');
  for (const [key, value] of Object.entries(report.observed_window_metrics)) lines.push(`- ${key}: ${value ?? 'n/a'}`);
  lines.push('');
  lines.push('## Limitations');
  for (const item of report.limitations) lines.push(`- ${item}`);
  lines.push('');
  lines.push(`Raw JSON: ${jsonPath}`);
  const mdPath = path.join(outDir, 'growth-decision-brief.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(latestDir, 'growth-decision-brief.md'), `${lines.join('\n')}\n`);

  console.log(JSON.stringify({ status: 'ok', report: mdPath, json: jsonPath, mutation_performed: false }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
