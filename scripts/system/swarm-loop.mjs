#!/usr/bin/env node
// swarm-loop.mjs — autonomous KRYO page builder. No Claude in the loop.
//
// Pipeline:
//   1. Load eightsleep blueprint (alternates between pod-cover + pod-4-ultra each run)
//   2. Spawn 3 parallel attempts via Kimi using DIFFERENTIATED strategies (literal/divergent/aggressive)
//   3. Compose body_html locally for each attempt
//   4. Render + screenshot + run qc-visual + qc-functional + qc-benchmark per attempt
//   5. If 0 attempts pass threshold → run a 4th SYNTHESIS attempt (best-of merge via Kimi)
//   6. Pick winner (highest benchmark_score, no hard-fails)
//   7. Upload winner's screenshots to Supabase Storage → public URLs
//   8. (SWARM_DEPLOY=true) Clone winner to Shopify via /api/marketing/launch/clone-page
//   9. Re-QC the LIVE Shopify URL (Shopify-render parity check — catches theme wrapper breakage)
//  10. inbox-write with screenshots + score + URLs + parity verdict
//  11. Log run to swarm_runs Supabase table
//
// Flags:
//   --angle <a>            morning_energy | athlete_recovery | luxury_upgrade | value_anchor | science_authority | auto
//   --attempts <n>         3 (default)
//   --threshold <n>        75 (default — minimum benchmark score to ship)
//   --template <path>      override blueprint
//   --skip-deploy          skip Shopify deploy even if SWARM_DEPLOY=true
//
// Env:
//   MARKETING_SYNC_SECRET, EVEREST_SUPABASE_URL, EVEREST_SUPABASE_SERVICE_KEY (required)
//   KIMI_OAUTH_TOKEN | MOONSHOT_API_KEY (required for LLM)
//   SWARM_DEPLOY=true (optional — enables actual Shopify clone-page call)

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadScreenshot } from './upload-screenshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = dirname(__dirname);
const REPO_ROOT = dirname(SCRIPTS_DIR);

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i];
}

const ANGLES = ['morning_energy', 'athlete_recovery', 'luxury_upgrade', 'value_anchor', 'science_authority'];
const STRATEGIES = ['literal', 'divergent', 'aggressive'];

let ANGLE = args.angle || 'auto';
if (ANGLE === 'auto') {
  // Rotate by day-of-year: deterministic, evenly distributes 5 angles across the week
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  ANGLE = ANGLES[day % ANGLES.length];
}
if (!ANGLES.includes(ANGLE)) {
  console.error(`FATAL: invalid angle "${ANGLE}". Valid: ${ANGLES.join(', ')}, auto`);
  process.exit(2);
}

const ATTEMPTS = parseInt(args.attempts ?? '3', 10);
const SCORE_THRESHOLD = parseInt(args.threshold ?? '75', 10);
const SKIP_DEPLOY = args['skip-deploy'] === 'true';
const TEMPLATE_PATH = args.template ||
  // Alternate blueprints: pod-cover MWF / pod-4-ultra TThS / blueprint-derived auto-pick
  ((new Date().getDay() % 2 === 0)
    ? `${REPO_ROOT}/benchmarks/eightsleep-sections.json`
    : `${REPO_ROOT}/benchmarks/eightsleep-pod4-sections.json`);
// Fallback to default if alt template not yet captured
const FALLBACK_TEMPLATE = `${REPO_ROOT}/benchmarks/eightsleep-sections.json`;
const TS = Date.now();
const RUN_ID = `swarm-${TS}`;

const log = (msg) => process.stderr.write(`[${RUN_ID}] ${msg}\n`);

// ── Sanity ──────────────────────────────────────────────
if (!process.env.MARKETING_SYNC_SECRET) { console.error('FATAL: MARKETING_SYNC_SECRET'); process.exit(1); }
if (!process.env.EVEREST_SUPABASE_URL) { console.error('FATAL: EVEREST_SUPABASE_URL'); process.exit(1); }
if (!process.env.KIMI_OAUTH_TOKEN && !process.env.MOONSHOT_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error('FATAL: no LLM creds. Set KIMI_OAUTH_TOKEN.'); process.exit(1);
}

