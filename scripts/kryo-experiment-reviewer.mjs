#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
function hasHardBan(text) {
  const bans = [/EverestPod/i, /NUE/i, /EverestEvo/i, /superhuman/i, /unlock/i, /clinically proven/i, /\b(cure|cures|cured|treat|treats|treated|diagnose|diagnoses|diagnosed)\b/i, /almost full/i, /—|——/];
  return bans.filter((re) => re.test(text)).map((re) => String(re));
}

async function main() {
  const spec = await readJson(path.join(repoRoot, 'artifacts/kryo-experiment-packets/latest/experiment-spec.json'));
  const source = await readJson(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json'));
  const spine = await readJson(path.join(repoRoot, 'artifacts/kryo-measurement-spine/latest/measurement-spine-health.json'));
  if (!spec || !source) throw new Error('Missing latest experiment packet or source health.');

  const copyText = [
    spec.whatsapp_lead_offer?.cta,
    spec.whatsapp_lead_offer?.prefill,
    spec.whatsapp_lead_offer?.reason_to_submit,
    spec.ad_variation_plan?.primary_text,
    spec.ad_variation_plan?.headline,
    spec.ad_variation_plan?.description,
  ].filter(Boolean).join('\n');
  const issues = [];
  if (!spec.experiment_id || !spec.experiment_key) issues.push('Missing experiment ID/key.');
  if (!spec.angle_id || !spec.hook_id) issues.push('Missing angle/hook ID.');
  if (!spec.metric_decision_map?.primary_metric) issues.push('Missing primary metric.');
  if (!spec.metric_decision_map?.success_rule || !spec.metric_decision_map?.failure_rule) issues.push('Missing success/failure decision rules.');
  if ((spec.variable_changed || '').split(/[;+]/).length > 2) issues.push('Variable changed may be too broad. Reviewer should check one-variable discipline.');
  const bans = hasHardBan(copyText);
  if (bans.length) issues.push(`Hard-ban copy pattern detected: ${bans.join(', ')}`);
  if (!source.metric_policy?.onsite_intent?.usable) issues.push('Onsite intent source not usable.');
  if (!source.metric_policy?.shopify_orders_revenue?.usable) issues.push('Shopify funnel source not usable.');
  if (!source.metric_policy?.paid_atc_purchase_verdicts?.usable) issues.push('Current paid verdicts not usable. Paid ad claims must stay historical or pending until delivery resumes.');
  if (spine?.status !== 'ok') issues.push('Measurement spine blocked. WhatsApp lead and deposit outcomes cannot be called production-ready.');
  if (!String(spec.deposit_funnel?.status || '').includes('schema_ready') && !String(spec.deposit_funnel?.status || '').includes('blocked')) issues.push('Deposit funnel status unclear.');

  const blocking = issues.filter((i) => /Missing|Hard-ban/i.test(i));
  const verdict = blocking.length ? 'REVISE' : issues.length ? 'PENDING_EVIDENCE' : 'PASS';
  const report = { generated_at: new Date().toISOString(), verdict, mutation_performed: false, experiment_id: spec.experiment_id, experiment_key: spec.experiment_key, issues };
  const outDir = path.join(repoRoot, 'artifacts/kryo-experiment-review/latest');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'experiment-review.json'), JSON.stringify(report, null, 2));
  const md = ['# KRYO Experiment Release Review', '', `Generated: ${report.generated_at}`, `Verdict: ${verdict}`, 'Mutation performed: no', '', '## Issues', ...(issues.length ? issues.map((i) => `- ${i}`) : ['- None'])].join('\n') + '\n';
  await fs.writeFile(path.join(outDir, 'experiment-review.md'), md);
  console.log(JSON.stringify({ status: 'ok', verdict, issues: issues.length, report: path.join(outDir, 'experiment-review.md'), mutation_performed: false }, null, 2));
  if (verdict === 'REVISE') process.exitCode = 2;
}

main().catch((err) => { console.error(err); process.exit(1); });
