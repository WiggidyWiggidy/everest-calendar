#!/usr/bin/env node
/**
 * Fact-location linter.
 *
 * Enforces: rules, agents, skills and commands encode HOW TO THINK.
 * They must not contain business figures. Figures live in exactly one place:
 * marketing/data-contracts/CURRENT-STATE.md
 *
 * Why this exists: on 2026-07-31 an audit found AOV referenced across 22 files, and an
 * agent asserting "CPA A$177.51 · AOV ≈ A$2,000" — a figure that was never real — while
 * CLAUDE.md and business-scope.md contradicted the findings about the binding constraint.
 * Duplicated facts drift silently. A rule that states a number is a rule that will lie.
 *
 * Exit 0 = clean.  Exit 1 = violations listed.
 */
import fs from 'node:fs';
import path from 'node:path';

const SCAN = ['.claude/rules', '.claude/agents', '.claude/commands', '.claude/skills'];
const ALLOWED = new Set(['marketing/data-contracts/CURRENT-STATE.md']);

// Patterns that indicate a *business figure* — not structural numbers like "5 checks" or "n<30".
const FIGURE = [
  { re: /A?\$\s?[\d,]+(?:\.\d+)?/g,            what: 'currency amount' },
  { re: /\b\d+(?:\.\d+)?x\b(?!\s*(?:threshold|headroom))/g, what: 'multiple (ROAS/MER-like)' },
  { re: /\b\d+(?:\.\d+)?%/g,                    what: 'percentage' },
  { re: /\b1202\d{13,}\b/g,                     what: 'Meta object id' },
];

// Structural/pedagogical numbers that are fine in a rule (thresholds about METHOD, not the business).
const EXEMPT = [
  /n\s*[<≤>=]+\s*\d+/i,           // n<30, n≤2
  /\b(50|95)%\s*(power|confidence|CI)/i,
  /\b\d+\s*(check|step|law|field|gate|agent)s?\b/i,
  /never|must not|do not|forbidden|example|e\.g\.|\bwas\b|\bwrongly\b|superseded|disproven/i,
];

let violations = 0;
const report = [];

function scanFile(fp) {
  const rel = path.relative(process.cwd(), fp);
  if (ALLOWED.has(rel)) return;
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (EXEMPT.some(x => x.test(line))) return;
    if (/^\s*(>|\/\/|#\s|\*)/.test(line) && /example|was |wrongly/i.test(line)) return;
    for (const { re, what } of FIGURE) {
      const m = line.match(re);
      if (m) {
        violations++;
        report.push(`  ${rel}:${i + 1}\n     ${what}: ${m.slice(0, 3).join(', ')}\n     > ${line.trim().slice(0, 95)}`);
        break;
      }
    }
  });
}

for (const dir of SCAN) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const fp = path.join(dir, f.toString());
    if (fp.endsWith('.md') && fs.statSync(fp).isFile()) scanFile(fp);
  }
}

if (violations) {
  console.log(`\n✗ FACT-LOCATION LINT FAILED — ${violations} business figure(s) inside rules/agents.\n`);
  console.log(report.join('\n\n'));
  console.log(`\n  Rules and agents encode HOW TO THINK, not what is currently true.`);
  console.log(`  Move the figure to marketing/data-contracts/CURRENT-STATE.md and reference it.`);
  console.log(`  A rule that states a number is a rule that will lie once reality moves.\n`);
  process.exit(1);
}
console.log('✓ fact-location lint clean — no business figures in rules/agents.');