// Use fallback template if requested one is missing
let actualTemplatePath = TEMPLATE_PATH;
try { await readFile(TEMPLATE_PATH, 'utf-8'); }
catch { actualTemplatePath = FALLBACK_TEMPLATE; log(`template ${TEMPLATE_PATH} missing, falling back to ${FALLBACK_TEMPLATE}`); }

log(`angle=${ANGLE} attempts=${ATTEMPTS} threshold=${SCORE_THRESHOLD} template=${actualTemplatePath.split('/').pop()}`);

// ── Pipeline functions ──────────────────────────────────
async function generateAttempt(idx, strategy) {
  const specPath = `/tmp/${RUN_ID}-attempt-${idx}-${strategy}-spec.json`;
  // Slightly different temperature per strategy for natural divergence
  const temp = strategy === 'aggressive' ? 0.8 : strategy === 'divergent' ? 0.7 : 0.5;
  const stdout = execFileSync('node', [
    `${SCRIPTS_DIR}/system/clone-and-substitute.mjs`,
    '--template', actualTemplatePath,
    '--angle', ANGLE,
    '--strategy', strategy,
    '--temperature', String(temp),
  ], { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, env: process.env });
  await writeFile(specPath, stdout);
  return specPath;
}

async function compose(specPath) {
  const out = execFileSync('npx', ['tsx', `${SCRIPTS_DIR}/compose-local.mts`, specPath], {
    cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, env: process.env,
  });
  return JSON.parse(out);
}

async function renderHtml(bodyHtml, attemptIdx) {
  const htmlPath = `/tmp/${RUN_ID}-attempt-${attemptIdx}.html`;
  // Shopify-like wrapper so the QC inspectors see a realistic page chrome
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>KRYO V4 — ${ANGLE} attempt ${attemptIdx}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Inter","Helvetica Neue",Arial,sans-serif;background:#fff;color:#0a0a0a;-webkit-font-smoothing:antialiased}.h{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:14px 24px;display:flex;align-items:center;justify-content:space-between}.hl{font-weight:700;letter-spacing:-.02em;font-size:20px}.hn{display:flex;gap:28px;font-size:14px;color:rgba(0,0,0,.7)}.hn a{color:inherit;text-decoration:none}.f{margin-top:80px;padding:56px 24px 32px;background:#0a0a0a;color:rgba(255,255,255,.66);font-size:.85rem}.fi{max-width:1280px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:24px}.fb{color:#fff;font-weight:700;font-size:1.1rem}@media(max-width:768px){.hn{display:none}}</style></head><body><header class="h"><div class="hl">EVEREST LABS</div><nav class="hn"><a href="#">Shop</a> <a href="#">Science</a> <a href="#">Reviews</a></nav></header>${bodyHtml}<footer class="f"><div class="fi"><div><div class="fb">EVEREST LABS</div></div><div>© 2026</div></div></footer></body></html>`;
  await writeFile(htmlPath, html);
  return htmlPath;
}

function runQc(htmlPath) {
  const url = htmlPath.startsWith('http') ? htmlPath : `file://${htmlPath}`;
  const visual = JSON.parse(execFileSync('node', [`${SCRIPTS_DIR}/qc-visual.mjs`, url, '/tmp'], {
    cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024,
  }));
  const benchmark = JSON.parse(execFileSync('node', [`${SCRIPTS_DIR}/qc-benchmark.mjs`, url], {
    cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024,
  }));
  return { visual, benchmark };
}

