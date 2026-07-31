#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { outDir: '', refresh: false, writeLedger: false, experimentKey: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.outDir = argv[++i] || '';
    else if (arg === '--refresh') args.refresh = true;
    else if (arg === '--write-ledger') args.writeLedger = true;
    else if (arg === '--experiment-key') args.experimentKey = argv[++i] || '';
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-experiment-packet.mjs [--refresh] [--write-ledger] [--experiment-key KEY] [--out DIR]');
      process.exit(0);
    }
  }
  return args;
}

async function run(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: String(err.stderr || err.message).slice(0, 1000) };
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

function pct(n, d, digits = 1) { return d ? Number(((n / d) * 100).toFixed(digits)) : null; }
function today() { return new Date().toISOString().slice(0, 10); }
function deterministicUuid(value) {
  const hex = crypto.createHash('sha1').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}
function csvEscape(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

async function maybeRefresh(args) {
  if (!args.refresh) return;
  await run('npm', ['run', 'audit:kryo-source-health']);
  await run('npm', ['run', 'analyse:kryo-performance']);
  await run('npm', ['run', 'audit:kryo-measurement-spine']);
}

function deriveSpec(analyst, sourceHealth, measurement, experimentKey) {
  const results = analyst.exact_results || {};
  const touch = results.first_party_touches?.session_funnel || {};
  const meta = results.meta_historical || {};
  const shopify = results.shopify_funnel?.totals || {};
  const clarity = results.clarity_friction?.totals || {};
  const intent = results.onsite_intent_view?.totals || {};
  const topAd = (meta.by_ad || []).find((ad) => ad.revenue > 0) || (meta.by_ad || [])[0] || {};
  const key = experimentKey || `kryo2_aug30_access_${today().replace(/-/g, '')}`;
  const experimentId = deterministicUuid(key);

  const baseline = {
    window: analyst.window,
    paid_meta_historical_max_date: meta.max_date || null,
    paid_current_verdicts_usable: analyst.source_confidence?.paid_current_verdicts_usable || false,
    kryo_sessions: results.first_party_touches?.kryo_sessions || 0,
    cart_view_sessions: touch.cart_view || 0,
    checkout_click_sessions: touch.cart_checkout_click || 0,
    cart_to_checkout_click_rate_pct: touch.cart_to_checkout_click_rate_pct ?? pct(touch.cart_checkout_click || 0, touch.cart_view || 0),
    whatsapp_click_sessions: touch.whatsapp_click || 0,
    chat_click_sessions: touch.chat_click || 0,
    whatsapp_or_chat_rate_pct: touch.whatsapp_or_chat_rate_pct ?? pct((touch.whatsapp_click || 0) + (touch.chat_click || 0), results.first_party_touches?.kryo_sessions || 0),
    shopify_checkouts_started: shopify.checkouts_started || 0,
    shopify_checkouts_completed: shopify.checkouts_completed || 0,
    clarity_sessions: clarity.sessions || 0,
    clarity_dead_clicks: clarity.dead_clicks || 0,
    clarity_script_errors: clarity.script_errors || 0,
    scroll50_rate_pct: intent.scroll50_rate_pct || null,
    hero_cta_rate_pct: intent.hero_cta_rate_pct || null,
  };

  return {
    experiment_id: experimentId,
    experiment_key: key,
    status: 'proposed_not_live',
    title: 'KRYO2 August 30 Founding Access WhatsApp + Deposit Funnel',
    angle_id: 'anti_tub_replacement',
    hook_id: 'founding_access_aug30',
    source_seed: {
      winning_ad_name: topAd.ad_name || 'Winner | Plunge is Dead',
      winning_ad_id: topAd.meta_ad_id || null,
      basis: 'Historical winner only. Current paid verdicts are blocked while ads are off and Meta rows are stale.',
    },
    commercial_constraint: 'High-intent hesitation between cart and checkout, plus insufficient low-friction capture for buyers who need reassurance.',
    supporting_evidence: [
      `${baseline.cart_view_sessions} cart-view sessions produced ${baseline.checkout_click_sessions} checkout-click sessions, ${baseline.cart_to_checkout_click_rate_pct}% cart-to-checkout click rate.`,
      `${baseline.whatsapp_click_sessions} WhatsApp clicks and ${baseline.chat_click_sessions} chat clicks from ${baseline.kryo_sessions} tracked KRYO sessions.`,
      `${baseline.clarity_dead_clicks} Clarity dead clicks and ${baseline.clarity_script_errors} script errors indicate trust/friction noise.`,
      `Historical Meta revenue concentrated in ${topAd.ad_name || 'the anti-plunge winner'}.`,
    ],
    hypothesis: 'If the page separates hyper-buyer purchase from warm-buyer WhatsApp access, while matching the winning anti-plunge ad promise with real August 30 scarcity and trust proof, more high-intent visitors will either buy, start WhatsApp, or pay a refundable deposit instead of exiting at cart.',
    variable_changed: 'Launch-funnel message architecture: buy-now lane plus WhatsApp access/deposit lane with August 30 scarcity and trust proof.',
    control: {
      handle: 'kryo2_',
      landing_page_version: 'kryo2_release_a',
      summary: 'Current Release A page with founding-access CTAs and August 30 dispatch copy.',
    },
    treatment: {
      handle: 'kryo2_',
      landing_page_version: 'kryo2_aug30_access_v1',
      page_status: 'patch_plan_only_until_approved',
      ad_status: 'paused_or_dry_run_only_until_tom_sets_live',
    },
    page_message_map: {
      above_fold: {
        promise: 'Cold exposure without a plunge, with August 30 dispatch access.',
        buy_now_lane: 'Reserve KRYO now.',
        warm_buyer_lane: 'Get WhatsApp access to confirm availability and hold the AED 3,990 price.',
        proof: 'Real batch limit, dispatch date, device mechanism, no-plunge comparison.',
      },
      mid_page: {
        trust: 'What happens after you reserve, setup requirements, refund/collection promise only if operationally verified.',
        urgency: '10-unit August 30 dispatch batch only after Tom confirms exact count.',
        whatsapp: 'Ask for current availability and deposit link.',
      },
      cart_near_cta: {
        anxiety_answered: 'Dispatch date, refundable deposit path, WhatsApp concierge, and exact next step after payment.',
      },
    },
    whatsapp_lead_offer: {
      cta: 'Get August access',
      prefill: 'Hi, I want August 30 access to KRYO. Please confirm current Dubai availability and send the refundable deposit option.',
      reason_to_submit: 'Secure access to the August 30 dispatch batch and get the refundable deposit link by WhatsApp.',
      consent_copy: 'By submitting, you agree that Everest Labs can message you on WhatsApp about KRYO availability and your reservation.',
    },
    deposit_funnel: {
      status: measurement.readiness?.can_track_deposits ? 'schema_ready_payment_flow_needed' : 'blocked_until_measurement_spine_applied',
      proposed_amount_aed: 'Small refundable deposit, exact amount requires Tom approval.',
      purpose: 'Cover some ad cost and convert warm intent into a real reservation without forcing full purchase.',
      steps: ['WhatsApp access request', 'Concierge confirms fit and batch availability', 'Deposit link sent', 'Deposit completed', 'Lead status updates', 'Full purchase or refund path'],
    },
    ad_variation_plan: {
      source_campaign_adset: 'Use the winning campaign and ad set from the historical Plunge is Dead winner after readback.',
      status: 'plan_only_or_paused_clone_after_approval',
      source_ad_id: topAd.meta_ad_id || null,
      change_discipline: 'Keep campaign, ad set, creative angle and core anti-plunge promise. Change destination URL and copy slightly to match August 30 access.',
      primary_text: 'Ice baths are too much friction for daily Dubai life. KRYO gives you a real cold-exposure ritual from your shower, with August 30 dispatch access now open.',
      headline: 'Cold exposure without a plunge',
      description: 'Reserve now or get August access by WhatsApp.',
      cta: 'LEARN_MORE',
      url_tags_required: ['utm_source=facebook', 'utm_medium=paid', `utm_angle=anti_tub_replacement`, `utm_hook=founding_access_aug30`, `experiment_id=${experimentId}`, 'landing_page_version=kryo2_aug30_access_v1'],
    },
    metric_decision_map: {
      primary_metric: 'qualified_action_rate = (WhatsApp lead submitted + deposit completed + checkout started + purchase) / KRYO sessions',
      secondary_metrics: ['cart_to_checkout_click_rate', 'whatsapp_lead_submit_rate', 'deposit_completion_rate', 'checkout_completion_rate', 'purchase_count'],
      guardrails: ['hero_cta_rate should not fall by more than 25%', 'scroll50 should not fall by more than 15%', 'Clarity dead clicks and script errors should not increase', 'No unsupported claims or mismatch between ad and page'],
      baseline,
      expected_movement: {
        whatsapp_or_chat_interest_rate_pct: { from: baseline.whatsapp_or_chat_rate_pct, to: '4.0 to 8.0', rationale: 'Dedicated access CTA should capture warm buyers who currently leave or open chat inconsistently.' },
        cart_to_checkout_click_rate_pct: { from: baseline.cart_to_checkout_click_rate_pct, to: '10.0 to 15.0', rationale: 'Trust and exact next-step proof should reduce cart hesitation.' },
        checkout_started_per_kryo_session_pct: { from: pct(baseline.shopify_checkouts_started, baseline.kryo_sessions), to: '0.9 to 1.5', rationale: 'More high-intent users should either start checkout or enter deposit/WhatsApp lane.' },
        purchase_or_deposit_count: { from: baseline.shopify_checkouts_completed, to: '3 to 6 over similar traffic, if paid traffic quality is comparable', rationale: 'Small baseline. Treat as directional until paid delivery restarts.' },
      },
      success_rule: 'Call successful if after at least 500 KRYO sessions or 10 days with fresh tracking, qualified_action_rate is at least 2x baseline and either cart-to-checkout click rate is at least 10% or WhatsApp lead submit rate is at least 4%, with no guardrail failure.',
      failure_rule: 'Call failed if after the same threshold, qualified_action_rate does not improve by at least 25%, WhatsApp lead submit rate stays below 2%, and cart-to-checkout remains below 7%, assuming tracking is healthy.',
      inconclusive_rule: 'Continue collecting data if sessions are under 500, paid traffic quality changed materially, Meta delivery is off, lead/deposit tracking is blocked, or source-health is stale.',
    },
  };
}

function md(spec, sourceHealth, measurement) {
  const lines = [];
  lines.push(`# ${spec.title}`, '');
  lines.push(`Experiment ID: ${spec.experiment_id}`);
  lines.push(`Experiment key: ${spec.experiment_key}`);
  lines.push(`Status: ${spec.status}`);
  lines.push(`Angle/hook: ${spec.angle_id} / ${spec.hook_id}`);
  lines.push('Mutation performed: no', '');
  lines.push('## Constraint', spec.commercial_constraint, '');
  lines.push('## Evidence');
  for (const item of spec.supporting_evidence) lines.push(`- ${item}`);
  lines.push('', '## Hypothesis', spec.hypothesis, '');
  lines.push('## Treatment message map');
  lines.push(`- Above fold promise: ${spec.page_message_map.above_fold.promise}`);
  lines.push(`- Buy-now lane: ${spec.page_message_map.above_fold.buy_now_lane}`);
  lines.push(`- Warm-buyer lane: ${spec.page_message_map.above_fold.warm_buyer_lane}`);
  lines.push(`- Cart anxiety answer: ${spec.page_message_map.cart_near_cta.anxiety_answered}`);
  lines.push('', '## WhatsApp lead offer');
  lines.push(`- CTA: ${spec.whatsapp_lead_offer.cta}`);
  lines.push(`- Prefill: ${spec.whatsapp_lead_offer.prefill}`);
  lines.push(`- Reason: ${spec.whatsapp_lead_offer.reason_to_submit}`);
  lines.push('', '## Deposit funnel');
  lines.push(`- Status: ${spec.deposit_funnel.status}`);
  for (const step of spec.deposit_funnel.steps) lines.push(`- ${step}`);
  lines.push('', '## Paused ad variation plan');
  lines.push(`- Source ad: ${spec.ad_variation_plan.source_ad_id || 'needs readback'}`);
  lines.push(`- Discipline: ${spec.ad_variation_plan.change_discipline}`);
  lines.push(`- Primary text: ${spec.ad_variation_plan.primary_text}`);
  lines.push(`- Headline: ${spec.ad_variation_plan.headline}`);
  lines.push(`- Description: ${spec.ad_variation_plan.description}`);
  lines.push('', '## Expected metric movement');
  for (const [metric, row] of Object.entries(spec.metric_decision_map.expected_movement)) lines.push(`- ${metric}: ${row.from ?? 'n/a'} -> ${row.to}. ${row.rationale}`);
  lines.push('', '## Decision rules');
  lines.push(`- Success: ${spec.metric_decision_map.success_rule}`);
  lines.push(`- Failure: ${spec.metric_decision_map.failure_rule}`);
  lines.push(`- Inconclusive: ${spec.metric_decision_map.inconclusive_rule}`);
  lines.push('', '## Source health');
  lines.push(`- Paid current verdicts usable: ${sourceHealth.metric_policy?.paid_atc_purchase_verdicts?.usable ? 'yes' : 'no'}`);
  lines.push(`- Measurement spine: ${measurement.status}`);
  lines.push('', '## Approval gates before live changes');
  lines.push('- Copy gate PENDING.');
  lines.push('- Website preflight PENDING.');
  lines.push('- Measurement spine lead capture ready or explicitly accepted as blocked.');
  lines.push('- Tom approves named Shopify patch.');
  lines.push('- Tom approves paused Meta clone or dry-run validated creative/ad creation.');
  return `${lines.join('\n')}\n`;
}

async function writeLedgerRow(spec) {
  const ledger = path.join(repoRoot, 'marketing/experiments/experiment-ledger.csv');
  let raw = await fs.readFile(ledger, 'utf8').catch(() => '');
  if (raw.includes(spec.experiment_id) || raw.includes(spec.experiment_key)) return false;
  const row = [
    spec.experiment_id, 'proposed', 'codex', today(), '', '', spec.commercial_constraint,
    JSON.stringify(spec.supporting_evidence), 'Trust, delivery certainty, and low-friction WhatsApp/deposit reassurance.', spec.hypothesis,
    spec.variable_changed, spec.control.landing_page_version, spec.treatment.landing_page_version, 'Dubai high-intent KRYO visitors', 'Meta paid plus onsite warm traffic',
    spec.metric_decision_map.primary_metric, spec.metric_decision_map.secondary_metrics.join('; '), spec.metric_decision_map.guardrails.join('; '), JSON.stringify(spec.metric_decision_map.baseline), JSON.stringify({ success: spec.metric_decision_map.success_rule, failure: spec.metric_decision_map.failure_rule }), JSON.stringify(spec.metric_decision_map.expected_movement), '', 'partial', '', '', '', '', spec.treatment.landing_page_version, spec.ad_variation_plan.source_ad_id || '', '', spec.angle_id, spec.hook_id,
  ].map(csvEscape).join(',');
  raw = raw.trimEnd() + '\n' + row + '\n';
  await fs.writeFile(ledger, raw);
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  await maybeRefresh(args);
  const analyst = await readJson(path.join(repoRoot, 'artifacts/kryo-performance-analyst-pack/latest/analyst-pack.json'));
  const sourceHealth = await readJson(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json'));
  const measurement = await readJson(path.join(repoRoot, 'artifacts/kryo-measurement-spine/latest/measurement-spine-health.json')) || { status: 'not_checked', readiness: {} };
  if (!analyst || !sourceHealth) throw new Error('Missing analyst pack or source-health. Run npm run analyse:kryo-performance and npm run audit:kryo-source-health first.');

  const spec = deriveSpec(analyst, sourceHealth, measurement, args.experimentKey);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-experiment-packets/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'experiment-spec.json');
  const mdPath = path.join(outDir, 'experiment-spec.md');
  await fs.writeFile(jsonPath, JSON.stringify(spec, null, 2));
  await fs.writeFile(mdPath, md(spec, sourceHealth, measurement));
  await fs.writeFile(path.join(outDir, 'page-message-map.json'), JSON.stringify(spec.page_message_map, null, 2));
  await fs.writeFile(path.join(outDir, 'whatsapp-deposit-funnel.json'), JSON.stringify({ whatsapp_lead_offer: spec.whatsapp_lead_offer, deposit_funnel: spec.deposit_funnel }, null, 2));
  await fs.writeFile(path.join(outDir, 'paused-ad-variation-plan.json'), JSON.stringify(spec.ad_variation_plan, null, 2));
  await fs.writeFile(path.join(outDir, 'metric-decision-map.json'), JSON.stringify(spec.metric_decision_map, null, 2));

  const latestDir = path.join(repoRoot, 'artifacts/kryo-experiment-packets/latest');
  await fs.mkdir(latestDir, { recursive: true });
  for (const file of ['experiment-spec.json', 'experiment-spec.md', 'page-message-map.json', 'whatsapp-deposit-funnel.json', 'paused-ad-variation-plan.json', 'metric-decision-map.json']) {
    await fs.copyFile(path.join(outDir, file), path.join(latestDir, file));
  }
  let ledger_written = false;
  if (args.writeLedger) ledger_written = await writeLedgerRow(spec);
  await fs.writeFile(path.join(repoRoot, 'marketing/experiments/current-experiment.md'), md(spec, sourceHealth, measurement));
  console.log(JSON.stringify({ status: 'ok', report: mdPath, json: jsonPath, latest: path.join(latestDir, 'experiment-spec.md'), experiment_id: spec.experiment_id, experiment_key: spec.experiment_key, ledger_written, mutation_performed: false }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
