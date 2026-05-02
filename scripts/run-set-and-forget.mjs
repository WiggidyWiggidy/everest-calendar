#!/usr/bin/env node
// run-set-and-forget.mjs
// Drives the full /launch-kryo-v2 loop end-to-end LOCALLY (no Vercel deploy required):
//   1. Read BodyHtmlSpec
//   2. POST to deployed /api/marketing/compose-body-html → body_html string
//   3. Wrap in HTML doc + save to /tmp
//   4. Run qc-visual + qc-functional + qc-benchmark
//   5. If benchmark_score < 85 AND iteration < MAX → refine-spec → loop step 2
//   6. If benchmark_score >= 85 OR iteration == MAX → final result
//
// Usage:   node scripts/run-set-and-forget.mjs --spec <spec.json> [--max-iters 2]
// Outputs: /tmp/kryo-page-iter-<N>.html, /tmp/qc-*-iter-<N>.json, screenshots
//          Final summary JSON to stdout.

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

// ── Argv ─────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[++i]; }
}
const SPEC_PATH = args.spec || `/tmp/kryo-athlete-recovery-spec.json`;
const MAX_ITERS = parseInt(args['max-iters'] ?? '2', 10);
const MARKETING_SYNC_SECRET = process.env.MARKETING_SYNC_SECRET;
if (!MARKETING_SYNC_SECRET) {
  console.error('FATAL: MARKETING_SYNC_SECRET not in env. Source .env.local first.');
  process.exit(1);
}

const log = (msg) => process.stderr.write(`[loop] ${msg}\n`);

