#!/usr/bin/env node
/**
 * KRYO setup FLOW gate — measures the journey, not a screenshot.
 *
 * A static page audit passes a wizard that costs 20+ taps to revisit a known step, asks for
 * registration twice, and loses your place on reload. None of that is visible in a screenshot.
 * This drives the actual flow at 390px and measures what the owner actually pays.
 *
 * Usage: node scripts/qc-kryo-setup-flow.mjs <url> [outdir]
 * Exit 0 = SHIP · 1 = DO NOT SHIP · 2 = could not verify (stub / rate limited)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2];
const out = process.argv[3] || '/tmp';
if (!url) { console.log('usage: qc-kryo-setup-flow.mjs <url> [outdir]'); process.exit(1); }

const findings = [];
const add = (sev, what, evidence) => findings.push({ sev, what, evidence });
const ok = [];
const pass = (what, evidence) => ok.push({ what, evidence });

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

try {
  const resp = await p.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
  const html = await p.content();
  if ((!resp && !url.startsWith('file:')) || html.length < 5000) {
    console.log(JSON.stringify({ ok: false, blocked: true,
      reason: `stub response (${html.length} bytes) — could not verify, NOT a page defect` }, null, 1));
    await b.close(); process.exit(2);
  }
  await p.waitForTimeout(400);

  const state = () => p.evaluate(() => {
    const r = document.querySelector('[data-kryo-setup]');
    const act = document.querySelector('.kryo-su__screen[data-active]');
    const cta = document.querySelector('[data-kryo-next]');
    const alt = document.querySelector('[data-kryo-alt]');
    const h1 = act && act.querySelector('.kryo-su__h1');
    return {
      screen: act ? (act.getAttribute('data-kryo-screen') || 'step:' + act.getAttribute('data-slug')) : null,
      heading: h1 ? h1.textContent.trim() : null,
      cta: cta ? cta.textContent.trim() : null,
      altVisible: alt ? !alt.hidden : false,
      progress: (document.querySelector('[data-kryo-prog-label]') || {}).textContent || '',
      progressVisible: !document.querySelector('[data-kryo-nav-open]').hidden,
      hash: location.hash,
      saved: localStorage.getItem('kryo_setup_progress_v1'),
      focused: document.activeElement ? document.activeElement.className : '',
      scrollY: Math.round(window.scrollY),
      segs: [...document.querySelectorAll('[data-seg]')].map((s) => s.getAttribute('data-state')),
    };
  });

  // ---------- 1. THE GATE ----------
  let s = await state();
  if (s.screen !== 'gate') add('P0', 'A brand-new owner is not gated', `first screen was "${s.screen}"`);
  else pass('New owner sees the safety gate first', s.heading);

  // Support and safety must work while gated.
  const gatedHelp = await p.evaluate(() => {
    document.querySelector('[data-kryo-help-open]').click();
    const open = !document.querySelector('[data-kryo-sheet="help"]').hidden;
    document.querySelector('[data-kryo-sheet="help"] [data-kryo-sheet-close]').click();
    return open;
  });
  if (!gatedHelp) add('P0', 'Help is unreachable while the gate is up', 'help sheet did not open');
  else pass('Help reachable while gated', 'bottom sheet opens on the gate screen');

  // Gate must actually block on an empty form.
  await p.click('[data-kryo-next]');
  s = await state();
  if (s.screen !== 'gate') add('P0', 'Gate accepts an empty form', 'advanced without acknowledgement');
  else pass('Gate rejects an empty submission', 'stays on gate, error shown');

  await p.fill('[data-kryo-gate-form] input[name="name"]', 'Test Owner');
  await p.fill('[data-kryo-gate-form] input[name="email"]', 'owner@example.com');
  await p.check('[data-kryo-gate-form] input[name="accept"]');
  await p.click('[data-kryo-next]');
  await p.waitForTimeout(250);
  s = await state();
  if (s.screen !== 'start') add('P0', 'Gate does not lead to the start screen', `landed on "${s.screen}"`);
  else pass('Gate accepted', `start screen: "${s.heading}"`);

  // ---------- 2. RELOAD MUST NOT RE-ASK ----------
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
  s = await state();
  if (s.screen === 'gate') add('P0', 'Registration is demanded twice on the same device', 'gate reappeared after reload');
  else pass('Never asked to register twice', `reload resumed at "${s.screen}"`);

  // ---------- 3. FIRST STEP: is the action obvious without scrolling? ----------
  await p.click('[data-kryo-next]');
  await p.waitForTimeout(250);
  s = await state();
  const firstStep = s;
  if (!s.screen.startsWith('step:')) add('P0', 'Begin setup does not open a step', `landed on "${s.screen}"`);
  else pass('Setup begins', `${s.progress} — "${s.heading}"`);

  const fold = await p.evaluate(() => {
    const act = document.querySelector('.kryo-su__screen[data-active]');
    const h1 = act.querySelector('.kryo-su__h1');
    const vis = act.querySelector('.kryo-su__vis');
    const instr = act.querySelector('.kryo-su__instr, .kryo-su__acts');
    const cta = document.querySelector('[data-kryo-next]');
    const box = (el) => (el ? Math.round(el.getBoundingClientRect().bottom) : null);
    return { vpH: window.innerHeight, h1: box(h1), vis: box(vis), instr: box(instr),
             ctaTop: Math.round(cta.getBoundingClientRect().top),
             ctaH: Math.round(cta.getBoundingClientRect().height) };
  });
  if (fold.instr !== null && fold.instr > fold.vpH)
    add('P0', 'The instruction is below the fold on the first step',
        `instruction ends at ${fold.instr}px, screen is ${fold.vpH}px`);
  else pass('Instruction visible without scrolling', `ends at ${fold.instr}px of ${fold.vpH}px`);
  if (fold.ctaTop + fold.ctaH > fold.vpH + 2)
    add('P0', 'Primary action is not on screen', `CTA bottom ${fold.ctaTop + fold.ctaH}px vs ${fold.vpH}px`);
  else pass('Primary action always on screen', `sticky CTA ${fold.ctaH}px high`);

  // ---------- 4. INTERACTION COST ----------
  // Cost of reaching the LAST step by tapping Next repeatedly.
  let taps = 0;
  for (let n = 0; n < 60; n++) {
    const cur = await state();
    if (cur.screen === 'done') break;
    await p.click('[data-kryo-next]');
    taps++;
    await p.waitForTimeout(60);
  }
  const endState = await state();
  if (endState.screen !== 'done') add('P0', 'Could not reach the end of setup', `stuck on "${endState.screen}" after ${taps} taps`);
  else pass('Setup completes', `${taps} taps end to end (24 steps + 5 chapter marks)`);

  // Cost of jumping back to a known step via the navigator.
  await p.evaluate(() => localStorage.removeItem('kryo_setup_progress_v1'));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.click('[data-kryo-next]');           // start -> step 1
  await p.waitForTimeout(200);
  const before = await state();
  let jumpTaps = 0;
  await p.click('[data-kryo-nav-open]'); jumpTaps++;
  await p.waitForTimeout(200);
  const navRows = await p.$$('.kryo-su__navrow');
  const target = navRows[15];                   // a step deep in chapter 4
  await target.click(); jumpTaps++;
  await p.waitForTimeout(250);
  const after = await state();
  if (before.screen === after.screen) add('P0', 'Setup navigator does not move the user', 'same screen after tapping a row');
  else if (jumpTaps > 3) add('P1', 'Jumping to a known step costs too many taps', `${jumpTaps} taps`);
  else pass('Jump to any step', `${jumpTaps} taps — "${after.heading}" (was "${before.heading}")`);

  // ---------- 5. "ALREADY DONE" IS ABSENT ON COMPREHENSION SCREENS ----------
  const skipAudit = await p.evaluate(() => {
    const steps = [...document.querySelectorAll('[data-kryo-step]')];
    return steps.map((st) => ({
      slug: st.getAttribute('data-slug'),
      locked: st.getAttribute('data-locked') === '1',
      critical: !!st.querySelector('.kryo-owner__note--critical'),
    }));
  });
  const leaky = skipAudit.filter((x) => x.critical && !x.locked);
  if (leaky.length) add('P0', '"Already done" offered on a safety-critical screen', leaky.map((x) => x.slug).join(', '));
  else pass('Safety screens cannot be skipped', `${skipAudit.filter((x) => x.locked).length} of ${skipAudit.length} steps locked to "I understand"`);

  // ---------- 6. STATE SURVIVES / DEEP LINKS / FOCUS ----------
  const deep = skipAudit[9].slug;
  await p.goto(url.split('#')[0] + '#' + deep, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  s = await state();
  if (s.screen !== 'step:' + deep) add('P1', 'Deep link does not open its step', `#${deep} landed on "${s.screen}"`);
  else pass('Deep links work', `#${deep} → "${s.heading}"`);

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(400);
  const afterReload = await state();
  if (!afterReload.screen.startsWith('step:')) add('P0', 'Refresh loses the owner’s position', `landed on "${afterReload.screen}"`);
  else pass('Refresh retains position', afterReload.screen);

  if (!/kryo-su__h1/.test(afterReload.focused))
    add('P1', 'Focus is not moved to the step heading', `focus on "${afterReload.focused || 'body'}"`);
  else pass('Focus moves to the step heading', 'screen readers announce the new step');

  if (afterReload.scrollY > 4) add('P1', 'New step does not start at the top', `scrollY ${afterReload.scrollY}`);
  else pass('Each step starts at the top', 'no mid-page landing');

  // ---------- 7. PROGRESS HONESTY ----------
  if (!/ · \d+ OF \d+$/.test(afterReload.progress.trim()))
    add('P1', 'Progress label is not chapter-relative', `saw "${afterReload.progress}"`);
  else pass('Progress is chapter-relative', afterReload.progress.trim());
  if (afterReload.segs.length !== 5) add('P1', 'Chapter segments do not match the chapter count', `${afterReload.segs.length} segments`);
  else pass('Five chapter segments', afterReload.segs.join(' / '));

  // A progress bar can exist in the DOM, report the right states, and still be a 16px sliver —
  // the UA stylesheet's align-items:flex-start on <button> did exactly that on 2026-08-02.
  // States are not enough; the indicator has to occupy the width it claims.
  const geo = await p.evaluate(() => {
    const bar = document.querySelector('[data-kryo-segs]');
    const prog = document.querySelector('[data-kryo-nav-open]');
    const segs = [...document.querySelectorAll('[data-seg]')].map((s) => Math.round(s.getBoundingClientRect().width));
    return { barW: Math.round(bar.getBoundingClientRect().width),
             progW: Math.round(prog.getBoundingClientRect().width),
             progH: Math.round(prog.getBoundingClientRect().height), segs };
  });
  const expected = geo.progW - 40; // 20px padding either side
  if (geo.barW < expected * 0.9)
    add('P0', 'Progress indicator is collapsed, not spanning the bar', `${geo.barW}px of an available ${expected}px`);
  else if (Math.min(...geo.segs) < expected / 5 * 0.8)
    add('P1', 'Chapter segments are unevenly sized', geo.segs.join('/'));
  else pass('Progress indicator spans the bar', `${geo.barW}px wide, segments ${geo.segs.join('/')}`);
  if (geo.progH < 44) add('P1', 'Progress tap target under 44px', `${geo.progH}px`);
  else pass('Progress is a full-width tap target', `${geo.progW}×${geo.progH}px`);

  // ---------- 8. REVIEW MODE ----------
  await p.evaluate(() => localStorage.setItem('kryo_setup_progress_v1',
    JSON.stringify({ currentChapter: 5, currentStep: 23, completedSteps: 24, setupComplete: true })));
  await p.goto(url.split('#')[0], { waitUntil: 'load' });
  await p.waitForTimeout(400);
  s = await state();
  const cards = await p.$$('[data-kryo-review-cards] .kryo-su__card');
  if (s.screen !== 'review') add('P0', 'A completed owner is put back in the wizard', `landed on "${s.screen}"`);
  else if (cards.length !== 5) add('P1', 'Review mode does not list five chapters', `${cards.length} cards`);
  else pass('Review mode for completed owners', `"${s.heading}" with ${cards.length} chapter cards`);

  // ---------- 9. DISTRACTIONS ----------
  const noise = await p.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('a,button')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const t = (el.innerText || '').trim();
      if (/add to cart|cart|shop|subscribe|newsletter|buy now|checkout/i.test(t)) bad.push(t.slice(0, 40));
    }
    return bad;
  });
  if (noise.length) add('P1', 'Ecommerce controls inside the owner flow', noise.join(', '));
  else pass('No ecommerce controls in the owner flow', 'cart/shop/newsletter all absent');

  if (errors.length) add('P0', 'JavaScript errors during the flow', errors.slice(0, 3).join(' | '));
  else pass('No JavaScript errors across the whole flow', `${taps + jumpTaps}+ interactions`);

  // Evidence shots at the primary viewport.
  await p.evaluate(() => localStorage.clear());
  await p.goto(url.split('#')[0], { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/flow-1-gate.png` });
  await p.fill('[data-kryo-gate-form] input[name="name"]', 'Test Owner');
  await p.fill('[data-kryo-gate-form] input[name="email"]', 'owner@example.com');
  await p.check('[data-kryo-gate-form] input[name="accept"]');
  await p.click('[data-kryo-next]'); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/flow-2-start.png` });
  await p.click('[data-kryo-next]'); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/flow-3-step.png` });
  await p.click('[data-kryo-nav-open]'); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/flow-4-navigator.png` });
  await p.click('[data-kryo-sheet="nav"] [data-kryo-sheet-close]'); await p.waitForTimeout(150);
  await p.click('[data-kryo-help-open]'); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/flow-5-help.png` });
} finally { await b.close(); }

const p0 = findings.filter((f) => f.sev === 'P0');
console.log(`\n  KRYO SETUP FLOW GATE — 390px — ${url}\n`);
for (const o of ok) console.log(`  PASS  ${o.what}\n        ${o.evidence}`);
if (findings.length) console.log('');
for (const f of findings) console.log(`  ${f.sev}  ${f.what}\n        ${f.evidence}`);
console.log(p0.length ? `\n  VERDICT: DO NOT SHIP — ${p0.length} P0\n` : `\n  VERDICT: SHIP — ${ok.length} checks passed, ${findings.length} non-blocking\n`);
try { fs.writeFileSync(`${out}/flow-findings.json`, JSON.stringify({ ok, findings }, null, 1)); } catch {}
process.exit(p0.length ? 1 : 0);
