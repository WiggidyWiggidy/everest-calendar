#!/usr/bin/env node
/**
 * Handoff-graph validator.
 *
 * lint-team.mjs proves each agent DECLARES a handoff. It does not prove the handoffs form a
 * coherent graph. This checks the graph itself:
 *   - every handoff target resolves to a real agent, Tom, or an explicit terminal
 *   - every agent is reachable from an entry point (no islands)
 *   - no cycle lacks a terminal escape (no infinite loops)
 *   - every terminal path ends at Tom or a blocking gate (no silent dead ends)
 */
import fs from 'node:fs';
const AG = '.claude/agents';
const names = fs.readdirSync(AG).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
const TERMINALS = ['tom', 'blocking', 'never self-approves', 'publish', 'go-live'];

const edges = {};
for (const n of names) {
  const s = fs.readFileSync(`${AG}/${n}.md`, 'utf8');
  const m = s.match(/\*\*HANDS OFF TO:\*\*\s*(.+)/);
  const target = (m?.[1] || '').toLowerCase();
  edges[n] = {
    to: names.filter(o => o !== n && target.includes(o)),
    terminal: TERMINALS.some(t => target.includes(t)),
    raw: (m?.[1] || '(none)').slice(0, 70),
  };
}

const problems = [];

// 1. dead ends: no downstream agent AND no terminal
for (const [n, e] of Object.entries(edges))
  if (!e.to.length && !e.terminal)
    problems.push(`DEAD END      ${n}\n     hands off to "${e.raw}" — resolves to no agent and no terminal.`);

// 2. reachability from entry points (agents nothing hands to)
const targeted = new Set(Object.values(edges).flatMap(e => e.to));
const entries = names.filter(n => !targeted.has(n));
const seen = new Set();
(function walk(n) { if (seen.has(n)) return; seen.add(n); edges[n].to.forEach(walk); })
  , entries.forEach(function w(n) { if (seen.has(n)) return; seen.add(n); edges[n].to.forEach(w); });
const islands = names.filter(n => !seen.has(n));
for (const n of islands)
  problems.push(`UNREACHABLE   ${n}\n     no path from any entry point. Nothing can route work to it.`);

// 3. cycles without a terminal escape
function cycleNoEscape(start) {
  const stack = [[start, [start]]];
  while (stack.length) {
    const [cur, path] = stack.pop();
    for (const nxt of edges[cur].to) {
      if (nxt === start && path.length > 1) {
        if (!path.some(p => edges[p].terminal)) return path;
      } else if (!path.includes(nxt)) stack.push([nxt, [...path, nxt]]);
    }
  }
  return null;
}
const reported = new Set();
for (const n of names) {
  const c = cycleNoEscape(n);
  if (c) { const k = [...c].sort().join('>'); if (!reported.has(k)) { reported.add(k);
    problems.push(`CYCLE NO EXIT ${c.join(' → ')} → ${c[0]}\n     no agent in this loop can terminate. Work can circulate forever.`); } }
}

console.log(`\n  agents ${names.length} · entry points ${entries.length} (${entries.join(', ') || 'none'}) · reachable ${seen.size}\n`);
if (problems.length) { console.log(`✗ HANDOFF-GRAPH LINT FAILED — ${problems.length} issue(s)\n`);
  console.log(problems.map(p => '  ' + p).join('\n\n')); console.log(); process.exit(1); }
console.log('✓ handoff-graph lint clean — no dead ends, islands, or inescapable cycles.');
