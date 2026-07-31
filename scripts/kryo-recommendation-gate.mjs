#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { text: '', textFile: '', sourceHealth: '', refresh: false, strict: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--text') args.text = argv[++i];
    else if (arg === '--text-file') args.textFile = argv[++i];
    else if (arg === '--source-health') args.sourceHealth = argv[++i];
    else if (arg === '--refresh') args.refresh = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-recommendation-gate.mjs [--text TEXT | --text-file FILE] [--source-health JSON] [--refresh] [--strict]');
      process.exit(0);
    }
  }
  return args;
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function ensureSourceHealth(args) {
  if (args.refresh) await run('node', ['scripts/kryo-source-health.mjs']);
  const candidates = [args.sourceHealth, 'artifacts/kryo-source-health/latest/source-health.json'].filter(Boolean);
  for (const c of candidates) {
    try { return { path: path.resolve(repoRoot, c), json: JSON.parse(await fs.readFile(path.resolve(repoRoot, c), 'utf8')) }; }
    catch {}
  }
  await run('node', ['scripts/kryo-source-health.mjs']);
  return { path: path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json'), json: JSON.parse(await fs.readFile(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json'), 'utf8')) };
}

function sourceUsable(health, id) {
  return Boolean((health.sources || []).find((s) => s.id === id)?.usable_for_recommendations);
}

function mentionsCurrentClaim(text) {
  const lower = text.toLowerCase();
  const sensitive = ['cpa', 'roas', 'conversion rate', 'winner', 'winning ad', 'best ad', 'scale', 'scaling', 'cost per purchase', 'purchase rate'];
  const historicalMarkers = ['historical', 'cached through', 'not current', 'stale', 'through 2026-07-08', 'as historical context'];
  return {
    sensitive_hits: sensitive.filter((term) => lower.includes(term)),
    clearly_historical: historicalMarkers.some((term) => lower.includes(term)),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  let text = args.text;
  if (args.textFile) text = await fs.readFile(path.resolve(repoRoot, args.textFile), 'utf8');
  const health = await ensureSourceHealth(args);
  const checks = [];
  const metaUsable = sourceUsable(health.json, 'meta_direct') || sourceUsable(health.json, 'pipeboard_meta');
  const funnelUsable = sourceUsable(health.json, 'shopify_funnel') && sourceUsable(health.json, 'attribution_touches');
  const claim = mentionsCurrentClaim(text || '');

  if (!metaUsable) {
    const historicalSafeText = Boolean(text && claim.clearly_historical);
    checks.push({
      severity: historicalSafeText ? 'warning' : 'blocker',
      code: 'meta_not_fresh',
      message: historicalSafeText
        ? 'Paid Meta source is not fresh, but the checked text is clearly historical/cached.'
        : 'Current paid-ad claims requiring CPA/ROAS/winner/scale are blocked until Pipeboard Meta has fresh delivery rows. Historical paid data may still be used if labelled.',
    });
  }
  if (!funnelUsable) checks.push({ severity: 'warning', code: 'funnel_not_fully_fresh', message: 'Funnel claims must be labelled with source freshness unless Shopify funnel and attribution touches are fresh.' });

  let blocked = false;
  if (text) {
    if (claim.sensitive_hits.length && !claim.clearly_historical && !metaUsable) blocked = true;
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_health_path: health.path,
    text_checked: Boolean(text),
    sensitive_hits: claim.sensitive_hits,
    clearly_historical: claim.clearly_historical,
    status: blocked ? 'blocked' : checks.some((c) => c.severity === 'blocker') ? 'source_blocked_no_text_checked' : checks.some((c) => c.severity === 'warning') ? 'pass_with_warnings' : 'pass',
    checks,
    rule: 'Do not make current CPA/ROAS/conversion/winner/scale claims unless the required source is fresh. Historical sections must be labelled as stale/cached.',
  };
  const outDir = path.join(repoRoot, 'artifacts/kryo-recommendation-gate/latest');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'recommendation-gate.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (blocked || (args.strict && checks.some((c) => c.severity === 'blocker'))) process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
