#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repoRoot, 'config/kryo-system-registry.json');

function parseArgs(argv) {
  const args = { route: '', task: '', connector: '', outDir: '', failOnQuarantine: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--route') args.route = argv[++i];
    else if (arg === '--task') args.task = argv[++i];
    else if (arg === '--connector') args.connector = argv[++i];
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--fail-on-quarantine') args.failOnQuarantine = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-quarantine-check.mjs [--route PATH] [--task NAME] [--connector NAME] [--fail-on-quarantine] [--out DIR]');
      process.exit(0);
    }
  }
  return args;
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

function norm(value) {
  return String(value || '').replace(/^\/api\/marketing\//, '').replace(/^marketing\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function findByName(items, key, value) {
  const target = norm(value).toLowerCase();
  return (items || []).find((item) => norm(item[key]).toLowerCase() === target) || null;
}

async function readCodexConnectors() {
  const configPath = path.join(os.homedir(), '.codex/config.toml');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return [...raw.matchAll(/^\[mcp_servers\.([^\].]+)(?:\.[^\]]+)?\]/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  const findings = [];

  const canonicalRoutes = new Set((registry.canonical?.shopify_routes || []).map(norm));
  const quarantineRoutes = registry.quarantine?.routes || [];
  const quarantineTasks = registry.quarantine?.scheduled_tasks || [];
  const quarantineConnectors = registry.quarantine?.connectors || [];

  if (args.route) {
    const route = norm(args.route);
    const q = findByName(quarantineRoutes, 'path', route);
    const c = canonicalRoutes.has(route);
    findings.push({ type: 'route_query', name: route, status: q ? 'quarantined' : c ? 'canonical' : 'unknown', reason: q?.reason || null });
  }

  if (args.task) {
    const q = findByName(quarantineTasks, 'name', args.task);
    const c = registry.canonical?.scheduled_task === args.task;
    findings.push({ type: 'task_query', name: args.task, status: q ? q.status : c ? 'canonical' : 'unknown', reason: q?.reason || null });
  }

  if (args.connector) {
    const q = findByName(quarantineConnectors, 'name', args.connector);
    findings.push({ type: 'connector_query', name: args.connector, status: q ? q.status : 'unknown', reason: q?.reason || null });
  }

  const routeInventory = [];
  for (const item of quarantineRoutes) {
    const routeFile = path.join(repoRoot, 'src/app/api/marketing', item.path, 'route.ts');
    routeInventory.push({ ...item, exists: await exists(routeFile), route_file: routeFile });
  }

  const taskInventory = [];
  for (const item of quarantineTasks) {
    const skill = path.join(os.homedir(), '.claude/scheduled-tasks', item.name, 'SKILL.md');
    taskInventory.push({ ...item, exists: await exists(skill), skill_file: skill });
  }

  const configuredConnectors = await readCodexConnectors();
  const connectorInventory = quarantineConnectors.map((item) => ({ ...item, configured: configuredConnectors.includes(item.name) || configuredConnectors.some((c) => item.name.includes(c) || c.includes(item.name.split('-')[0])) }));

  const queriedQuarantined = findings.some((f) => f.status && !['canonical', 'unknown'].includes(f.status));
  const status = queriedQuarantined ? 'blocked' : 'pass';
  const report = {
    generated_at: new Date().toISOString(),
    status,
    registry_path: registryPath,
    policy: registry.policy,
    website_mutation_policy: registry.website_mutation_policy,
    canonical: registry.canonical,
    findings,
    route_inventory: routeInventory,
    scheduled_task_inventory: taskInventory,
    connector_inventory: connectorInventory,
    rule: 'Quarantined tasks/routes/connectors are not canonical. They require explicit Tom approval or a dedicated cleanup task before use.',
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-quarantine-check/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'quarantine-check.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  const latestDir = path.join(repoRoot, 'artifacts/kryo-quarantine-check/latest');
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(latestDir, 'quarantine-check.json'), JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# KRYO Quarantine Check');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Status: ${report.status.toUpperCase()}`);
  lines.push('');
  lines.push('## Queried findings');
  if (!findings.length) lines.push('- No specific route/task/connector queried. Inventory mode only.');
  for (const f of findings) lines.push(`- ${f.type}: ${f.name} => ${f.status}${f.reason ? ` (${f.reason})` : ''}`);
  lines.push('');
  lines.push('## Quarantined routes present');
  for (const r of routeInventory.filter((r) => r.exists)) lines.push(`- ${r.path}: ${r.status} — ${r.reason}`);
  lines.push('');
  lines.push('## Quarantined scheduled tasks present');
  for (const t of taskInventory.filter((t) => t.exists)) lines.push(`- ${t.name}: ${t.status} — ${t.reason}`);
  lines.push('');
  lines.push(`Raw JSON: ${jsonPath}`);
  const mdPath = path.join(outDir, 'quarantine-check.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(latestDir, 'quarantine-check.md'), `${lines.join('\n')}\n`);

  console.log(JSON.stringify({ status, queried_quarantined: queriedQuarantined, report: mdPath, json: jsonPath }, null, 2));
  if (args.failOnQuarantine && queriedQuarantined) process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