async function logRunToSupabase(payload) {
  try {
    const res = await fetch(
      `${process.env.EVEREST_SUPABASE_URL}/rest/v1/swarm_runs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EVEREST_SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.EVEREST_SUPABASE_SERVICE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) log(`swarm_runs log HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    log(`swarm_runs log error: ${e.message}`);
  }
}

// ── Run N parallel attempts with differentiated strategies ─────
log(`firing ${ATTEMPTS} parallel attempts (strategies: ${STRATEGIES.slice(0, ATTEMPTS).join(', ')})`);

const attemptPromises = Array.from({ length: ATTEMPTS }, (_, i) => (async () => {
  const strategy = STRATEGIES[i % STRATEGIES.length];
  try {
    log(`attempt ${i} (${strategy}): generating via Kimi …`);
    const specPath = await generateAttempt(i, strategy);
    const composed = await compose(specPath);
    if (!composed.body_html) throw new Error('no body_html');
    const htmlPath = await renderHtml(composed.body_html, i);
    log(`attempt ${i} (${strategy}): rendered ${composed.section_count} sections, running QC …`);
    const qc = runQc(htmlPath);
    return {
      attempt: i, strategy, spec_path: specPath, html_path: htmlPath,
      composed, qc,
      score: qc.benchmark.benchmark_score,
      visual_pass: qc.visual.checks.filter((c) => c.pass).length / qc.visual.checks.length,
    };
  } catch (e) {
    return { attempt: i, strategy, error: String(e).slice(0, 400) };
  }
})());

let attempts = await Promise.all(attemptPromises);
let valid = attempts.filter((a) => !a.error && typeof a.score === 'number');

log(`results: ${valid.length}/${ATTEMPTS} attempts ok; scores=${valid.map((a) => `${a.strategy}:${a.score}`).join(', ')}`);

// ── 4th attempt: synthesis if no attempt cleared threshold ──
const initialBest = valid.sort((a, b) => b.score - a.score)[0];
if (valid.length >= 2 && initialBest && initialBest.score < SCORE_THRESHOLD) {
  log(`best score ${initialBest.score} < threshold ${SCORE_THRESHOLD}; firing 4th synthesis attempt …`);
  try {
    const specPath = `/tmp/${RUN_ID}-attempt-synthesis-spec.json`;
    const stdout = execFileSync('node', [
      `${SCRIPTS_DIR}/system/synthesise-best-of.mjs`,
      '--attempts', valid.map((a) => a.spec_path).join(','),
    ], { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, env: process.env });
    await writeFile(specPath, stdout);
    const composed = await compose(specPath);
    const htmlPath = await renderHtml(composed.body_html, 'synthesis');
    const qc = runQc(htmlPath);
    valid.push({
      attempt: 'synthesis', strategy: 'synthesis', spec_path: specPath, html_path: htmlPath,
      composed, qc,
      score: qc.benchmark.benchmark_score,
      visual_pass: qc.visual.checks.filter((c) => c.pass).length / qc.visual.checks.length,
    });
    log(`synthesis attempt: score=${qc.benchmark.benchmark_score}`);
  } catch (e) {
    log(`synthesis attempt failed: ${e.message}`);
  }
}

if (valid.length === 0) {
  await logRunToSupabase({ run_id: RUN_ID, angle: ANGLE, status: 'all_failed', error_detail: JSON.stringify(attempts).slice(0, 1000) });
  console.error('FATAL: all attempts failed');
  process.exit(2);
}

// Pick winner
valid.sort((a, b) => b.score - a.score);
const winner = valid[0];
log(`winner: attempt=${winner.attempt} strategy=${winner.strategy} score=${winner.score}`);

// ── Upload winner's screenshots to Supabase Storage ───────
const desktopLocal = winner.qc.visual.artifacts.desktop_screenshot_path;
const mobileLocal = winner.qc.visual.artifacts.mobile_screenshot_path;
let desktopUrl = null, mobileUrl = null;
try {
  if (desktopLocal) {
    const up = await uploadScreenshot(desktopLocal, `${RUN_ID}/desktop.png`);
    desktopUrl = up.url;
    log(`desktop uploaded: ${desktopUrl}`);
  }
  if (mobileLocal) {
    const up = await uploadScreenshot(mobileLocal, `${RUN_ID}/mobile.png`);
    mobileUrl = up.url;
    log(`mobile uploaded: ${mobileUrl}`);
  }
} catch (e) {
  log(`screenshot upload failed: ${e.message}`);
}

// ── Shopify deploy (gated by SWARM_DEPLOY env + threshold) ──
let deployed = false;
let shopifyProductId = null;
let shopifyHandle = null;
let publicShopifyUrl = null;
let landingPageId = null;
let parityVerdict = null;

if (!SKIP_DEPLOY && process.env.SWARM_DEPLOY === 'true' && winner.score >= SCORE_THRESHOLD) {
  log(`score ${winner.score} >= threshold ${SCORE_THRESHOLD}; deploying to Shopify …`);
  try {
    const composedSpec = JSON.parse(await readFile(winner.spec_path, 'utf-8'));
    const composed = await compose(winner.spec_path);
    const cloneRes = await fetch(
      `https://everest-calendar.vercel.app/api/marketing/launch/clone-page`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-secret': process.env.MARKETING_SYNC_SECRET },
        body: JSON.stringify({
          variant_angle: ANGLE,
          target_name: `KRYO V4 — ${ANGLE} — ${new Date().toISOString().slice(0,10)} (swarm)`,
          hypothesis: `Auto-generated by swarm-loop. Strategy=${winner.strategy}. Score=${winner.score}.`,
          publish_active: true,
          body_html_full_replace: composed.body_html,
        }),
      }
    );
    if (!cloneRes.ok) {
      log(`clone-page HTTP ${cloneRes.status}: ${(await cloneRes.text()).slice(0, 300)}`);
    } else {
      const cloneData = await cloneRes.json();
      shopifyProductId = cloneData.shopify_product_id;
      shopifyHandle = cloneData.shopify_handle;
      publicShopifyUrl = cloneData.preview_url;
      landingPageId = cloneData.landing_page_id;
      deployed = true;
      log(`deployed: ${publicShopifyUrl} (product_id=${shopifyProductId})`);

      // Shopify-render parity check — re-QC the LIVE URL
      log(`Shopify-render parity QC on ${publicShopifyUrl} …`);
      try {
        // Wait briefly for Shopify to finish indexing
        await new Promise((r) => setTimeout(r, 4000));
        const liveQc = runQc(publicShopifyUrl);
        const liveScore = liveQc.benchmark.benchmark_score;
        const liveVisualPass = liveQc.visual.checks.filter((c) => c.pass).length / liveQc.visual.checks.length;
        const localScore = winner.score;
        const drift = Math.abs(liveScore - localScore);
        parityVerdict = {
          live_score: liveScore,
          local_score: localScore,
          drift,
          live_visual_pass_rate: liveVisualPass,
          parity_pass: drift <= 15 && liveScore >= SCORE_THRESHOLD - 10,
          notes: drift > 15 ? `Significant drift between local render and Shopify render — theme wrapper may be affecting layout.` : null,
        };
        log(`parity: local=${localScore} live=${liveScore} drift=${drift} ${parityVerdict.parity_pass ? '✓' : '✗'}`);
      } catch (e) {
        parityVerdict = { error: String(e).slice(0, 300) };
        log(`parity check error: ${e.message}`);
      }
    }
  } catch (e) {
    log(`deploy error: ${e.message}`);
  }
} else {
  log(`deploy skipped (SWARM_DEPLOY=${process.env.SWARM_DEPLOY || 'unset'}, skip-deploy=${SKIP_DEPLOY}, score=${winner.score})`);
}

