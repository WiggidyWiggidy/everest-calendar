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
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { outDir: '', network: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--no-network') args.network = false;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-tool-health.mjs [--out DIR] [--no-network]');
      process.exit(0);
    }
  }
  return args;
}

async function loadEnvFile(envPath) {
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

async function loadLocalEnv() {
  await loadEnvFile(path.join(os.homedir(), '.zshenv'));
  await loadEnvFile(path.join(repoRoot, '.env.local'));
}

function present(name) {
  const value = process.env[name];
  return Boolean(value && value !== 'TODO' && !/^TODO_/i.test(value));
}

function add(checks, area, name, status, evidence, action = null) {
  checks.push({ area, name, status, evidence, action });
}

function configServer(config, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[mcp_servers\\.${escaped}(?:\\.[^\\]]+)?\\]([\\s\\S]*?)(?=\\n\\[|$)`, 'g');
  const blocks = [];
  for (const match of config.matchAll(re)) blocks.push(match[0]);
  return blocks.length ? blocks.join('\n') : null;
}

function serverDisabled(block) {
  if (!block) return false;
  return /disabled\s*=\s*true/i.test(block);
}

function serverHasTodo(block) {
  if (!block) return false;
  return /TODO_|TODO_GENERATE|<.*>/i.test(block);
}

async function fetchText(url, options = {}, timeoutMs = 10000, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const text = await res.text();
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
        continue;
      }
      return { ok: res.ok, status: res.status, text };
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
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

async function supabaseProbe() {
  const base = (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { ok: false, status: null, detail: 'Supabase URL/key missing' };
  const url = new URL(`${base}/rest/v1/marketing_guardrail_alerts`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('limit', '1');
  const res = await fetchText(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return { ok: res.ok, status: res.status, detail: res.ok ? 'REST read works' : res.text.slice(0, 200) };
}

async function metaProbe() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return { ok: false, status: null, detail: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID missing' };
  const cleanAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const url = new URL(`https://graph.facebook.com/v25.0/${cleanAccountId}`);
  url.searchParams.set('fields', 'account_status,disable_reason,currency,timezone_name');
  url.searchParams.set('access_token', token);
  const res = await fetchText(url);
  let detail = res.text.slice(0, 300);
  try {
    const json = JSON.parse(res.text);
    detail = `account_status=${json.account_status ?? 'n/a'}, disable_reason=${json.disable_reason ?? 'n/a'}, currency=${json.currency ?? 'n/a'}`;
  } catch {}
  return { ok: res.ok, status: res.status, detail };
}

async function shopifyThemeProbe() {
  if (!present('MARKETING_SYNC_SECRET')) return { ok: false, status: null, detail: 'MARKETING_SYNC_SECRET missing' };
  let res;
  try {
    res = await fetchText(`${PROD}/api/marketing/theme/info`, { headers: { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET } });
  } catch {
    res = await curlText(`${PROD}/api/marketing/theme/info`, { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET }, 25);
  }
  let detail = res.text.slice(0, 300);
  try {
    const json = JSON.parse(res.text);
    detail = json.success ? `live_theme=${json.live_theme?.name ?? 'n/a'}, asset_endpoint=${json.asset_endpoint_status ?? 'n/a'}` : (json.error || detail);
  } catch {}
  return { ok: res.ok, status: res.status, detail };
}

async function chromeProbe() {
  try {
    const res = await fetchText('http://127.0.0.1:9222/json/version', {}, 2500);
    return { ok: res.ok, status: res.status, detail: res.ok ? 'remote debugging endpoint responds' : res.text.slice(0, 200) };
  } catch (err) {
    return { ok: false, status: null, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-tool-health/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });
  const checks = [];

  const envGroups = [
    ['Supabase REST', ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']],
    ['Marketing API auth', ['MARKETING_SYNC_SECRET']],
    ['Deprecated direct Meta reads', ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID']],
    ['Pipeboard canonical connectors', ['PIPEBOARD_API_TOKEN']],
    ['Shopify local dev env', ['SHOPIFY_STORE_URL', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET']],
    ['GA4', ['GA_PROPERTY_ID', 'GA_SERVICE_ACCOUNT_JSON']],
    ['Search Console', ['GSC_SITE_URL', 'GA_SERVICE_ACCOUNT_JSON']],
    ['Clarity', ['CLARITY_API_TOKEN', 'CLARITY_PROJECT_ID']],
  ];
  for (const [name, vars] of envGroups) {
    const missing = vars.filter((key) => !present(key));
    add(checks, 'credentials', name, missing.length ? 'warning' : 'ok', missing.length ? `Missing: ${missing.join(', ')}` : `Present: ${vars.join(', ')}`, missing.length ? 'Add missing local env before depending on direct local reads; production marketing routes may still be healthy.' : null);
  }

  let config = '';
  try { config = await fs.readFile(path.join(os.homedir(), '.codex/config.toml'), 'utf8'); } catch {}
  const servers = [
    ['meta-ads', 'Pipeboard Meta Ads MCP', 'Use for typed Meta reads/mutations; writes still require Tom approval.'],
    ['google-analytics', 'Pipeboard Google Analytics MCP', 'Canonical GA4 read path.'],
    ['analytics-mcp', 'GA4/Search Console analytics MCP', 'Use for GA4 funnel/revenue cross-checks.'],
    ['supabase', 'Supabase MCP', 'Replace curl reads after SUPABASE_ACCESS_TOKEN is set.'],
    ['shopify-dev-mcp', 'Shopify Dev MCP', 'Use for schema/docs/dev inspection, not live storefront mutation.'],
    ['chrome-devtools', 'Chrome DevTools MCP', 'Use for browser-side debugging when Chrome remote debugging is running.'],
    ['n8n-mcp', 'n8n MCP', 'Optional future workflow runner; not required for current free local system.'],
  ];
  for (const [id, label, actionText] of servers) {
    const block = configServer(config, id);
    if (!block) add(checks, 'mcp_config', label, 'warning', 'Not configured in ~/.codex/config.toml', `Configure ${id} only if this becomes part of the operating loop.`);
    else if (serverDisabled(block)) add(checks, 'mcp_config', label, 'warning', 'Configured but disabled', `Enable ${id} when needed.`);
    else if (serverHasTodo(block)) add(checks, 'mcp_config', label, 'warning', 'Configured but has TODO placeholder', `Finish credentials. ${actionText}`);
    else add(checks, 'mcp_config', label, 'ok', 'Configured', actionText);
  }

  let networkSkipped = false;
  if (!args.network) networkSkipped = true;
  if (args.network) {
    const probes = [
      ['live_api', 'Supabase REST read', supabaseProbe],
      ['live_api', 'Deprecated direct Meta account read', metaProbe],
      ['live_api', 'Shopify live theme read via marketing API', shopifyThemeProbe],
      ['local_tool', 'Chrome remote debugging endpoint', chromeProbe],
    ];
    for (const [area, name, fn] of probes) {
      try {
        const result = await fn();
        const status = result.ok ? 'ok' : (name.includes('Chrome') || name.includes('Deprecated direct Meta') ? 'warning' : 'blocker');
        const action = result.ok ? null : name.includes('Deprecated direct Meta') ? 'No action required for normal KRYO ops; Pipeboard Meta is canonical. Fix only if you intentionally revive direct Graph reads.' : 'Fix this before relying on automated QC for this source.';
        add(checks, area, name, status, `HTTP ${result.status ?? 'n/a'} — ${result.detail}`, action);
      } catch (err) {
        const status = name.includes('Deprecated direct Meta') ? 'warning' : 'blocker';
        const action = name.includes('Deprecated direct Meta') ? 'No action required for normal KRYO ops; Pipeboard Meta is canonical.' : 'Fix this before relying on automated QC for this source.';
        add(checks, area, name, status, err instanceof Error ? err.message : String(err), action);
      }
    }
  }

  const blockers = checks.filter((check) => check.status === 'blocker');
  const warnings = checks.filter((check) => check.status === 'warning');
  const report = {
    generated_at: new Date().toISOString(),
    network_skipped: networkSkipped,
    summary: { checks: checks.length, ok: checks.filter((x) => x.status === 'ok').length, warnings: warnings.length, blockers: blockers.length },
    checks,
    next_actions: checks.filter((check) => check.action).map((check) => ({ area: check.area, name: check.name, status: check.status, action: check.action })),
  };
  const jsonPath = path.join(outDir, 'tool-health.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const byArea = [...new Set(checks.map((check) => check.area))];
  const md = `# KRYO Tool Health\n\nGenerated: ${report.generated_at}\nStatus: ${blockers.length ? 'BLOCKED' : warnings.length ? 'CAUTION' : 'OK'}\n\n## Summary\n- Checks: ${report.summary.checks}\n- OK: ${report.summary.ok}\n- Warnings: ${report.summary.warnings}\n- Blockers: ${report.summary.blockers}\n- Network checks skipped: ${networkSkipped ? 'yes' : 'no'}\n\n${byArea.map((area) => `## ${area}\n${checks.filter((check) => check.area === area).map((check) => `- ${check.status.toUpperCase()} — ${check.name}: ${check.evidence}${check.action ? `\n  - Action: ${check.action}` : ''}`).join('\n')}`).join('\n\n')}\n\nRaw JSON: ${jsonPath}\n`;
  const mdPath = path.join(outDir, 'tool-health.md');
  await fs.writeFile(mdPath, md);
  console.log(JSON.stringify({ status: blockers.length ? 'blocked' : warnings.length ? 'caution' : 'ok', summary: report.summary, report: mdPath, json: jsonPath }, null, 2));
  if (blockers.length) process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
