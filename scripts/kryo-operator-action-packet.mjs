#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_MAX_AGE_MINUTES = 180;

function parseArgs(argv) {
  const args = { outDir: '', refresh: false, maxAgeMinutes: DEFAULT_MAX_AGE_MINUTES };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--refresh') args.refresh = true;
    else if (arg === '--max-age-minutes') args.maxAgeMinutes = Number(argv[++i]);
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-operator-action-packet.mjs [--refresh] [--out DIR] [--max-age-minutes N]');
      process.exit(0);
    }
  }
  return args;
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ command: [command, ...args].join(' '), code, stdout, stderr }));
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function latestFileUnder(baseDir, fileName) {
  try {
    const namedLatest = path.join(baseDir, 'latest', fileName);
    try {
      const stat = await fs.stat(namedLatest);
      return { path: namedLatest, json: await readJson(namedLatest), mtimeMs: stat.mtimeMs };
    } catch {}

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

function source(raw) {
  return raw ? { path: raw.path, age_minutes: ageMinutes(raw.mtimeMs), json: raw.json } : null;
}

function addAction(actions, input) {
  const impact = Math.max(1, Math.min(10, Number(input.impact ?? 5)));
  const confidence = Math.max(1, Math.min(10, Number(input.confidence ?? 5)));
  const ease = Math.max(1, Math.min(10, Number(input.ease ?? 5)));
  const safety = input.safety ?? 'read_only';
  const approvalRequired = Boolean(input.approval_required);
  const score = Number(((impact * confidence * ease) / 10).toFixed(1));
  actions.push({
    id: input.id,
    lane: input.lane,
    title: input.title,
    why: input.why,
    next_step: input.next_step,
    owner: input.owner ?? 'Codex',
    approval_required: approvalRequired,
    safety,
    ice: { impact, confidence, ease, score },
    evidence: input.evidence ?? [],
    expected_effect: input.expected_effect ?? null,
    command: input.command ?? null,
  });
}

function gateItems(gate) {
  if (!gate?.json?.evaluation) return [];
  return [...(gate.json.evaluation.blockers ?? []), ...(gate.json.evaluation.warnings ?? [])];
}

function evidencePath(item) {
  return item?.source ?? item?.path ?? null;
}

function buildActions({ readiness, metaUrls, proofGate, toolHealth, proof, checkout, preflight, maxAgeMinutes }) {
  const actions = [];
  const gate = proofGate?.json;
  const gateAll = gateItems(proofGate);
  const readinessBlockers = readiness?.json?.readiness?.blockers ?? [];
  const readinessWarnings = readiness?.json?.readiness?.warnings ?? [];
  const metaSummary = metaUrls?.json?.summary ?? {};
  const toolWarnings = toolHealth?.json?.checks?.filter((check) => check.status === 'warning') ?? [];
  const checkoutDiagnosis = checkout?.json?.diagnosis ?? null;
  const staleSources = [
    ['readiness', readiness], ['meta_urls', metaUrls], ['proof_gate', proofGate], ['tool_health', toolHealth], ['proof', proof], ['checkout_reconciliation', checkout], ['preflight', preflight],
  ].filter(([, value]) => value && ageMinutes(value.mtimeMs) > maxAgeMinutes);



  if (preflight?.json?.status === 'blocked') {
    const preflightBlockers = preflight.json.blockers ?? [];
    addAction(actions, {
      id: 'resolve-operator-preflight-blockers', lane: 'system_trust', title: 'Resolve KRYO preflight blockers before website or marketing work',
      why: preflightBlockers.length ? preflightBlockers.map((x) => `${x.code}: ${x.message}`).join('; ') : 'Canonical preflight is blocked.',
      next_step: 'Read the latest preflight packet. Do not make website changes or current paid-ad claims until the blockers are resolved or explicitly acknowledged by Tom.',
      impact: 10, confidence: 10, ease: 8, safety: 'process_only', approval_required: false,
      evidence: [preflight.path], command: 'npm run operator:kryo-preflight -- --mode all --handle kryo2_',
      expected_effect: 'Makes source health, Shopify readiness, quarantine, and recommendation gates unavoidable.',
    });
  }

  if (staleSources.length) {
    addAction(actions, {
      id: 'refresh-stale-evidence', lane: 'system_trust', title: 'Refresh stale KRYO evidence before any decision',
      why: `${staleSources.map(([name, value]) => `${name}=${ageMinutes(value.mtimeMs)}m`).join(', ')} exceeds ${maxAgeMinutes}m freshness window.`,
      next_step: 'Run the system QC command and use only the refreshed packet for spend/page decisions.',
      impact: 9, confidence: 10, ease: 9, safety: 'read_only', approval_required: false,
      evidence: staleSources.map(([, value]) => value.path), command: 'npm run qc:kryo-system',
      expected_effect: 'Prevents decisions from stale Meta, tracking, or storefront evidence.',
    });
  }

  const metaNotActive = [...readinessBlockers, ...gateAll.map((x) => x.message)].some((msg) => /Meta account not active|Meta account status/i.test(msg));
  if (metaNotActive) {
    addAction(actions, {
      id: 'resolve-meta-account-before-spend', lane: 'pre_spend_blocker', title: 'Resolve Meta account status before restart',
      why: 'The guardrail says the ad account is not active. Spend decisions are unsafe until this is resolved.',
      next_step: 'Tom resolves payment/account status in Meta. Codex reruns pre-spend gate after it changes.',
      owner: 'Tom', impact: 10, confidence: 10, ease: 2, safety: 'external_account', approval_required: true,
      evidence: [readiness?.path, proofGate?.path].filter(Boolean), command: 'npm run gate:kryo:pre-spend',
      expected_effect: 'Unlocks the ability to restart spend only after the pre-spend gate passes.',
    });
  }

  if ((metaSummary.ads_needing_fix ?? 0) > 0 || gateAll.some((x) => /URL-tag|URL\(s\) need fixes/i.test(x.message))) {
    addAction(actions, {
      id: 'draft-meta-url-fix-plan', lane: 'pre_spend_blocker', title: 'Draft URL/UTM fix plan for affected KRYO ads',
      why: `${metaSummary.ads_needing_fix ?? 'Some'} synced KRYO ad URL(s) need UTM/country fixes before spend.`,
      next_step: 'Generate a no-mutation patch plan listing each affected ad, current URL problem, and exact proposed URL. Do not apply until approved.',
      impact: 10, confidence: 9, ease: 7, safety: 'draft_only', approval_required: true,
      evidence: [metaUrls?.path, proofGate?.path].filter(Boolean), command: 'npm run audit:kryo-meta-urls',
      expected_effect: 'Prevents paid traffic attribution loss and wrong-country landing sessions when ads restart.',
    });
  }

  if ([...readinessBlockers, ...readinessWarnings, ...gateAll.map((x) => x.message)].some((msg) => /Checkout-click tracking/i.test(msg))) {
    addAction(actions, {
      id: 'separate-checkout-instrumentation-from-behavior', lane: 'measurement', title: 'Prove checkout-click instrumentation versus true checkout drop-off',
      why: checkoutDiagnosis ? `Checkout reconciliation diagnosis: ${checkoutDiagnosis}.` : 'Current first-party data shows zero/missing checkout-clicks. That can mean broken instrumentation or real cart abandonment.',
      next_step: checkout?.json?.recommended_next_step ?? 'Extend proof/reporting to compare cart checkout button visibility, internal QA checkout-click posts, GA4 begin_checkout, and first-party checkout_started in one row.',
      impact: 9, confidence: 8, ease: 8, safety: 'read_only_or_internal_qa', approval_required: false,
      evidence: [checkout?.path, readiness?.path, proof?.path, proofGate?.path].filter(Boolean), command: 'npm run audit:kryo-checkout-baseline',
      expected_effect: 'Stops Codex from optimizing the cart until it knows whether the metric is broken or the user flow is broken.',
    });
  }

  const cartFail = [...readinessWarnings, ...gateAll.map((x) => x.message)].find((msg) => /Cart add failure rate/i.test(msg));
  if (cartFail) {
    addAction(actions, {
      id: 'keep-cart-failure-visible-no-storefront-fix', lane: 'site_reliability', title: 'Keep cart-add failures visible without changing storefront',
      why: cartFail,
      next_step: 'Keep this as a proof-packet blocker/warning. Only draft a storefront fix after Tom approves site changes.',
      impact: 8, confidence: 8, ease: 9, safety: 'diagnostic_only', approval_required: false,
      evidence: [readiness?.path, proofGate?.path].filter(Boolean), command: 'npm run gate:kryo:pre-page',
      expected_effect: 'Prevents silent conversion loss while respecting the no-storefront-change constraint.',
    });
  }

  if (toolWarnings.length) {
    addAction(actions, {
      id: 'close-tool-health-warnings', lane: 'system_trust', title: 'Close remaining free-tool health warnings',
      why: toolWarnings.map((x) => `${x.name}: ${x.evidence}`).join('; '),
      next_step: 'Prioritise only warnings that block automation confidence: Supabase MCP token and Chrome remote debugging. Leave optional local Shopify env unless needed.',
      impact: 7, confidence: 9, ease: 7, safety: 'local_config_only', approval_required: false,
      evidence: [toolHealth?.path].filter(Boolean), command: 'npm run health:kryo-tools',
      expected_effect: 'Reduces manual checking and makes future browser/data QC faster.',
    });
  }

  if (proof?.json) {
    const severeConsole = [...(proof.json.desktop?.console_errors ?? []), ...(proof.json.mobile?.console_errors ?? [])]
      .filter((msg) => !/favicon|clarity|third-party|Clear-Site-Data/i.test(msg.text ?? '')).length;
    if (severeConsole > 0) {
      addAction(actions, {
        id: 'classify-proof-console-errors', lane: 'proof_quality', title: 'Classify proof-run console errors into source-owned buckets',
        why: `Latest browser proof has ${severeConsole} severe console error(s), but not all are equal risk.`,
        next_step: 'Group console/network errors by owner: KRYO theme, Shopify app, third party, tracking, browser noise. Only theme-owned errors should block page changes.',
        impact: 7, confidence: 8, ease: 8, safety: 'read_only', approval_required: false,
        evidence: [proof.path].filter(Boolean), command: 'npm run proof:kryo',
        expected_effect: 'Improves proof signal quality and reduces false manual review.',
      });
    }
  }

  if (gate?.recommended_actions?.length) {
    addAction(actions, {
      id: 'sync-gate-actions-to-operator-packet', lane: 'system_trust', title: 'Use this packet as the single daily operating surface',
      why: `Gate already emits ${gate.recommended_actions.length} recommended action(s); this packet ranks them with safety and ownership.`,
      next_step: 'Before any KRYO marketing work, read the latest operator action packet and choose the highest-ranked safe Codex-owned item.',
      impact: 8, confidence: 9, ease: 9, safety: 'process_only', approval_required: false,
      evidence: [proofGate?.path].filter(Boolean), command: 'npm run operator:kryo:refresh',
      expected_effect: 'Cuts Tom review load by making Codex prove what it is doing and why before acting.',
    });
  }

  const deduped = new Map();
  for (const action of actions) {
    const existing = deduped.get(action.id);
    if (!existing || existing.ice.score < action.ice.score) deduped.set(action.id, action);
  }
  return [...deduped.values()].sort((a, b) => {
    const laneWeight = { pre_spend_blocker: 5, measurement: 4, system_trust: 3, site_reliability: 2, proof_quality: 1 };
    return (laneWeight[b.lane] ?? 0) - (laneWeight[a.lane] ?? 0) || b.ice.score - a.ice.score;
  });
}

function safetyDecision(actions, proofGate) {
  const gateStatus = proofGate?.json?.evaluation?.status ?? 'missing';
  const spendBlocked = gateStatus === 'BLOCKED' || actions.some((x) => x.lane === 'pre_spend_blocker');
  return {
    spend_restart: spendBlocked ? 'BLOCKED' : 'READY_FOR_TOM_APPROVAL',
    storefront_mutation: 'BLOCKED_UNTIL_TOM_APPROVES_SITE_CHANGES',
    safe_codex_next_step: actions.find((x) => !x.approval_required && ['read_only', 'process_only', 'local_config_only', 'diagnostic_only', 'read_only_or_internal_qa'].includes(x.safety))?.title ?? null,
    gate_status: gateStatus,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# KRYO Operator Action Packet');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Status: ${report.status}`);
  lines.push(`Spend restart: ${report.safety_decision.spend_restart}`);
  lines.push(`Storefront mutation: ${report.safety_decision.storefront_mutation}`);
  lines.push(`Safe Codex next step: ${report.safety_decision.safe_codex_next_step ?? 'none'}`);
  lines.push('');
  lines.push('## Evidence sources');
  for (const [name, src] of Object.entries(report.sources)) {
    lines.push(`- ${name}: ${src ? `${src.path} (${src.age_minutes}m old)` : 'missing'}`);
  }
  lines.push('');
  lines.push('## Ranked actions');
  if (!report.actions.length) lines.push('- None');
  report.actions.forEach((action, idx) => {
    lines.push(`### ${idx + 1}. ${action.title}`);
    lines.push(`- Lane: ${action.lane}`);
    lines.push(`- Owner: ${action.owner}`);
    lines.push(`- Approval required: ${action.approval_required ? 'yes' : 'no'}`);
    lines.push(`- Safety: ${action.safety}`);
    lines.push(`- ICE: ${action.ice.score} (${action.ice.impact}·${action.ice.confidence}·${action.ice.ease})`);
    lines.push(`- Why: ${action.why}`);
    lines.push(`- Next step: ${action.next_step}`);
    if (action.expected_effect) lines.push(`- Expected effect: ${action.expected_effect}`);
    if (action.command) lines.push(`- Command: \`${action.command}\``);
    if (action.evidence.length) lines.push(`- Evidence: ${action.evidence.join(', ')}`);
    lines.push('');
  });
  lines.push('## Hard rules');
  lines.push('- Do not activate ads or change budgets from this packet. Tom approves spend.');
  lines.push('- Do not mutate storefront from this packet. Tom has not approved storefront changes.');
  lines.push('- If evidence is stale or missing, refresh the packet before deciding.');
  lines.push('');
  lines.push(`Raw JSON: ${report.raw_json_path}`);
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-operator-action-packet/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(outDir, { recursive: true });
  const commandLog = [];

  if (args.refresh) {
    for (const command of [
      ['npm', ['run', 'operator:kryo-preflight', '--', '--mode', 'all', '--handle', 'kryo2_', '--soft']],
      ['npm', ['run', 'health:kryo-tools', '--', '--out', 'artifacts/kryo-tool-health/latest']],
      ['npm', ['run', 'gate:kryo']],
      ['npm', ['run', 'audit:kryo-checkout-baseline', '--', '--out', 'artifacts/kryo-checkout-reconciliation/latest']],
      ['npm', ['run', 'gate:kryo:pre-spend']],
    ]) {
      const result = await runCommand(command[0], command[1]);
      commandLog.push(result);
      const expectedPreSpendBlock = result.command.includes('gate:kryo:pre-spend') && result.code === 2;
      const expectedHealthBlock = result.command.includes('health:kryo-tools') && result.code === 2;
      if (result.code !== 0 && !expectedPreSpendBlock && !expectedHealthBlock) {
        await fs.writeFile(path.join(outDir, 'commands.json'), JSON.stringify(commandLog, null, 2));
        throw new Error(`${result.command} failed with code ${result.code}`);
      }
    }
  }

  const readinessRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-readiness'), 'readiness.json');
  const metaUrlsRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-meta-url-audit'), 'meta-url-audit.json');
  const proofGateRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-proof-gate'), 'proof-gate.json');
  const toolHealthRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-tool-health'), 'tool-health.json');
  const proofRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-proof'), 'qc.json');
  const checkoutRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-checkout-reconciliation'), 'checkout-reconciliation.json');
  const preflightRaw = await latestFileUnder(path.join(repoRoot, 'artifacts/kryo-preflight'), 'preflight.json');

  const readiness = source(readinessRaw);
  const metaUrls = source(metaUrlsRaw);
  const proofGate = source(proofGateRaw);
  const toolHealth = source(toolHealthRaw);
  const proof = source(proofRaw);
  const checkout = source(checkoutRaw);
  const preflight = source(preflightRaw);
  const actions = buildActions({ readiness, metaUrls, proofGate, toolHealth, proof, checkout, preflight, maxAgeMinutes: args.maxAgeMinutes });
  const blockers = actions.filter((x) => x.lane === 'pre_spend_blocker' || (x.id === 'refresh-stale-evidence'));
  const report = {
    generated_at: new Date().toISOString(),
    status: blockers.length ? 'ACTION_REQUIRED' : 'READY_WITH_GUARDRAILS',
    max_age_minutes: args.maxAgeMinutes,
    safety_decision: safetyDecision(actions, proofGate),
    summary: {
      actions: actions.length,
      approval_required: actions.filter((x) => x.approval_required).length,
      codex_safe_now: actions.filter((x) => !x.approval_required).length,
    },
    actions,
    sources: {
      readiness: readiness && { path: readiness.path, age_minutes: readiness.age_minutes },
      meta_urls: metaUrls && { path: metaUrls.path, age_minutes: metaUrls.age_minutes },
      proof_gate: proofGate && { path: proofGate.path, age_minutes: proofGate.age_minutes },
      tool_health: toolHealth && { path: toolHealth.path, age_minutes: toolHealth.age_minutes },
      proof: proof && { path: proof.path, age_minutes: proof.age_minutes },
      checkout_reconciliation: checkout && { path: checkout.path, age_minutes: checkout.age_minutes },
      preflight: preflight && { path: preflight.path, age_minutes: preflight.age_minutes },
    },
    commands: commandLog.map((x) => ({ command: x.command, code: x.code })),
  };
  const jsonPath = path.join(outDir, 'operator-action-packet.json');
  report.raw_json_path = jsonPath;
  await fs.writeFile(path.join(outDir, 'commands.json'), JSON.stringify(commandLog, null, 2));
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const mdPath = path.join(outDir, 'operator-action-packet.md');
  await fs.writeFile(mdPath, renderMarkdown(report));
  console.log(JSON.stringify({ status: report.status, spend_restart: report.safety_decision.spend_restart, actions: report.summary.actions, codex_safe_now: report.summary.codex_safe_now, approval_required: report.summary.approval_required, report: mdPath, json: jsonPath }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
