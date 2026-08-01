#!/usr/bin/env node
/**
 * Belief-revision checker.
 *
 * Two failures it exists to prevent, both observed on 2026-07-31:
 *
 * 1. A load-bearing fact ("6 completed checkouts = 6 real sales") was disproven. Three dependent
 *    findings were flagged BY HAND and a fourth was missed — it is still asserting the dead fact.
 *    Manual invalidation is incomplete invalidation.
 *
 * 2. Facts go stale silently. CURRENT-STATE.md carries review-by dates; nothing checked them.
 *
 * Conclusions declare what they rest on:
 *     ---
 *     depends-on: [money.sales_lifetime, delivery.winner_ad]
 *     ---
 * When a fact is superseded, every dependent conclusion is flagged automatically.
 *
 * Exit 0 = clean.  Exit 1 = stale conclusions or overdue facts.
 */
import fs from 'node:fs';
import path from 'node:path';

const STATE = 'marketing/data-contracts/CURRENT-STATE.md';
const SCAN = ['marketing/findings', 'audit'];

if (!fs.existsSync(STATE)) { console.log(`✗ missing ${STATE}`); process.exit(1); }
const state = fs.readFileSync(STATE, 'utf8');

// --- parse the fact registry -------------------------------------------------
const liveKeys = new Set();
const reviewBy = {};
for (const m of state.matchAll(/^\|\s*`([a-z_]+\.[a-z_0-9]+)`\s*\|[^|]*\|\s*([\d-]{10}|—)\s*\|/gm)) {
  liveKeys.add(m[1]);
  if (m[2] !== '—') reviewBy[m[1]] = m[2];
}
const superseded = {};
const supSection = state.split('## SUPERSEDED facts')[1] ?? '';
for (const m of supSection.matchAll(/^\|\s*`([a-z_]+\.[a-z_0-9]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)) {
  superseded[m[1]] = { was: m[2].trim(), by: m[3].trim() };
}

// --- collect conclusions and their declared dependencies ---------------------
const files = [];
for (const dir of SCAN) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const fp = path.join(dir, f.toString());
    if (fp.endsWith('.md') && fs.statSync(fp).isFile()) files.push(fp);
  }
}

const problems = [];
let declared = 0;

for (const fp of files) {
  const txt = fp.startsWith('audit') || fp.includes('archive') ? fs.readFileSync(fp, 'utf8') : fs.readFileSync(fp, 'utf8');
  const fm = txt.match(/^---\n([\s\S]*?)\n---/);
  const dep = fm?.[1].match(/depends-on:\s*\[([^\]]*)\]/);
  const flagged = /SUPERSEDED|WITHDRAWN|DO NOT USE|CORRECTION/i.test(txt.slice(0, 1200));

  if (dep) {
    declared++;
    const keys = dep[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const k of keys) {
      if (superseded[k] && !flagged) {
        problems.push(`  STALE CONCLUSION  ${fp}\n     depends on superseded fact \`${k}\`\n     was: ${superseded[k].was}\n     now: ${superseded[k].by}\n     → add a SUPERSEDED header or rewrite against the current fact.`);
      } else if (!liveKeys.has(k) && !superseded[k]) {
        problems.push(`  UNKNOWN FACT KEY  ${fp}\n     declares \`${k}\`, which is not in CURRENT-STATE.md.`);
      }
    }
  } else if (!flagged && /findings\//.test(fp)) {
    problems.push(`  NO DEPENDENCIES DECLARED  ${fp}\n     A conclusion with no depends-on cannot be invalidated when a fact falls.\n     Add frontmatter: depends-on: [key, ...]`);
  }
}

// --- overdue facts -----------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
for (const [k, d] of Object.entries(reviewBy)) {
  if (d < today) problems.push(`  OVERDUE FACT  \`${k}\` review-by ${d} has passed (today ${today}).\n     Re-verify from source or mark UNKNOWN. Agents are reading this as current.`);
}

// --- report ------------------------------------------------------------------
console.log(`\n  fact keys: ${liveKeys.size} live, ${Object.keys(superseded).length} superseded`);
console.log(`  conclusions scanned: ${files.length}, with declared dependencies: ${declared}\n`);
if (problems.length) {
  console.log(`✗ BELIEF-REVISION CHECK FAILED — ${problems.length} issue(s)\n`);
  console.log(problems.join('\n\n'));
  console.log(`\n  Belief revision must propagate. Correcting the number you happened to notice\n  is not correcting the conclusions built on it.\n`);
  process.exit(1);
}
console.log('✓ belief-revision check clean — no conclusion rests on a superseded or overdue fact.');
