#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    mode: 'all',
    handle: 'kryo2_',
    text: '',
    textFile: '',
    outDir: '',
    skipProofGate: false,
    soft: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--handle') args.handle = argv[++i];
    else if (arg === '--text') args.text = argv[++i];
    else if (arg === '--text-file') args.textFile = argv[++i];
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--skip-proof-gate') args.skipProofGate = true;
    else if (arg === '--soft') args.soft = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-preflight.mjs [--mode all|marketing|website] [--handle kryo2_] [--text TEXT|--text-file FILE] [--skip-proof-gate] [--soft] [--out DIR]');
      process.exit(0);
    }
  }
  if (!['all', 'marketing', 'website'].includes(args.mode)) throw new Error(`Invalid --mode ${args.mode}`);
  return args;
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}` } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('close', (code) => resolve({ command: [command, ...args].join(' '), code, stdout, stderr }));
  });
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
}

function hasBlockedSource(health, ids) {
  return (health.sources || []).some((s) => ids.includes(s.id) && !s.usable_for_recommendations);
}

function metricUsable(health, key) {
  return Boolean(health.metric_policy?.[key]?.usable);
}

function sourceById(health, id) {
  return (health.sources || []).find((s) => s.id === id) || null;
}

function summarizeStep(step) {
  let parsed = null;
  try { parsed = JSON.parse(step.stdout.slice(step.stdout.indexOf('{'))); } catch {}
  return { name: step.name, command: step.command, exit_code: step.code, parsed, stderr: step.stderr.trim().slice(0, 1000) || null };
}

async function main() {
  const args = parseArgs(process.argv);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-preflight/${stamp}-${args.mode}`);
  await fs.mkdir(outDir, { recursive: true });
  const steps = [];
  const blockers = [];
  const warnings = [];

  async function runStep(name, command, stepArgs) {
    const result = await run(command, stepArgs);
    result.name = name;
    steps.push(result);
    return result;
  }

  await runStep('source_health', 'node', ['scripts/kryo-source-health.mjs']);
  const sourceHealth = await readJson('artifacts/kryo-source-health/latest/source-health.json');

  await runStep('quarantine_inventory', 'node', ['scripts/kryo-quarantine-check.mjs']);
  const quarantine = await readJson('artifacts/kryo-quarantine-check/latest/quarantine-check.json');

  if (!args.skipProofGate) {
    await runStep('proof_gate_observe', 'node', ['scripts/kryo-proof-gate.mjs', '--mode', 'observe']);
  }

  let shopifyReadiness = null;
  if (args.mode === 'all' || args.mode === 'website') {
    await runStep('shopify_readiness', 'node', ['scripts/kryo-shopify-readiness.mjs', '--handle', args.handle]);
    shopifyReadiness = await readJson('artifacts/kryo-shopify-readiness/latest/shopify-readiness.json');
  }

  let recommendationGate = null;
  if (args.mode === 'all' || args.mode === 'marketing') {
    const recArgs = ['scripts/kryo-recommendation-gate.mjs', '--strict'];
    if (args.text) recArgs.push('--text', args.text);
    if (args.textFile) recArgs.push('--text-file', args.textFile);
    await runStep('recommendation_gate', 'node', recArgs);
    recommendationGate = await readJson('artifacts/kryo-recommendation-gate/latest/recommendation-gate.json');
  }

  if (!metricUsable(sourceHealth, 'paid_atc_purchase_verdicts')) blockers.push({ code: 'paid_meta_claims_blocked', message: 'Current paid-ad CPA/ROAS/winner/scale claims are blocked until fresh Meta delivery data exists. Historical paid data may still be shown if clearly labelled.' });
  if (hasBlockedSource(sourceHealth, ['ga4'])) warnings.push({ code: 'ga4_blocked', message: `GA4 is not usable for fresh recommendations: ${sourceById(sourceHealth, 'ga4')?.blocker || 'source not fresh'}.` });
  if (hasBlockedSource(sourceHealth, ['gsc'])) warnings.push({ code: 'gsc_blocked', message: `Google Search Console is not usable: ${sourceById(sourceHealth, 'gsc')?.blocker || 'source not fresh'}.` });
  if (args.mode === 'all' || args.mode === 'website') {
    const readinessBlockers = shopifyReadiness?.findings?.filter((f) => f.severity === 'blocker') || [];
    for (const b of readinessBlockers) blockers.push({ code: `shopify_${b.code}`, message: b.message });
  }
  if (recommendationGate?.status === 'blocked') blockers.push({ code: 'recommendation_text_blocked', message: 'Recommendation text contains current sensitive claims while sources are stale.' });

  const proofStep = steps.find((s) => s.name === 'proof_gate_observe');
  if (proofStep && proofStep.code !== 0) warnings.push({ code: 'proof_gate_nonzero', message: 'Observe proof gate returned nonzero; inspect proof-gate artifact.' });

  const status = blockers.length ? 'blocked' : warnings.length ? 'pass_with_warnings' : 'pass';
  const report = {
    generated_at: new Date().toISOString(),
    status,
    mode: args.mode,
    handle: args.handle,
    mutation_performed: false,
    blockers,
    warnings,
    artifacts: {
      source_health: path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.md'),
      quarantine_check: path.join(repoRoot, 'artifacts/kryo-quarantine-check/latest/quarantine-check.md'),
      shopify_readiness: shopifyReadiness ? path.join(repoRoot, 'artifacts/kryo-shopify-readiness/latest/shopify-readiness.md') : null,
      recommendation_gate: recommendationGate ? path.join(repoRoot, 'artifacts/kryo-recommendation-gate/latest/recommendation-gate.json') : null,
    },
    steps: steps.map(summarizeStep),
    rules: [
      'No live Shopify/theme/product/ad mutation happened in preflight.',
      'Do not use quarantined routes/tasks/connectors without explicit approval.',
      'Do not make current paid-ad recommendations while Meta direct and Pipeboard Meta are blocked.',
      'Do not start website implementation while Shopify readiness has blockers.',
    ],
  };

  const jsonPath = path.join(outDir, 'preflight.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const latestDir = path.join(repoRoot, 'artifacts/kryo-preflight/latest');
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(latestDir, 'preflight.json'), JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# KRYO Operator Preflight');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Handle: ${report.handle}`);
  lines.push(`Status: ${report.status.toUpperCase()}`);
  lines.push(`Mutation performed: ${report.mutation_performed ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Blockers');
  if (!blockers.length) lines.push('- None');
  for (const b of blockers) lines.push(`- ${b.code}: ${b.message}`);
  lines.push('');
  lines.push('## Warnings');
  if (!warnings.length) lines.push('- None');
  for (const w of warnings) lines.push(`- ${w.code}: ${w.message}`);
  lines.push('');
  lines.push('## Artifacts');
  for (const [k, v] of Object.entries(report.artifacts)) if (v) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push(`Raw JSON: ${jsonPath}`);
  const mdPath = path.join(outDir, 'preflight.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(latestDir, 'preflight.md'), `${lines.join('\n')}\n`);

  console.log(JSON.stringify({ status, blockers: blockers.length, warnings: warnings.length, mutation_performed: false, report: mdPath, json: jsonPath }, null, 2));
  if (!args.soft && blockers.length) process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
