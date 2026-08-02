#!/usr/bin/env node
/**
 * Mobile UX gate — measures what a full-page screenshot cannot.
 *
 * Exists because on 2026-08-01 a page passed visual QC on a desktop screenshot while the
 * mobile experience had no header, an image that pushed the instruction below the fold, and
 * navigation costing 20+ taps. Renders-without-errors is not usability.
 *
 * Usage: node scripts/qc-mobile-ux.mjs <url> [outdir]
 * Exit 0 = SHIP. Exit 1 = DO NOT SHIP (P0 present).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2];
const out = process.argv[3] || '/tmp';
if (!url) { console.log('usage: qc-mobile-ux.mjs <url> [outdir]'); process.exit(1); }

const VIEWPORTS = [{ w: 320, h: 700 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 430, h: 932 }];
const findings = [];
const add = (sev, what, evidence, vp) => findings.push({ sev, what, evidence, vp });

const b = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await b.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const p = await ctx.newPage();
    const resp = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    const html = await p.content();

    // INSTRUMENT VALIDATION — a rate-limit stub is not the page.
    // file:// URLs legitimately return a null response; only the body size decides there.
    if ((!resp && !url.startsWith('file:')) || html.length < 5000) {
      console.log(JSON.stringify({ ok: false, blocked: true,
        reason: `stub response (${html.length} bytes) — rate limited, NOT a page defect`, viewport: vp.w }, null, 1));
      await b.close(); process.exit(2);
    }

    const m = await p.evaluate(() => {
      const vpH = window.innerHeight;
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0; };
      const all = [...document.querySelectorAll('a,button,summary,input,select,[role="button"]')].filter(vis);

      // Smallest touch target among visible controls.
      // The EFFECTIVE hit area is what the thumb has to hit: a checkbox inside a <label>
      // is activated by tapping anywhere on that label, so the label's box is the target.
      const hitBox = (el) => {
        const own = el.getBoundingClientRect();
        const lab = (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? el.closest('label') : null;
        if (!lab) return own;
        const l = lab.getBoundingClientRect();
        return Math.min(l.width, l.height) > Math.min(own.width, own.height) ? l : own;
      };
      let smallest = null;
      for (const el of all) {
        const r = hitBox(el);
        const d = Math.min(r.width, r.height);
        if (smallest === null || d < smallest.d)
          smallest = { d: Math.round(d), w: Math.round(r.width), h: Math.round(r.height),
                       t: (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 32) };
      }

      // Chrome consumed above the first content
      const h1 = document.querySelector('h1');
      const h1Top = h1 ? Math.round(h1.getBoundingClientRect().top + window.scrollY) : null;

      // Is a primary action reachable without scrolling, in the bottom third?
      // Navigation is not a primary action. Without this, a "Fill & start" nav chip was
      // judged as an undersized primary button.
      const prim = all.filter(el => !el.closest('nav')
        && /next|begin|start|continue|understand|done|here|checked|connected/i.test(el.innerText || ''));
      const primIn = prim.map(el => { const r = el.getBoundingClientRect();
        return { text: (el.innerText || '').trim().slice(0, 24), top: Math.round(r.top),
                 inView: r.top >= 0 && r.bottom <= vpH, bottomThird: r.top > vpH * 0.66,
                 // A consent/registration action belongs AFTER the text it consents to.
                 // Requiring it above the fold would be wrong, so it is judged separately.
                 inForm: !!el.closest('form'),
                 h: Math.round(r.height) }; });

      // Instruction visible on first screen?
      const paras = [...document.querySelectorAll('p,li')].filter(vis)
        .map(el => ({ top: Math.round(el.getBoundingClientRect().top), len: (el.innerText || '').trim().length }))
        .filter(x => x.len > 40);
      const firstInstruction = paras.length ? Math.min(...paras.map(x => x.top)) : null;

      // Distractions that do not belong in an operating interface
      const noise = [];
      for (const el of document.querySelectorAll('*')) {
        if (!vis(el)) continue;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 90) continue;
        if (/add to cart|subscribe|newsletter|shop now|free shipping|sale|% off|cart \(/i.test(t)) {
          const tag = el.tagName + '.' + (el.className || '').toString().slice(0, 24);
          if (!noise.includes(tag)) noise.push(tag);
        }
      }

      // Horizontal overflow
      const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

      return { smallest, h1Top, primIn, firstInstruction, noise: noise.slice(0, 6), overflow,
               docH: document.documentElement.scrollHeight,
               hasHeader: !!document.querySelector('[data-kryo-ownerbar],header'), vpH };
    });

    if (vp.w === 390) {
      await p.screenshot({ path: `${out}/ux-390-viewport.png` });          // judgement shot
      await p.screenshot({ path: `${out}/ux-390-full.png`, fullPage: true }); // length only
    }

    if (m.overflow > 0) add('P0', 'Horizontal scroll — page wider than the screen', `${m.overflow}px overflow`, vp.w);
    if (m.smallest && m.smallest.d < 44) add('P0', `Touch target below 44px: "${m.smallest.t}"`, `${m.smallest.w}x${m.smallest.h}px`, vp.w);
    else if (m.smallest && m.smallest.d < 48) add('P1', `Touch target below 48px: "${m.smallest.t}"`, `${m.smallest.w}x${m.smallest.h}px`, vp.w);
    if (m.firstInstruction !== null && m.firstInstruction > m.vpH)
      add('P0', 'Instruction is below the fold — user cannot see what to do', `first instruction at ${m.firstInstruction}px, viewport ${m.vpH}px`, vp.w);
    if (m.h1Top !== null && m.h1Top > m.vpH * 0.35)
      add('P1', 'Too much chrome before the heading', `h1 at ${m.h1Top}px = ${Math.round(100 * m.h1Top / m.vpH)}% of viewport`, vp.w);
    // Form submits are excluded: on a consent screen the button must follow the text.
    const actions = m.primIn.filter(x => !x.inForm);
    const reachable = actions.filter(x => x.inView);
    if (actions.length && !reachable.length)
      add('P0', 'Primary action requires scrolling to find', `${actions.length} candidates, none in viewport`, vp.w);
    const shortBtn = m.primIn.find(x => x.h && x.h < 54);
    if (shortBtn) add('P1', `Primary button under 54px high: "${shortBtn.text}"`, `${shortBtn.h}px`, vp.w);
    if (m.noise.length) add('P1', 'Ecommerce distractions inside an operating interface', m.noise.join(', '), vp.w);
    if (!m.hasHeader) add('P1', 'No owner header / brand identity', 'no header element found', vp.w);

    await ctx.close();
  }
} finally { await b.close(); }

const p0 = findings.filter(f => f.sev === 'P0');
const uniq = [...new Map(findings.map(f => [f.sev + f.what, f])).values()];
console.log(`\n  MOBILE UX GATE — ${url}\n`);
if (!uniq.length) console.log('  no findings\n');
for (const f of uniq.sort((a, b2) => a.sev.localeCompare(b2.sev)))
  console.log(`  ${f.sev}  ${f.what}\n       ${f.evidence}  @${f.vp}px\n`);
console.log(p0.length ? `  VERDICT: DO NOT SHIP — ${p0.length} P0 finding(s)\n` : '  VERDICT: SHIP\n');
try { fs.writeFileSync(`${out}/ux-findings.json`, JSON.stringify(uniq, null, 1)); } catch {}
process.exit(p0.length ? 1 : 0);
