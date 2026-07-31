#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { outDir: '', withProof: false, skipTsc: false, skipLint: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--with-proof') args.withProof = true;
    else if (arg === '--skip-tsc') args.skipTsc = true;
    else if (arg === '--skip-lint') args.skipLint = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-system-qc.mjs [--out DIR] [--with-proof] [--skip-tsc] [--skip-lint]');
      process.exit(0);
    }
  }
  return args;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ command: [command, ...args].join(' '), code, started_at: startedAt, finished_at: new Date().toISOString(), stdout, stderr }));
  });
}

async function writeCommand(outDir, index, result) {
  const safe = String(index).padStart(2, '0');
  const base = path.join(outDir, `${safe}-${result.command.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)}`);
  await fs.writeFile(`${base}.json`, JSON.stringify(result, null, 2));
  await fs.writeFile(`${base}.log`, `$ ${result.command}\nexit ${result.code}\n\nSTDOUT\n${result.stdout}\n\nSTDERR\n${result.stderr}\n`);
}

function isPass(result) { return result.code === 0; }
function isExpectedPreSpendBlock(result) { return result.command.includes('gate:kryo:pre-spend') && result.code === 2; }
function lastJsonLine(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  const match = stdout.match(/\{[\s\S]*\}\s*$/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-system-qc/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const commands = [];
  const scriptChecks = [
    'scripts/kryo-proof-runner.mjs',
    'scripts/kryo-readiness-audit.mjs',
    'scripts/kryo-meta-url-audit.mjs',
    'scripts/kryo-checkout-reconciliation.mjs',
    'scripts/kryo-proof-gate.mjs',
    'scripts/kryo-tool-health.mjs',
    'scripts/kryo-operator-action-packet.mjs',
    'scripts/kryo-system-qc.mjs',
  ];
  for (const script of scriptChecks) commands.push(['node', ['--check', script]]);
  if (!args.skipLint) {
    commands.push(['npm', ['run', 'lint', '--', '--file', 'src/app/api/marketing/sync/storefront-event/route.ts', '--file', 'src/lib/marketing/analytics-ops.ts', '--file', 'src/lib/marketing/kryo-cart-abandon-report.ts', '--file', 'src/app/api/marketing/reports/kryo-cart-abandon/route.ts']]);
  }
  if (!args.skipTsc) commands.push(['npx', ['tsc', '--noEmit', '--pretty', 'false']]);
  commands.push(['npm', ['run', 'health:kryo-tools', '--', '--out', path.relative(repoRoot, path.join(outDir, 'tool-health'))]]);
  commands.push(['npm', ['run', 'audit:kryo-checkout-baseline', '--', '--out', path.relative(repoRoot, path.join(outDir, 'checkout-reconciliation'))]]);
  commands.push(['npm', ['run', 'gate:kryo']]);
  commands.push(['npm', ['run', 'gate:kryo:pre-spend']]);
  commands.push(['npm', ['run', 'operator:kryo', '--', '--out', path.relative(repoRoot, path.join(outDir, 'operator-action-packet'))]]);
  if (args.withProof) commands.push(['npm', ['run', 'gate:kryo:pre-page']]);

  const results = [];
  for (let i = 0; i < commands.length; i += 1) {
    const [command, commandArgs] = commands[i];
    const result = await runCommand(command, commandArgs);
    results.push(result);
    await writeCommand(outDir, i + 1, result);
  }

  const hardFailures = results.filter((result) => !isPass(result) && !isExpectedPreSpendBlock(result));
  const preSpend = results.find((result) => result.command.includes('gate:kryo:pre-spend'));
  const observeGate = results.find((result) => result.command.includes('gate:kryo') && !result.command.includes('pre-spend') && !result.command.includes('pre-page'));
  const toolHealth = results.find((result) => result.command.includes('health:kryo-tools'));
  const report = {
    generated_at: new Date().toISOString(),
    status: hardFailures.length ? 'SYSTEM_QC_FAILED' : 'SYSTEM_QC_PASS',
    spend_status: preSpend?.code === 0 ? 'PRE_SPEND_PASS' : preSpend?.code === 2 ? 'PRE_SPEND_BLOCKED_BY_GUARDRAILS' : 'PRE_SPEND_NOT_RUN',
    command_count: results.length,
    hard_failures: hardFailures.map((result) => ({ command: result.command, code: result.code })),
    observe_gate: observeGate ? lastJsonLine(observeGate.stdout) : null,
    tool_health: toolHealth ? lastJsonLine(toolHealth.stdout) : null,
    commands: results.map((result, idx) => ({ index: idx + 1, command: result.command, code: result.code, expected_block: isExpectedPreSpendBlock(result) })),
  };

  const jsonPath = path.join(outDir, 'system-qc.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const commandLines = report.commands.map((item) => `- ${item.code === 0 || item.expected_block ? 'PASS' : 'FAIL'} — \`${item.command}\` exited ${item.code}${item.expected_block ? ' (expected guardrail block)' : ''}`).join('\n');
  const md = `# KRYO System QC\n\nGenerated: ${report.generated_at}\nStatus: ${report.status}\nSpend status: ${report.spend_status}\n\n## Commands\n${commandLines}\n\n## Hard failures\n${report.hard_failures.length ? report.hard_failures.map((x) => `- ${x.command} exited ${x.code}`).join('\n') : '- None'}\n\n## Gate snapshot\n- Observe gate: ${report.observe_gate ? `${report.observe_gate.status} (${report.observe_gate.blockers ?? 'n/a'} blockers, ${report.observe_gate.warnings ?? 'n/a'} warnings)` : 'missing'}\n- Tool health: ${report.tool_health ? `${report.tool_health.status} (${report.tool_health.summary?.blockers ?? 'n/a'} blockers, ${report.tool_health.summary?.warnings ?? 'n/a'} warnings)` : 'missing'}\n- Pre-spend: ${report.spend_status}\n\nRaw JSON: ${jsonPath}\nCommand logs: ${outDir}\n`;
  const mdPath = path.join(outDir, 'system-qc.md');
  await fs.writeFile(mdPath, md);
  console.log(JSON.stringify({ status: report.status, spend_status: report.spend_status, hard_failures: report.hard_failures.length, report: mdPath, json: jsonPath }, null, 2));
  if (hardFailures.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
