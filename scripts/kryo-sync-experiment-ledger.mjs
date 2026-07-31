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
async function loadEnv() { await loadEnvFile(path.join(os.homedir(), '.zshenv')); await loadEnvFile(path.join(repoRoot, '.env.local')); }
function env() { return { base: (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), key: process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '' }; }
function sanitize(value = '') { return String(value).replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]').replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]').slice(0, 1000); }
async function curlJson(args) {
  const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout || 'null');
}
async function readSpec() { return JSON.parse(await fs.readFile(path.join(repoRoot, 'artifacts/kryo-experiment-packets/latest/experiment-spec.json'), 'utf8')); }

async function upsertExperiment(spec) {
  const { base, key } = env();
  if (!base || !key) throw new Error('Supabase URL/key missing');
  const url = `${base}/rest/v1/kryo_growth_experiments?on_conflict=experiment_key`;
  const payload = {
    id: spec.experiment_id,
    experiment_key: spec.experiment_key,
    status: 'draft',
    owner: 'codex',
    date_proposed: new Date().toISOString().slice(0, 10),
    funnel_problem: spec.commercial_constraint,
    supporting_evidence: { items: spec.supporting_evidence, source_seed: spec.source_seed || null },
    customer_belief_or_objection: 'High-intent Dubai buyer needs proof, dispatch certainty, safe setup clarity, WhatsApp reassurance and a low-friction deposit path.',
    hypothesis: spec.hypothesis,
    variable_changed: spec.variable_changed,
    control_version: spec.control?.landing_page_version || null,
    treatment_version: spec.treatment?.landing_page_version || null,
    target_audience: 'Dubai high-intent KRYO visitors',
    traffic_source: 'Meta paid plus onsite warm traffic',
    primary_metric: spec.metric_decision_map?.primary_metric || 'qualified_action_rate',
    secondary_metrics: spec.metric_decision_map?.secondary_metrics || [],
    guardrail_metrics: spec.metric_decision_map?.guardrails || [],
    baseline: spec.metric_decision_map?.baseline || {},
    decision_threshold: {
      success: spec.metric_decision_map?.success_rule || null,
      failure: spec.metric_decision_map?.failure_rule || null,
      inconclusive: spec.metric_decision_map?.inconclusive_rule || null,
    },
    expected_result: JSON.stringify(spec.metric_decision_map?.expected_movement || {}),
    data_quality_status: 'partial',
    landing_page_version: spec.treatment?.landing_page_version || null,
    ad_ids: spec.ad_variation_plan?.source_ad_id ? [spec.ad_variation_plan.source_ad_id] : [],
    creative_ids: [],
    angle_id: spec.angle_id,
    hook_id: spec.hook_id,
    updated_at: new Date().toISOString(),
  };
  return await curlJson([
    '-sS', '--max-time', '30', '--retry', '3', '--retry-delay', '1', '--retry-all-errors',
    '-X', 'POST', url,
    '-H', `apikey: ${key}`,
    '-H', `Authorization: Bearer ${key}`,
    '-H', 'Content-Type: application/json',
    '-H', 'Prefer: resolution=merge-duplicates,return=representation',
    '-d', JSON.stringify(payload),
  ]);
}

async function main() {
  await loadEnv();
  const spec = await readSpec();
  const rows = await upsertExperiment(spec).catch((err) => { throw new Error(sanitize(err.message || err)); });
  const row = Array.isArray(rows) ? rows[0] : null;
  const out = { status: row ? 'ok' : 'unknown', experiment_id: row?.id || spec.experiment_id, experiment_key: spec.experiment_key, db_status: row?.status || null, mutation_performed: true, mutation_type: 'supabase_upsert_kryo_growth_experiments' };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => { console.error(sanitize(err instanceof Error ? err.stack || err.message : String(err))); process.exit(1); });
