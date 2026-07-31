#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_MAX_AGE_MINUTES = 180;

function parseArgs(argv) {
  const args = {
    mode: 'observe',
    runAudits: true,
    runProof: false,
    maxAgeMinutes: DEFAULT_MAX_AGE_MINUTES,
    outDir: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--run-proof') args.runProof = true;
    else if (arg === '--skip-audits') args.runAudits = false;
    else if (arg === '--max-age-minutes') args.maxAgeMinutes = Number(argv[++i]);
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-proof-gate.mjs [--mode observe|pre_spend|pre_page] [--run-proof] [--skip-audits] [--max-age-minutes N] [--out DIR]');
      process.exit(0);
    }
  }
  if (!['observe', 'pre_spend', 'pre_page'].includes(args.mode)) throw new Error(`Invalid --mode ${args.mode}`);
  return args;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function latestJsonUnder(baseDir, fileName) {
  try {
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

function ageMinutes(mtimeMs) {
  return Math.round((Date.now() - mtimeMs) / 60000);
}

function add(list, code, severity, message, source) {
  list.push({ code, severity, message, source });
}


function recommendedActions(evaluation) {
  const actions = [];
  const all = [...evaluation.blockers, ...evaluation.warnings];
  const has = (code) => all.some((item) => item.code === code || item.message.toLowerCase().includes(code.replaceAll('_', ' ')));
  if (all.some((item) => /meta account not active|Meta account status/i.test(item.message))) {
    actions.push({ priority: 1, owner: 'Tom', type: 'external_account', action: 'Resolve Meta payment/account status before restart', approval_required: true });
  }
  if (has('url_tag_guardrails_open') || has('meta_urls_need_fix')) {
    actions.push({ priority: 2, owner: 'Codex', type: 'draft_meta_fix', action: 'Prepare paused/no-spend URL-tag fix plan for affected KRYO ads; do not mutate until approved', approval_required: true });
  }
  if (has('checkout_click_tracking') || all.some((item) => /Checkout-click tracking/i.test(item.message))) {
    actions.push({ priority: 3, owner: 'Codex', type: 'tracking_system', action: 'Improve proof runner and tracking report to distinguish missing checkout-click instrumentation from true zero checkout-click behavior', approval_required: false });
  }
  if (all.some((item) => /Cart add failure rate/i.test(item.message))) {
    actions.push({ priority: 4, owner: 'Codex', type: 'diagnostic_only', action: 'Keep cart add failures visible in proof packets; defer storefront fixes until Tom approves site changes', approval_required: false });
  }
  if (has('stale_proof') || has('missing_proof_packet')) {
    actions.push({ priority: 5, owner: 'Codex', type: 'proof', action: 'Run npm run proof:kryo to refresh screenshots, traces, and tracking proof', approval_required: false });
  }
  return actions.sort((a, b) => a.priority - b.priority);
}

function evaluate({ mode, readiness, metaUrls, proof, maxAgeMinutes }) {
  const blockers = [];
  const warnings = [];

  if (!readiness) add(blockers, 'missing_readiness', 'blocker', 'No KRYO readiness audit found', 'artifacts/kryo-readiness');
  if (!metaUrls) add(blockers, 'missing_meta_url_audit', 'blocker', 'No KRYO Meta URL audit found', 'artifacts/kryo-meta-url-audit');
  if (!proof) add(warnings, 'missing_proof_packet', 'warning', 'No KRYO proof packet found', 'artifacts/kryo-proof');

  if (readiness) {
    if (readiness.age > maxAgeMinutes) add(blockers, 'stale_readiness', 'blocker', `Readiness audit is stale: ${readiness.age} min old`, readiness.path);
    for (const msg of readiness.json.readiness?.blockers ?? []) {
      const severity = mode === 'observe' ? 'warning' : 'blocker';
      add(severity === 'blocker' ? blockers : warnings, 'readiness_blocker', severity, msg, readiness.path);
    }
    for (const msg of readiness.json.readiness?.warnings ?? []) add(warnings, 'readiness_warning', 'warning', msg, readiness.path);
  }

  if (metaUrls) {
    if (metaUrls.age > maxAgeMinutes) add(blockers, 'stale_meta_url_audit', 'blocker', `Meta URL audit is stale: ${metaUrls.age} min old`, metaUrls.path);
    const summary = metaUrls.json.summary ?? {};
    if ((summary.ads_needing_fix ?? 0) > 0) {
      const severity = mode === 'observe' ? 'warning' : 'blocker';
      add(severity === 'blocker' ? blockers : warnings, 'meta_urls_need_fix', severity, `${summary.ads_needing_fix} KRYO ad URL(s) need fixes before spend`, metaUrls.path);
    }
    if ((summary.open_url_tag_guardrails ?? 0) > 0) {
      const severity = mode === 'observe' ? 'warning' : 'blocker';
      add(severity === 'blocker' ? blockers : warnings, 'url_tag_guardrails_open', severity, `${summary.open_url_tag_guardrails} URL-tag guardrail(s) open`, metaUrls.path);
    }
  }

  if (proof) {
    if (proof.age > maxAgeMinutes) add(mode === 'observe' ? warnings : blockers, 'stale_proof', mode === 'observe' ? 'warning' : 'blocker', `Proof packet is stale: ${proof.age} min old`, proof.path);
    const desktopOk = (proof.json.desktop?.http_status ?? 500) < 400;
    const mobileOk = (proof.json.mobile?.http_status ?? 500) < 400;
    const pixelOk = Boolean(proof.json.desktop?.pixel_version && proof.json.mobile?.pixel_version);
    const trackingOk = Boolean(proof.json.tracking_probe?.supabase_row_found);
    const checkoutVisible = (proof.json.desktop?.checkout_controls_visible ?? 0) > 0 && (proof.json.mobile?.checkout_controls_visible ?? 0) > 0;
    if (!desktopOk || !mobileOk) add(blockers, 'proof_load_failed', 'blocker', 'Desktop/mobile storefront proof load failed', proof.path);
    if (!pixelOk) add(blockers, 'pixel_missing', 'blocker', 'Everest attribution pixel missing in proof run', proof.path);
    if (!trackingOk) add(blockers, 'tracking_probe_failed', 'blocker', 'Production tracking probe did not persist Supabase internal_qa row', proof.path);
    if (!checkoutVisible) add(mode === 'observe' ? warnings : blockers, 'checkout_not_visible', mode === 'observe' ? 'warning' : 'blocker', 'Checkout controls not visible in proof run', proof.path);
    const severeConsoleCount = [...(proof.json.desktop?.console_errors ?? []), ...(proof.json.mobile?.console_errors ?? [])]
      .filter((msg) => !/favicon|clarity|third-party|Clear-Site-Data/i.test(msg.text ?? '')).length;
    if (severeConsoleCount > 0) {
      add(mode === 'pre_page' ? blockers : warnings, 'console_errors', mode === 'pre_page' ? 'blocker' : 'warning', `${severeConsoleCount} severe console error(s) in latest proof`, proof.path);
    }
  }

  if (mode === 'pre_spend' && readiness?.json.meta_account && String(readiness.json.meta_account.account_status) !== '1') {
    add(blockers, 'meta_account_not_active', 'blocker', `Meta account status is ${readiness.json.meta_account.account_status}`, readiness.path);
  }

  const status = mode === 'observe' ? (warnings.length || blockers.length ? 'PASS_WITH_WARNINGS' : 'PASS') : (blockers.length ? 'BLOCKED' : warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS');
  return { mode, status, blockers, warnings };
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-proof-gate/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(outDir, { recursive: true });
  const commandLog = [];

  if (args.runAudits) {
    const audit = await runCommand('npm', ['run', 'audit:kryo-system']);
    commandLog.push({ command: 'npm run audit:kryo-system', code: audit.code, stdout: audit.stdout, stderr: audit.stderr });
    if (audit.code !== 0) {
      await fs.writeFile(path.join(outDir, 'commands.json'), JSON.stringify(commandLog, null, 2));
      throw new Error(`audit:kryo-system failed with code ${audit.code}`);
    }
  }

  if (args.runProof) {
    const proofRun = await runCommand('npm', ['run', 'proof:kryo', '--', '--timeout-ms', '60000', '--out', 'artifacts/kryo-proof/latest-gate']);
    commandLog.push({ command: 'npm run proof:kryo -- --timeout-ms 60000 --out artifacts/kryo-proof/latest-gate', code: proofRun.code, stdout: proofRun.stdout, stderr: proofRun.stderr });
    if (proofRun.code !== 0) {
      await fs.writeFile(path.join(outDir, 'commands.json'), JSON.stringify(commandLog, null, 2));
      throw new Error(`proof:kryo failed with code ${proofRun.code}`);
    }
  }

  const readinessRaw = await latestJsonUnder(path.join(repoRoot, 'artifacts/kryo-readiness'), 'readiness.json');
  const metaUrlsRaw = await latestJsonUnder(path.join(repoRoot, 'artifacts/kryo-meta-url-audit'), 'meta-url-audit.json');
  const proofRaw = await latestJsonUnder(path.join(repoRoot, 'artifacts/kryo-proof'), 'qc.json');
  const readiness = readinessRaw ? { ...readinessRaw, age: ageMinutes(readinessRaw.mtimeMs) } : null;
  const metaUrls = metaUrlsRaw ? { ...metaUrlsRaw, age: ageMinutes(metaUrlsRaw.mtimeMs) } : null;
  const proof = proofRaw ? { ...proofRaw, age: ageMinutes(proofRaw.mtimeMs) } : null;
  const evaluation = evaluate({ mode: args.mode, readiness, metaUrls, proof, maxAgeMinutes: args.maxAgeMinutes });
  const report = {
    generated_at: new Date().toISOString(),
    max_age_minutes: args.maxAgeMinutes,
    evaluation,
    recommended_actions: recommendedActions(evaluation),
    sources: {
      readiness: readiness && { path: readiness.path, age_minutes: readiness.age },
      meta_urls: metaUrls && { path: metaUrls.path, age_minutes: metaUrls.age },
      proof: proof && { path: proof.path, age_minutes: proof.age },
    },
    command_log_path: path.join(outDir, 'commands.json'),
  };
  await fs.writeFile(path.join(outDir, 'commands.json'), JSON.stringify(commandLog, null, 2));
  const jsonPath = path.join(outDir, 'proof-gate.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const md = `# KRYO Proof Gate\n\nGenerated: ${report.generated_at}\nMode: ${args.mode}\nStatus: ${evaluation.status}\n\n## Blockers\n${evaluation.blockers.length ? evaluation.blockers.map((x) => `- [${x.code}] ${x.message} (${x.source})`).join('\n') : '- None'}\n\n## Warnings\n${evaluation.warnings.length ? evaluation.warnings.map((x) => `- [${x.code}] ${x.message} (${x.source})`).join('\n') : '- None'}\n\n## Recommended actions\n${report.recommended_actions.length ? report.recommended_actions.map((x) => `- P${x.priority} [${x.owner}] ${x.action}`).join('\n') : '- None'}\n\n## Sources\n- Readiness: ${report.sources.readiness?.path ?? 'missing'}\n- Meta URLs: ${report.sources.meta_urls?.path ?? 'missing'}\n- Proof: ${report.sources.proof?.path ?? 'missing'}\n\nRaw JSON: ${jsonPath}\n`;
  const mdPath = path.join(outDir, 'proof-gate.md');
  await fs.writeFile(mdPath, md);
  console.log(JSON.stringify({ status: evaluation.status, mode: args.mode, blockers: evaluation.blockers.length, warnings: evaluation.warnings.length, report: mdPath, json: jsonPath }, null, 2));
  if (args.mode !== 'observe' && evaluation.status === 'BLOCKED') process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
