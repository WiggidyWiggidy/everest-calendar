// openclaw-skill-build-kryo-page.js
// OpenClaw skill wrapper. Drop this into ~/.openclaw/skills/build-kryo-page.js
// (or use `openclaw skills add` per the OpenClaw discipline rule — never edit ~/.openclaw/ JSON directly).
//
// Trigger: Tom messages OpenClaw via WhatsApp: "build kryo page athlete_recovery"
// Result:  Skill fires the swarm-loop script (no Claude in the chain), returns the winner URL + score
//          via WhatsApp.
//
// Skill contract (OpenClaw): export an async function with shape (input, ctx) => { reply: string }

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT_PATH = '/Users/happy/Desktop/Claude Project/everest-calendar/scripts/system/swarm-loop.mjs';
const ALLOWED_ANGLES = new Set(['morning_energy', 'athlete_recovery', 'luxury_upgrade', 'value_anchor', 'science_authority']);

module.exports = async function buildKryoPage(input, ctx) {
  // Parse the angle from input text. Default: athlete_recovery.
  const text = String(input?.text || input?.message || '').toLowerCase();
  let angle = 'athlete_recovery';
  for (const a of ALLOWED_ANGLES) {
    if (text.includes(a) || text.includes(a.replace('_', ' '))) { angle = a; break; }
  }

  const startedAt = Date.now();
  let summary;
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH, '--angle', angle, '--attempts', '3', '--threshold', '75'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env },
      timeout: 10 * 60 * 1000, // 10 min cap
    });
    summary = JSON.parse(stdout);
  } catch (e) {
    return { reply: `KRYO page build FAILED for angle=${angle}: ${String(e).slice(0, 300)}` };
  }
  const ms = Date.now() - startedAt;

  const winner = summary.winner;
  const reply = [
    `KRYO ${angle} swarm-loop complete (${Math.round(ms / 1000)}s)`,
    `${summary.attempts_succeeded}/${summary.attempts_total} attempts ok`,
    `scores: ${summary.scores.map((s) => s.score).join(', ')}`,
    `winner: attempt ${winner.attempt}, score ${winner.score}/100`,
    `desktop: ${winner.desktop_screenshot}`,
    `mobile: ${winner.mobile_screenshot}`,
    summary.shipped ? `shipped: ${summary.inbox_id}` : `not shipped (below threshold or deploy disabled)`,
  ].join('\n');

  return { reply };
};

// Direct CLI mode (for testing without OpenClaw): node openclaw-skill-build-kryo-page.js athlete_recovery
if (require.main === module) {
  const angle = process.argv[2] || 'athlete_recovery';
  module.exports({ text: `build kryo page ${angle}` }, {})
    .then((r) => console.log(r.reply))
    .catch((e) => { console.error(e); process.exit(1); });
}
