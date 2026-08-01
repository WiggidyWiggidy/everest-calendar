#!/usr/bin/env node
// Team-wiring lint. A roster of good solo contributors is not a team.
// Enforces: every agent declares inputs + handoff + shared workspace, and every agent is
// reachable from at least one procedure. Origin: TEAM-AUDIT-2026-07-31.md.
import fs from 'node:fs';
const AG='.claude/agents', PROCS=['marketing/agents/conversion-diagnosis-loop.md','marketing/agents/experiment-launch-playbook.md'];
const need=[['INPUTS (required','declares required inputs'],['HANDS OFF TO','declares a handoff target'],['SHARED WORKSPACE','reads/writes the blackboard'],['OUTPUT SCHEMA','declares its output schema'],['INSTRUMENT VALIDATION','carries the instrument gate']];
const proc = PROCS.filter(p=>fs.existsSync(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n');
let bad=0;
for (const f of fs.readdirSync(AG).filter(f=>f.endsWith('.md'))) {
  const name=f.replace(/\.md$/,''), s=fs.readFileSync(`${AG}/${f}`,'utf8');
  for (const [tok,desc] of need) if(!s.includes(tok)){ console.log(`  ✗ ${name}: missing — ${desc}`); bad++; }
  if(!proc.includes(name)){ console.log(`  ✗ ${name}: ORPHANED — no procedure invokes it. Wire it or delete it.`); bad++; }
}
if (!fs.readFileSync('marketing/agents/SYSTEM.md','utf8').includes('Arbitration')) { console.log('  ✗ SYSTEM.md: no arbitration rule — disagreement resolves to whichever output was read last'); bad++; }
console.log(bad? `\n✗ TEAM-WIRING LINT FAILED — ${bad} issue(s)\n` : '✓ team-wiring lint clean — all agents have inputs, handoffs, shared state, and a caller.');
process.exit(bad?1:0);
