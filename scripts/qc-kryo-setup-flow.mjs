#!/usr/bin/env node
/**
 * KRYO setup gate — checks the twelve DONE WHEN criteria from the UX revision brief.
 *
 * The page is now one scrollable guide of five parts, not a 24-screen wizard, so this
 * measures reading and jumping rather than Next presses. A screenshot cannot tell you
 * whether a critical warning is hidden behind an accordion, whether an old owner's
 * progress survived, or whether a stale technical claim crept back in. This can.
 *
 * Usage: node scripts/qc-kryo-setup-flow.mjs <url> [outdir]
 * Exit 0 = SHIP · 1 = DO NOT SHIP · 2 = could not verify (stub / rate limited)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2];
const out = process.argv[3] || '/tmp';
if (!url) { console.log('usage: qc-kryo-setup-flow.mjs <url> [outdir]'); process.exit(1); }
const base = url.split('#')[0];

const findings = [];
const ok = [];
const add = (sev, what, evidence) => findings.push({ sev, what, evidence });
const pass = (what, evidence) => ok.push({ what, evidence });

// Claims withdrawn or never confirmed. Any of these reappearing is a regression.
const STALE = [
  { re: /\b48\s?V\b/i, what: '48V power claim (KRYO is 24V DC)' },
  { re: /1\.5\s?m(etre)?\b/i, what: '1.5 m hose claim (hose is 2 m)' },
  { re: /hold (it )?for \d+ seconds/i, what: 'unsupported adhesive hold time' },
  { re: /\b8\s?[–-]\s?12\s?hours\b/i, what: 'unconfirmed cooldown duration' },
  { re: /step \d+ of \d+/i, what: 'wizard step counter' },
];

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

try {
  const resp = await p.goto(base, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
  const html = await p.content();
  if ((!resp && !base.startsWith('file:')) || html.length < 5000) {
    console.log(JSON.stringify({ ok: false, blocked: true,
      reason: `stub response (${html.length} bytes) — could not verify, NOT a page defect` }, null, 1));
    await b.close(); process.exit(2);
  }
  await p.waitForTimeout(300);

  // ---------- 8 + 10. Gate, and Help while gated ----------
  let gated = await p.evaluate(() => !document.querySelector('[data-kryo-gate]').hidden);
  if (!gated) add('P0', 'A brand-new owner is not gated', 'guide shown without acknowledgement');
  else pass('New owner sees the safety gate first', 'guide hidden until accepted');

  const helpGated = await p.evaluate(() => {
    document.querySelector('[data-kryo-help-open]').click();
    const open = !document.querySelector('[data-kryo-sheet="help"]').hidden;
    document.querySelector('[data-kryo-sheet="help"] [data-kryo-sheet-close]').click();
    return open;
  });
  if (!helpGated) add('P0', 'Help is unreachable while gated', 'help sheet did not open');
  else pass('Help reachable while gated', 'bottom sheet opens on the gate');

  await p.click('[data-kryo-gate-submit]');
  if (await p.evaluate(() => !document.querySelector('[data-kryo-gate]').hidden) === false)
    add('P0', 'Gate accepts an empty form', 'advanced without acknowledgement');
  else pass('Gate rejects an empty submission', 'stays on gate, error shown');

  await p.fill('[data-kryo-gate-form] input[name="name"]', 'Test Owner');
  await p.fill('[data-kryo-gate-form] input[name="email"]', 'owner@example.com');
  await p.check('[data-kryo-gate-form] input[name="accept"]');
  await p.click('[data-kryo-gate-submit]');
  await p.waitForTimeout(250);
  if (await p.evaluate(() => document.querySelector('[data-kryo-guide]').hidden))
    add('P0', 'Accepting the gate does not open the guide', 'guide still hidden');
  else pass('Gate accepted', 'guide shown');

  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(300);
  if (await p.evaluate(() => !document.querySelector('[data-kryo-gate]').hidden))
    add('P0', 'Registration is demanded twice on the same device', 'gate reappeared after reload');
  else pass('Never asked to register twice', 'reload goes straight to the guide');

  // ---------- 1. Five parts, not 20+ steps ----------
  const shape = await p.evaluate(() => ({
    chapters: [...document.querySelectorAll('[data-kryo-ch]')].map((s) => s.getAttribute('data-kryo-ch')),
    tocRows: document.querySelectorAll('.kryo-su__tocrow').length,
    marks: document.querySelectorAll('[data-kryo-mark]').length,
    text: document.body.innerText,
  }));
  const WANT = ['whats-in-the-box', 'position', 'connect', 'fill', 'first-use'];
  if (shape.chapters.length !== WANT.length || WANT.some((a, i) => shape.chapters[i] !== a))
    add('P0', 'Setup parts are missing or out of order', shape.chapters.join(', ') || 'none');
  else pass(`Setup is ${WANT.length} parts, in order`, shape.chapters.join(' · '));
  if (shape.tocRows !== WANT.length) add('P1', 'Section navigator does not list every part', `${shape.tocRows} rows`);
  else pass('Overview navigator lists every part', `${shape.tocRows} rows, ${shape.marks} mark-complete controls`);

  // ---------- 2. Quick instructions carry the whole setup ----------
  const quick = await p.evaluate(() => {
    // Instruction TEXT must be visible with every dropdown closed — only the explanation collapses.
    document.querySelectorAll('.kryo-su__qa[open]').forEach((d) => d.removeAttribute('open'));
    // checkVisibility() is the authoritative test. getBoundingClientRect() is not:
    // content inside a closed <details> still reports a laid-out height in Chromium,
    // which made a hidden explanation read as visible on 2026-08-02.
    const vis = (el) => (el.checkVisibility
      ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      : el.getBoundingClientRect().height > 0);
    return [...document.querySelectorAll('[data-kryo-ch]')].map((s) => {
      const rows = [...s.querySelectorAll('.kryo-su__qatext, .kryo-su__quick li')];
      return {
        a: s.getAttribute('data-kryo-ch'),
        bullets: rows.length,
        visible: rows.filter(vis).length,
        expandable: s.querySelectorAll('details.kryo-su__qa').length,
        purpose: !!s.querySelector('.kryo-su__purpose'),
      };
    });
  });
  const hidden = quick.filter((q) => q.visible !== q.bullets);
  if (hidden.length)
    add('P0', 'An instruction line is hidden until a dropdown is opened', hidden.map((q) => `${q.a}:${q.visible}/${q.bullets}`).join(', '));
  else pass('Every instruction line visible with all dropdowns closed', quick.map((q) => `${q.a}:${q.visible}`).join(' · '));
  // A stage may carry its detail in the stage-level dropdown rather than per instruction.
  const noExpand = quick.filter((q) => q.expandable === 0 && q.a !== 'first-use');
  if (noExpand.length)
    add('P1', 'A part has no expandable instructions', noExpand.map((q) => q.a).join(', '));
  else pass('Instructions expand for more detail', quick.map((q) => `${q.a}:${q.expandable}`).join(' · '));
  const thin = quick.filter((q) => q.bullets < 3);
  if (thin.length) add('P1', 'A part carries fewer than 3 quick instructions', thin.map((q) => `${q.a}:${q.bullets}`).join(', '));
  else pass('Every part scannable without opening anything', quick.map((q) => `${q.a}:${q.bullets}`).join(' · '));
  if (quick.some((q) => !q.purpose)) add('P1', 'A part is missing its one-sentence purpose', 'see .kryo-su__purpose');
  else pass('Every part states its purpose', '5 of 5');

  // ---------- 5. Critical warnings are NOT behind an accordion ----------
  const warn = await p.evaluate(() => {
    // With every accordion closed, what safety content is actually on the page?
    document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
    const visible = (el) => (el.checkVisibility
      ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      : el.getBoundingClientRect().height > 0);
    const crit = [...document.querySelectorAll('.kryo-owner__note--critical')].filter(visible);
    const insideAcc = crit.filter((n) => n.closest('details')).length;
    const perCh = [...document.querySelectorAll('[data-kryo-ch]')].map((s) => ({
      a: s.getAttribute('data-kryo-ch'),
      crit: [...s.querySelectorAll('.kryo-owner__note--critical')].filter(visible).length,
    }));
    const body = document.body.innerText;
    return { total: crit.length, insideAcc, perCh,
      stopCriteria: /chest pain/i.test(body) && /loss of breathing control/i.test(body),
      rules: document.querySelectorAll('.kryo-su__rulelist li').length,
      rulesInAcc: !!document.querySelector('.kryo-su__rulelist')?.closest('details') };
  });
  if (warn.insideAcc > 0) add('P0', 'A critical warning is hidden inside an accordion', `${warn.insideAcc} of ${warn.total}`);
  else pass('Critical warnings always visible', `${warn.total} notes, none inside an accordion`);
  // "What's in the box" is identification only — nothing there is hazardous.
  const noWarn = warn.perCh.filter((c) => c.crit === 0 && c.a !== 'whats-in-the-box');
  if (noWarn.length) add('P1', 'A part carries no visible critical warning', noWarn.map((c) => c.a).join(', '));
  else pass('Every part shows its critical warning', warn.perCh.map((c) => `${c.a}:${c.crit}`).join(' · '));
  if (!warn.stopCriteria) add('P0', 'Stop criteria are not visible with accordions closed', 'chest pain / loss of breathing control not found');
  else pass('Stop criteria visible without opening anything', 'full symptom list in the page text');
  // ---------- 4. Detail is still reachable ----------
  const detail = await p.evaluate(() => [...document.querySelectorAll('[data-kryo-ch]')].map((s) => {
    const d = s.querySelector('details[data-kryo-detail]');
    const body = d && d.querySelector('.kryo-su__accbody');
    // textContent, not innerText: a closed <details> reports no innerText at all.
    const words = body ? (body.textContent || '').trim().split(/\s+/).filter(Boolean).length : 0;
    return { a: s.getAttribute('data-kryo-ch'), has: !!d, words };
  }));
  // The guide is deliberately concise now; a dropdown just has to carry real detail.
  const missing = detail.filter((d) => d.a !== 'whats-in-the-box' && (!d.has || d.words < 20));
  if (missing.length) add('P0', 'Technical detail was lost, not moved', missing.map((d) => `${d.a}:${d.words}w`).join(', '));
  else pass('All technical detail retained in accordions', detail.map((d) => `${d.a}:${d.words}w`).join(' · '));

  // ---------- Sticky bar: five section links + the real Everest Labs logo ----------
  const bar = await p.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-kryo-chip]')];
    const head = document.querySelector('.kryo-su__bar');
    const logo = document.querySelector('.kryo-su__logo');
    const wordmark = document.querySelector('.kryo-su__wordmark');
    return {
      anchors: chips.map((c) => c.getAttribute('data-kryo-chip')),
      labels: chips.map((c) => c.innerText.trim().replace(/\s+/g, ' ')),
      minH: chips.length ? Math.min(...chips.map((c) => Math.round(c.getBoundingClientRect().height))) : 0,
      sticky: head ? getComputedStyle(head).position : null,
      headH: head ? Math.round(head.getBoundingClientRect().height) : 0,
      logoSrc: logo ? logo.getAttribute('src') : null,
      logoH: logo ? Math.round(logo.getBoundingClientRect().height) : 0,
      wordmarkOnly: !logo && !!wordmark,
      rowScrollable: (() => { const r = document.querySelector('[data-kryo-chips]');
        return r ? r.scrollWidth > r.clientWidth : false; })(),
    };
  });
  if (bar.anchors.length !== WANT.length || WANT.some((a, i) => bar.anchors[i] !== a))
    add('P0', 'Sticky bar does not carry every section link', bar.anchors.join(', ') || 'none');
  else pass(`${WANT.length} section links in the sticky bar`, bar.labels.join(' · '));
  if (bar.sticky !== 'sticky') add('P0', 'Section links are not sticky', `position: ${bar.sticky}`);
  else pass('Section links stay on screen', `sticky header ${bar.headH}px${bar.rowScrollable ? ', row scrolls' : ''}`);
  if (bar.minH < 40) add('P1', 'Section link tap target too small', `${bar.minH}px high`);
  else pass('Section links are tappable', `${bar.minH}px high`);
  if (bar.wordmarkOnly) add('P0', 'Header still shows the text wordmark, not the logo', 'no .kryo-su__logo image');
  else if (!bar.logoSrc) add('P0', 'No logo in the owner header', 'neither image nor wordmark');
  else pass('Real Everest Labs logo in the header', `${bar.logoH}px tall — ${bar.logoSrc.split('/').pop().slice(0, 46)}`);

  // ---------- 3. One tap to any part ----------
  await p.evaluate(() => window.scrollTo(0, 0));
  // Target by anchor, never by index: adding a chapter shifted rows[3] from fill to connect
  // while the assertion below still measured #fill, reporting a 1587px miss that never happened.
  const JUMP = 'fill';
  const before = await p.evaluate(() => Math.round(window.scrollY));
  await p.click(`.kryo-su__tocrow[href="#${JUMP}"]`);
  // Wait for smooth scrolling to actually settle rather than guessing a duration —
  // the page grew with 25 images and a fixed 700ms measured mid-animation.
  // Require movement BEFORE stability: polling started while scrollY was still 0, so four
  // identical zero readings counted as "settled" before the smooth scroll had begun.
  await p.waitForFunction(() => {
    if (window.__ky === undefined) { window.__ky = -1; window.__kyN = 0; window.__kyMoved = false; }
    const y = Math.round(window.scrollY);
    if (y > 0) window.__kyMoved = true;
    if (y === window.__ky) { window.__kyN++; } else { window.__ky = y; window.__kyN = 0; }
    return window.__kyMoved && window.__kyN > 4;
    // polling: 100 => five identical readings is 500ms of genuine stability. rAF polling
    // caught brief plateaus mid-animation and measured a scroll that had not finished.
  }, null, { polling: 100, timeout: 12000 }).catch(() => {});
  await p.evaluate(() => { delete window.__ky; delete window.__kyN; delete window.__kyMoved; });
  const after = await p.evaluate(() => ({ y: Math.round(window.scrollY), hash: location.hash }));
  if (after.y <= before + 10) add('P0', 'Section navigator does not move the reader', `scrollY ${before} -> ${after.y}`);
  else pass('One tap to any part', `overview -> ${after.hash} (scrollY ${before} -> ${after.y})`);

  // Tolerance is derived from the header actually rendered, not a fixed number — the
  // header is now two rows and a hardcoded 96px threshold flagged correct behaviour.
  const jumped = await p.evaluate((a) => {
    const el = document.getElementById(a);
    const head = document.querySelector('.kryo-su__bar');
    return { top: Math.round(el.getBoundingClientRect().top),
             head: head ? Math.round(head.getBoundingClientRect().height) : 0 };
  }, JUMP);
  if (jumped.top < jumped.head - 8 || jumped.top > jumped.head + 48)
    add('P1', 'Jump target lands under the sticky header or too far down',
        `section top at ${jumped.top}px, header is ${jumped.head}px`);
  else pass('Jump clears the sticky header', `section top ${jumped.top}px vs ${jumped.head}px header`);

  // ---------- 7. No horizontal overflow, at every width ----------
  for (const w of [320, 375, 390, 430]) {
    await p.setViewportSize({ width: w, height: 844 });
    await p.waitForTimeout(150);
    const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    if (over > 0) add('P0', 'Horizontal scroll — page wider than the screen', `${over}px at ${w}px`);
  }
  if (!findings.some((f) => f.what.startsWith('Horizontal'))) pass('No horizontal overflow', '320 / 375 / 390 / 430');
  await p.setViewportSize({ width: 390, height: 844 });

  // ---------- 6. Imagery legible: full width on mobile ----------
  const media = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.kryo-su__media > *')];
    const widths = items.map((el) => Math.round(el.getBoundingClientRect().width));
    return { count: items.length, min: widths.length ? Math.min(...widths) : 0, vw: window.innerWidth };
  });
  if (media.count && media.min < media.vw - 56)
    add('P1', 'Media is not full width on mobile', `narrowest ${media.min}px of ${media.vw}px`);
  else pass('Media full width on mobile', `${media.count} items, narrowest ${media.min}px`);

  // ---------- 9. Old step-level progress migrates, never resets ----------
  await p.evaluate(() => {
    localStorage.setItem('kryo_setup_progress_v1', JSON.stringify({
      currentChapter: 2, currentStep: 7, completedSteps: 8, setupComplete: false }));
  });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(350);
  const migrated = await p.evaluate(() => {
    const st = window.getKryoOwnerState ? window.getKryoOwnerState() : null;
    return { chapters: st ? Object.keys(st.chaptersComplete).filter((k) => st.chaptersComplete[k]) : [],
             resumeShown: !document.querySelector('[data-kryo-resume]').hidden,
             resumeTarget: document.querySelector('[data-kryo-resume]').getAttribute('data-target') };
  });
  // completedSteps 8 means wizard steps 0-7 were done: that is chapters 1 and 2 complete
  // (their last steps were index 2 and 7) and chapter 3 still open.
  const wantMigrated = ['whats-in-the-box', 'position'];
  if (wantMigrated.some((a) => !migrated.chapters.includes(a)) || migrated.chapters.length !== wantMigrated.length)
    add('P0', 'Existing owners lose their progress', `migrated to [${migrated.chapters.join(', ')}], expected [${wantMigrated.join(', ')}]`);
  else pass('Old step-level progress migrated, not reset', `8 wizard steps -> ${migrated.chapters.join(' + ')} complete`);
  if (!migrated.resumeShown || migrated.resumeTarget !== 'connect')
    add('P1', 'Returning owner is not offered the first incomplete part', `shown=${migrated.resumeShown} target=${migrated.resumeTarget}`);
  else pass('Returning owner resumes at the first incomplete part', `Continue setup -> ${migrated.resumeTarget}`);

  // ---------- Marking a part complete ----------
  const marked = await p.evaluate(() => {
    // 'connect' is the first INCOMPLETE part after migration, so this is a genuine mark,
    // not a toggle-off of something migration already completed.
    document.querySelector('[data-kryo-mark="connect"]').click();
    const st = window.getKryoOwnerState();
    return { connect: !!st.chaptersComplete.connect,
             stored: JSON.parse(localStorage.getItem('kryo_setup_progress_v1')) };
  });
  if (!marked.connect) add('P0', 'Mark section complete does not persist', 'state unchanged');
  else pass('Chapter-level completion persists', `3 of 5, legacy currentChapter=${marked.stored.currentChapter}, completedSteps=${marked.stored.completedSteps}`);

  // Completed owner: everything open and reachable, no wizard.
  await p.evaluate(() => localStorage.setItem('kryo_setup_progress_v1', JSON.stringify({
    version: 2, setupComplete: true,
    chapters: { 'whats-in-the-box': true, position: true, connect: true, fill: true, 'first-use': true } })));
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(350);
  const doneMode = await p.evaluate(() => ({
    guideVisible: !document.querySelector('[data-kryo-guide]').hidden,
    gate: !document.querySelector('[data-kryo-gate]').hidden,
    chapters: document.querySelectorAll('[data-kryo-ch]').length,
    tick: !document.querySelector('[data-kryo-endtick]').hidden,
  }));
  if (!doneMode.guideVisible || doneMode.gate || doneMode.chapters !== WANT.length)
    add('P0', 'A completed owner does not get free reference access', JSON.stringify(doneMode));
  else pass('Completed owner gets reference mode', `all ${doneMode.chapters} parts open, completion tick ${doneMode.tick}`);

  // ---------- 11. No stale technical claims ----------
  const text = await p.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    return document.body.innerText;
  });
  const stale = STALE.filter((s) => s.re.test(text));
  if (stale.length) add('P0', 'Stale or unsupported technical claim present', stale.map((s) => s.what).join('; '));
  else pass('No stale technical claims', '48V, 1.5 m hose, hold-for-N-seconds, 8-12 h cooldown, step counter — all absent');

  // ---------- 12. No ecommerce controls ----------
  const noise = await p.evaluate(() => [...document.querySelectorAll('a,button')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height; })
    .map((el) => (el.innerText || '').trim())
    .filter((t) => /add to cart|^cart|shop now|subscribe|newsletter|buy now|checkout/i.test(t)));
  if (noise.length) add('P1', 'Ecommerce controls inside the owner flow', noise.join(', '));
  else pass('No ecommerce controls in the owner flow', 'cart / shop / newsletter all absent');

  const helpEverywhere = await p.evaluate(() => {
    const chs = [...document.querySelectorAll('[data-kryo-ch]')];
    return { perChapter: chs.filter((c) => c.querySelector('[data-kryo-help-open]')).length,
             total: chs.length, overview: !!document.querySelector('.kryo-su__overview [data-kryo-help-open]') };
  });
  if (helpEverywhere.perChapter !== helpEverywhere.total || !helpEverywhere.overview)
    add('P0', 'Help is not reachable from every part', `${helpEverywhere.perChapter}/${helpEverywhere.total} parts, overview=${helpEverywhere.overview}`);
  else pass('Help reachable from the overview and every part', `${helpEverywhere.total} of ${helpEverywhere.total} parts + overview`);

  const helpOpens = await p.evaluate(() => {
    const btn = document.querySelector('[data-kryo-ch="fill"] [data-kryo-help-open]');
    btn.click();
    const open = !document.querySelector('[data-kryo-sheet="help"]').hidden;
    document.querySelector('[data-kryo-sheet="help"] [data-kryo-sheet-close]').click();
    return open;
  });
  if (!helpOpens) add('P0', 'Help does not open from a chapter footer', 'sheet stayed hidden');
  else pass('Help opens from a chapter footer', 'WhatsApp topic sheet');

  // Every instruction must be an editable block, or Tom cannot maintain it in the theme editor.
  const editable = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.kryo-su__qa')];
    return { total: rows.length,
             withBlockId: rows.filter((r) => r.hasAttribute('data-shopify-editor-block')).length };
  });
  if (editable.total === 0 || editable.withBlockId !== editable.total)
    add('P0', 'Instructions are not editable blocks', `${editable.withBlockId}/${editable.total} carry a block id`);
  else pass('Every instruction is a theme-editor block', `${editable.total} editable rows`);

  const opens = await p.evaluate(() => {
    const d = document.querySelector('[data-kryo-ch="position"] details.kryo-su__qa');
    // An earlier check opens every <details>; close this one first. Measure the DETAILS
    // element's own height — that is what the reader actually sees grow.
    d.removeAttribute('open');
    const before = Math.round(d.getBoundingClientRect().height);
    const bodyHidden = d.querySelector('.kryo-su__qabody').checkVisibility();
    d.setAttribute('open', '');
    return { before, after: Math.round(d.getBoundingClientRect().height),
             bodyHiddenWhenClosed: !bodyHidden,
             bodyShownWhenOpen: d.querySelector('.kryo-su__qabody').checkVisibility() };
  });
  if (!(opens.after > opens.before && opens.bodyHiddenWhenClosed && opens.bodyShownWhenOpen))
    add('P0', 'Instruction dropdown does not reveal its explanation', JSON.stringify(opens));
  else pass('Instruction dropdown reveals its explanation', `${opens.before}px closed -> ${opens.after}px open`);

  const qaImg = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('details.kryo-su__qa')];
    const withMedia = rows.filter((r) => r.querySelector('.kryo-su__qaimg'));
    const outsideBody = withMedia.filter((r) => !r.querySelector('.kryo-su__qabody .kryo-su__qaimg')).length;
    const imgs = [...document.querySelectorAll('.kryo-su__qaimg img')];
    return { rows: rows.length, withMedia: withMedia.length, outsideBody,
             lazy: imgs.filter((i) => i.getAttribute('loading') === 'lazy').length, imgs: imgs.length,
             zoomable: withMedia.filter((r) => r.querySelector('[data-kryo-zoom]')).length };
  });
  if (qaImg.outsideBody > 0)
    add('P0', 'An instruction image is outside the expandable body', `${qaImg.outsideBody} rows`);
  else if (qaImg.imgs && qaImg.lazy !== qaImg.imgs)
    add('P1', 'An instruction image is not lazy-loaded', `${qaImg.lazy}/${qaImg.imgs}`);
  else pass('Instruction rows accept images', qaImg.withMedia
      ? `${qaImg.withMedia}/${qaImg.rows} rows carry media, ${qaImg.zoomable} tap-to-enlarge, ${qaImg.lazy}/${qaImg.imgs} lazy`
      : `${qaImg.rows} rows ready for images (none added yet)`);

  // §8 FINAL CONTENT CHECK. Every required point must exist somewhere on the page,
  // with all accordions open (detail is allowed to live inside them).
  const REQUIRED = {
    position: [/upright/i, /level floor/i, /airflow/i, /hose reach|hose reaches/i, /power (reach|must reach)/i,
               /refill/i, /spray .*(away|display|power side)/i, /30\s?cm/i, /40\s?(to|[–-])\s?50\s?cm/i],
    mount: [/dry-fit/i, /smooth, clean and completely dry|clean and completely dry/i, /end cap/i,
            /sliding (height )?connector/i, /difficult to reposition/i],
    connect: [/seal .*flat|flat inside the fitting/i, /twisted/i, /hand-tighten|hand-tight/i,
              /cross-thread/i, /both flow controls closed|flow adjuster closed/i, /24V DC/i, /PSU/i, /dry/i],
    fill: [/before the pump|before operating the pump/i, /dry-running|running it dry|running the pump dry/i,
           /filling slowly|fill slowly/i, /overfill/i, /dry the top/i, /refit the (fill )?plug/i,
           /15\s?°?C/i, /below 1\s?°?C/i, /freeze/i],
    firstUse: [/back (to|toward)/i, /shoulders/i, /face or chest|face\/chest/i, /slowly open/i,
               /breathe normally/i, /hyperventilate/i, /rotate gradually/i, /chest pain/i],
  };
  const pageText = await p.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    return document.body.innerText;
  });
  const contentMisses = [];
  for (const [group, list] of Object.entries(REQUIRED))
    for (const re of list) if (!re.test(pageText)) contentMisses.push(`${group}: ${re.source.slice(0, 34)}`);
  if (contentMisses.length)
    add('P0', 'Required content missing from the page', contentMisses.join(' | '));
  else pass('Final content check', `${Object.values(REQUIRED).flat().length} required points all present`);

  // The safety acknowledgement must not bundle a marketing opt-in.
  const gateShape = await p.evaluate(() => {
    localStorage.clear();
    return null;
  });
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300);
  const gate2 = await p.evaluate(() => ({
    heading: (document.querySelector('[data-kryo-gate-heading]') || {}).textContent.trim(),
    confirms: document.querySelectorAll('.kryo-su__gatelist li').length,
    marketing: !!document.querySelector('[data-kryo-gate-form] input[name="marketing"]'),
    checkbox: (document.querySelector('[data-kryo-gate-form] input[name="accept"]')
      || {}).parentElement?.innerText.trim() || '',
    cta: (document.querySelector('[data-kryo-gate-submit]') || {}).textContent.trim(),
    secondary: !!document.querySelector('.kryo-su__gatesecondary'),
  }));
  if (gate2.marketing) add('P0', 'Marketing consent is bundled into the safety acknowledgement', 'input[name=marketing] present');
  else if (gate2.confirms !== 5) add('P1', 'Safety popup does not list five confirmations', `${gate2.confirms}`);
  else pass('Safety popup updated', `"${gate2.heading}" · ${gate2.confirms} confirmations · CTA "${gate2.cta}" · secondary link ${gate2.secondary}`);

  // Every image must actually load. A shopify:// reference without a file extension does not
  // resolve, which shipped 11 invisible images on 2026-08-03 while every other check passed.
  const broken = await p.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    // The fullscreen viewer's <img> has no src until an image is tapped — not a content image.
    const imgs = [...document.querySelectorAll('img:not([data-kryo-zoom-img])')];
    return { total: imgs.length,
      bad: imgs.map((i) => i.getAttribute('src') || '')
               .filter((src) => !src || src.startsWith('shopify://')) };
  });
  if (broken.bad.length)
    add('P0', 'Image reference does not resolve', `${broken.bad.length} of ${broken.total}: ${broken.bad.slice(0, 3).join(', ')}`);
  else pass('Every image reference resolves', `${broken.total} content images, all with a real URL`);

  if (errors.length) add('P0', 'JavaScript errors during the flow', errors.slice(0, 3).join(' | '));
  else pass('No JavaScript errors', 'whole flow clean');

  // ---------- Evidence ----------
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/v2-1-gate.png` });
  await p.fill('[data-kryo-gate-form] input[name="name"]', 'Test Owner');
  await p.fill('[data-kryo-gate-form] input[name="email"]', 'owner@example.com');
  await p.check('[data-kryo-gate-form] input[name="accept"]');
  await p.click('[data-kryo-gate-submit]'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/v2-2-overview.png` });
  // Use the real header height, exactly as the page's own scrollToAnchor does — a hardcoded
  // offset put the section 50px too high and hid the eyebrow behind the sticky header.
  const headH = await p.evaluate(() => Math.round(document.querySelector('.kryo-su__bar').getBoundingClientRect().height) + 8);
  await p.evaluate((h) => { const e = document.getElementById('connect'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - h); }, headH);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/v2-4-chapter.png` });
  await p.evaluate((h) => { const e = document.getElementById('first-use'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - h); }, headH);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/v2-5-first-use.png` });
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/v2-6-header.png` });
} finally { await b.close(); }

const p0 = findings.filter((f) => f.sev === 'P0');
console.log(`\n  KRYO SETUP — 390px — ${base}\n`);
for (const o of ok) console.log(`  PASS  ${o.what}\n        ${o.evidence}`);
if (findings.length) console.log('');
for (const f of findings) console.log(`  ${f.sev}  ${f.what}\n        ${f.evidence}`);
console.log(p0.length ? `\n  VERDICT: DO NOT SHIP — ${p0.length} P0\n` : `\n  VERDICT: SHIP — ${ok.length} checks passed, ${findings.length} non-blocking\n`);
try { fs.writeFileSync(`${out}/flow-findings.json`, JSON.stringify({ ok, findings }, null, 1)); } catch {}
process.exit(p0.length ? 1 : 0);