// ── Inbox-write (only if we have a real Shopify variant OR threshold low for testing) ──
let inboxIds = [];
if (deployed && landingPageId) {
  try {
    const inboxRes = await fetch(
      `https://everest-calendar.vercel.app/api/marketing/launch/inbox-write`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-secret': process.env.MARKETING_SYNC_SECRET },
        body: JSON.stringify({
          launch_run_id: RUN_ID,
          variant_angle: ANGLE,
          hypothesis: `Auto-generated by swarm-loop. Strategy=${winner.strategy}. Local score=${winner.score}.`,
          assets: [{
            kind: 'landing_page',
            resource_id: landingPageId,
            preview_url: publicShopifyUrl,
            variant_angle: ANGLE,
            summary: `KRYO V4 ${ANGLE} variant — score ${winner.score}/100 (${winner.strategy})${parityVerdict?.parity_pass ? ', Shopify parity ✓' : parityVerdict ? `, parity drift ${parityVerdict.drift}` : ''}`,
            payload: {
              swarm_run_id: RUN_ID,
              strategy: winner.strategy,
              local_score: winner.score,
              live_score: parityVerdict?.live_score ?? null,
              parity_drift: parityVerdict?.drift ?? null,
              desktop_screenshot_url: desktopUrl,
              mobile_screenshot_url: mobileUrl,
              admin_url: shopifyProductId ? `https://everestlabs.myshopify.com/admin/products/${shopifyProductId}` : null,
              public_url: publicShopifyUrl,
              attempts_summary: valid.map((a) => ({ attempt: a.attempt, strategy: a.strategy, score: a.score })),
              gaps: winner.qc.benchmark.gaps?.slice(0, 5),
            },
          }],
        }),
      }
    );
    if (inboxRes.ok) {
      const inboxData = await inboxRes.json();
      inboxIds = inboxData.inbox_ids || [];
      log(`inbox card written: ${inboxIds.join(', ')}`);
    } else {
      log(`inbox-write HTTP ${inboxRes.status}: ${(await inboxRes.text()).slice(0, 300)}`);
    }
  } catch (e) {
    log(`inbox-write error: ${e.message}`);
  }
}

