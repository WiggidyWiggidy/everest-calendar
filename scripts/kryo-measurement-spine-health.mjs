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
  const args = { outDir: '', failOnBlockers: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.outDir = argv[++i] || '';
    else if (argv[i] === '--fail-on-blockers') args.failOnBlockers = true;
    else if (argv[i] === '--help') {
      console.log('Usage: node scripts/kryo-measurement-spine-health.mjs [--out DIR] [--fail-on-blockers]');
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

function env() {
  return {
    base: (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function sanitizeError(value = '') {
  return String(value).replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]').replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]').slice(0, 1000);
}

async function curlJson(url, headers = {}) {
  const args = ['-sS', '--max-time', '25', '--retry', '3', '--retry-delay', '1', '--retry-all-errors'];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push(url);
  const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout || 'null');
}

async function tableProbe(table, select = 'id') {
  const { base, key } = env();
  const url = new URL(`${base}/rest/v1/${table}`);
  url.searchParams.set('select', select);
  url.searchParams.set('limit', '1');
  try {
    const rows = await curlJson(url.toString(), { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' });
    return { ok: Array.isArray(rows), rows: Array.isArray(rows) ? rows.length : null, error: null };
  } catch (err) {
    return { ok: false, rows: null, error: sanitizeError(err instanceof Error ? err.message : String(err)) };
  }
}

async function countRows(table, filters = []) {
  const { base, key } = env();
  const url = new URL(`${base}/rest/v1/${table}`);
  url.searchParams.set('select', 'id');
  for (const [k, v] of filters) url.searchParams.append(k, v);
  try {
    const rows = await curlJson(url.toString(), { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', Prefer: 'count=exact', Range: '0-0' });
    return { ok: Array.isArray(rows), sample_rows: Array.isArray(rows) ? rows.length : null, error: null };
  } catch (err) {
    return { ok: false, sample_rows: null, error: sanitizeError(err instanceof Error ? err.message : String(err)) };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await loadEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-measurement-spine/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const checks = [];
  const required = [
    ['kryo_growth_experiments', 'id,experiment_key,status,primary_metric'],
    ['kryo_leads', 'id,status,source,session_id,phone_e164,experiment_key'],
    ['kryo_deposit_events', 'id,event_type,lead_id,amount,currency'],
    ['vw_kryo_growth_spine_daily', 'date,experiment_key,leads,deposits_completed'],
  ];
  for (const [table, select] of required) {
    const probe = await tableProbe(table, select);
    checks.push({ id: table, label: table, status: probe.ok ? 'ok' : 'blocked', usable: probe.ok, blocker: probe.ok ? null : 'missing table/view or REST access blocked', evidence: probe });
  }

  const whatsappClicks = await countRows('attribution_touches', [['event_type', 'eq.whatsapp_click']]);
  checks.push({ id: 'whatsapp_click_events', label: 'WhatsApp click events', status: whatsappClicks.ok ? 'ok' : 'blocked', usable: whatsappClicks.ok, blocker: whatsappClicks.ok ? null : 'attribution_touches whatsapp_click probe failed', evidence: whatsappClicks });

  const migrationFile = path.join(repoRoot, 'supabase/migrations/20260725050000_kryo_measurement_spine.sql');
  const migrationExists = await fs.access(migrationFile).then(() => true).catch(() => false);
  checks.push({ id: 'migration_file', label: 'Measurement-spine migration file', status: migrationExists ? 'ok' : 'blocked', usable: migrationExists, blocker: migrationExists ? null : 'migration file missing', evidence: { path: migrationFile } });

  const blockers = checks.filter((c) => c.status === 'blocked');
  const report = {
    generated_at: new Date().toISOString(),
    status: blockers.length ? 'blocked' : 'ok',
    mutation_performed: false,
    checks,
    readiness: {
      can_track_whatsapp_leads: checks.find((c) => c.id === 'kryo_leads')?.usable || false,
      can_track_deposits: checks.find((c) => c.id === 'kryo_deposit_events')?.usable || false,
      can_roll_up_experiments: checks.find((c) => c.id === 'vw_kryo_growth_spine_daily')?.usable || false,
    },
    next_fix_if_blocked: 'Apply supabase/migrations/20260725050000_kryo_measurement_spine.sql through reviewed DB process, then rerun this command.',
  };

  const jsonPath = path.join(outDir, 'measurement-spine-health.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const latestDir = path.join(repoRoot, 'artifacts/kryo-measurement-spine/latest');
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(latestDir, 'measurement-spine-health.json'), JSON.stringify(report, null, 2));

  const lines = ['# KRYO Measurement Spine Health', '', `Generated: ${report.generated_at}`, `Status: ${report.status.toUpperCase()}`, 'Mutation performed: no', ''];
  for (const c of checks) lines.push(`- ${c.status.toUpperCase()} ${c.label}: usable=${c.usable ? 'yes' : 'no'}${c.blocker ? `, blocker=${c.blocker}` : ''}`);
  lines.push('', '## Readiness');
  for (const [k, v] of Object.entries(report.readiness)) lines.push(`- ${k}: ${v ? 'yes' : 'no'}`);
  lines.push('', `Raw JSON: ${jsonPath}`);
  const mdPath = path.join(outDir, 'measurement-spine-health.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(latestDir, 'measurement-spine-health.md'), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ status: report.status, blockers: blockers.length, report: mdPath, json: jsonPath, mutation_performed: false }, null, 2));
  if (args.failOnBlockers && blockers.length) process.exit(2);
}

main().catch((err) => { console.error(sanitizeError(err instanceof Error ? err.stack || err.message : String(err))); process.exit(1); });