// ── Helpers ─────────────────────────────────────────────────────
// Compose locally via tsx so newly-added section types (press_logos, lifestyle_strip) work
// before they're deployed to Vercel. Same code path as the Vercel route — just runs in-process.
async function compose(specPath) {
  const out = execFileSync('npx', ['tsx', `${REPO_ROOT}/scripts/compose-local.mts`, specPath], {
    cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function wrapHtml(bodyHtml, angle, iteration) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KRYO V4 — ${angle} (iter ${iteration})</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif; background: #fff; color: #0a0a0a; -webkit-font-smoothing: antialiased; }
.site-header { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid rgba(0,0,0,0.08); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
.site-header__logo { font-weight: 700; letter-spacing: -0.02em; font-size: 20px; }
.site-header__nav { display: flex; gap: 28px; font-size: 14px; color: rgba(0,0,0,0.7); }
.site-header__nav a { color: inherit; text-decoration: none; }
.site-header__cart { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
.site-header__cart svg { width: 18px; height: 18px; }
.product-form-block { max-width: 1280px; margin: 0 auto; padding: 48px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; background: #fff; }
.product-form-block__media img { width: 100%; border-radius: 12px; }
.product-form-block__info h1 { font-size: clamp(2rem, 4vw, 2.6rem); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 16px; line-height: 1.1; }
.product-form-block__price { font-size: 1.4rem; font-weight: 600; margin-bottom: 8px; }
.product-form-block__plan { color: rgba(0,0,0,0.6); font-size: 0.95rem; margin-bottom: 24px; }
.product-form-block__rating { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px; color: #ffd166; }
.product-form-block__rating-text { color: rgba(0,0,0,0.66); font-size: 0.9rem; }
.product-form-block__buy { display: block; width: 100%; padding: 18px; background: #0a0a0a; color: #fff; border: none; border-radius: 999px; font-weight: 600; font-size: 16px; cursor: pointer; margin-bottom: 12px; }
.product-form-block__buy:hover { opacity: 0.92; }
.product-form-block__guarantee { color: rgba(0,0,0,0.6); font-size: 0.85rem; text-align: center; }
.site-footer { margin-top: 80px; padding: 56px 24px 32px; background: #0a0a0a; color: rgba(255,255,255,0.66); font-size: 0.85rem; }
.site-footer__inner { max-width: 1280px; margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 24px; }
.site-footer__brand { color: #fff; font-weight: 700; font-size: 1.1rem; margin-bottom: 8px; }
@media (max-width: 768px) { .product-form-block { grid-template-columns: 1fr; gap: 32px; padding: 32px 20px; } .site-header__nav { display: none; } }
</style>
</head>
<body>
<header class="site-header">
  <div class="site-header__logo">EVEREST LABS</div>
  <nav class="site-header__nav">
    <a href="#">Shop</a> <a href="#">Science</a> <a href="#">Reviews</a> <a href="#">Support</a>
  </nav>
  <a href="#" class="site-header__cart">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    Cart (0)
  </a>
</header>
<section class="product-form-block">
  <div class="product-form-block__media">
    <img src="https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=1200" alt="KRYO V4 cold plunge" loading="eager"/>
  </div>
  <div class="product-form-block__info">
    <h1>KRYO V4 — ${angle.replace(/_/g, ' ')}</h1>
    <div class="product-form-block__price">AED 3,990</div>
    <div class="product-form-block__plan">or 4 × AED 997.5/month with Tabby</div>
    <div class="product-form-block__rating">★★★★★ <span class="product-form-block__rating-text">4.8 from 142 reviews</span></div>
    <button class="product-form-block__buy" id="ProductForm">Reserve your unit · AED 3,990</button>
    <div class="product-form-block__guarantee">30-day performance guarantee · Same-week Dubai dispatch</div>
  </div>
</section>
${bodyHtml}
<footer class="site-footer">
  <div class="site-footer__inner">
    <div><div class="site-footer__brand">EVEREST LABS</div><div>Engineered in Guangzhou. Shipped from Dubai.</div></div>
    <div>© 2026 Everest Labs. All rights reserved.</div>
  </div>
</footer>
</body>
</html>`;
}

function runJsonNode(scriptPath, ...scriptArgs) {
  const out = execFileSync('node', [scriptPath, ...scriptArgs], { cwd: REPO_ROOT, encoding: 'utf-8' });
  return JSON.parse(out);
}

function runJsonNodeStdin(scriptPath, scriptArgs) {
  const out = execFileSync('node', [scriptPath, ...scriptArgs], { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out);
}

// ── Loop ────────────────────────────────────────────────────────
const angle = JSON.parse(await readFile(SPEC_PATH, 'utf-8'))?.sections?.[0]?.props?.eyebrow?.match(/(?:athlete[ _]recovery|morning[ _]energy|luxury[ _]upgrade|value[ _]anchor|science[ _]authority)/i)?.[0] || 'unknown';

let currentSpecPath = SPEC_PATH;
let finalHtmlPath = '';
let lastVerdict = null;
let iteration = 0;

while (iteration <= MAX_ITERS) {
  log(`────────── ITERATION ${iteration} ──────────`);

  // 1. Compose (local via tsx → uses live src/lib/page-composer including new section types)
  const spec = JSON.parse(await readFile(currentSpecPath, 'utf-8'));
  const composed = await compose(currentSpecPath);
  log(`composed: ${composed.section_count} sections, ${composed.byte_length} bytes, ${composed.schema_count} schemas`);

  // 2. Wrap + save
  const html = wrapHtml(composed.body_html, angle, iteration);
  const htmlPath = `/tmp/kryo-page-iter-${iteration}.html`;
  await writeFile(htmlPath, html);
  finalHtmlPath = htmlPath;
  log(`html: ${htmlPath} (${html.length} bytes)`);

  // 3. Benchmark
  const verdict = runJsonNode(`${REPO_ROOT}/scripts/qc-benchmark.mjs`, `file://${htmlPath}`);
  log(`benchmark_score = ${verdict.benchmark_score}/100  ${verdict.pass ? '✓ PASS' : '✗ NEEDS REFINE'}`);
  log(`gaps: ${verdict.gaps.map((g) => `${g.severity}:${g.fix_action}`).join(' · ') || 'none'}`);
  lastVerdict = verdict;

  // Save the verdict
  await writeFile(`/tmp/qc-benchmark-iter-${iteration}.json`, JSON.stringify(verdict, null, 2));

  // 4. Decide
  if (verdict.pass) { log(`PASS at iteration ${iteration}. Stopping.`); break; }
  if (iteration >= MAX_ITERS) { log(`Hit MAX_ITERS=${MAX_ITERS}. Stopping with score ${verdict.benchmark_score}.`); break; }

  // 5. Refine
  const gapsPath = `/tmp/qc-benchmark-iter-${iteration}.json`;
  const refinedSpec = runJsonNodeStdin(`${REPO_ROOT}/scripts/refine-spec.mjs`, ['--spec', currentSpecPath, '--gaps', gapsPath]);
  const nextSpecPath = `/tmp/kryo-spec-iter-${iteration + 1}.json`;
  await writeFile(nextSpecPath, JSON.stringify(refinedSpec, null, 2));
  log(`refined spec: ${nextSpecPath} (${refinedSpec.sections.length} sections, was ${spec.sections.length})`);
  currentSpecPath = nextSpecPath;

  iteration++;
}

// 6. Final QC pass: visual + functional inspectors on the winning iteration
log(`final QC pass on ${finalHtmlPath} ...`);
const visualOut = execFileSync('node', [`${REPO_ROOT}/scripts/qc-visual.mjs`, `file://${finalHtmlPath}`, '/tmp'], { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
const visual = JSON.parse(visualOut);
const functionalOut = execFileSync('node', [`${REPO_ROOT}/scripts/qc-functional.mjs`, `file://${finalHtmlPath}`], { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
const functional = JSON.parse(functionalOut);

// 7. Summary
const summary = {
  iterations: iteration + 1,
  pass: lastVerdict.pass,
  benchmark_score: lastVerdict.benchmark_score,
  remaining_gaps: lastVerdict.gaps,
  final_html: finalHtmlPath,
  desktop_screenshot: visual.artifacts.desktop_screenshot_path,
  mobile_screenshot: visual.artifacts.mobile_screenshot_path,
  tablet_screenshot: visual.artifacts.tablet_screenshot_path,
  visual_checks_passed: visual.checks.filter((c) => c.pass).length,
  visual_checks_total: visual.checks.length,
  functional_checks_passed: functional.checks.filter((c) => c.pass).length,
  functional_checks_total: functional.checks.length,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