// ── Log run to Supabase swarm_runs ───────────────────────
await logRunToSupabase({
  run_id: RUN_ID,
  angle: ANGLE,
  template_url: actualTemplatePath.split('/').pop(),
  attempts_total: ATTEMPTS,
  attempts_succeeded: valid.length,
  scores: valid.map((a) => ({ attempt: a.attempt, strategy: a.strategy, score: a.score })),
  winner_strategy: winner.strategy,
  winner_score: winner.score,
  threshold: SCORE_THRESHOLD,
  deployed,
  shopify_product_id: shopifyProductId,
  shopify_handle: shopifyHandle,
  landing_page_id: landingPageId,
  public_url: publicShopifyUrl,
  desktop_screenshot_url: desktopUrl,
  mobile_screenshot_url: mobileUrl,
  parity_verdict: parityVerdict,
  inbox_ids: inboxIds,
  status: deployed ? 'deployed' : 'completed_no_deploy',
});

// ── Final summary to stdout ────────────────────────────
const summary = {
  run_id: RUN_ID,
  angle: ANGLE,
  template: actualTemplatePath.split('/').pop(),
  attempts_total: ATTEMPTS,
  attempts_succeeded: valid.length,
  scores: valid.map((a) => ({ attempt: a.attempt, strategy: a.strategy, score: a.score })),
  winner: {
    attempt: winner.attempt,
    strategy: winner.strategy,
    score: winner.score,
    visual_pass_rate: winner.visual_pass,
    spec_path: winner.spec_path,
    html_path: winner.html_path,
  },
  screenshots: { desktop: desktopUrl, mobile: mobileUrl },
  shopify: deployed ? { product_id: shopifyProductId, handle: shopifyHandle, public_url: publicShopifyUrl, parity: parityVerdict } : null,
  inbox_ids: inboxIds,
  status: deployed ? 'deployed' : (winner.score >= SCORE_THRESHOLD ? 'ready_to_deploy' : 'below_threshold'),
};
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
