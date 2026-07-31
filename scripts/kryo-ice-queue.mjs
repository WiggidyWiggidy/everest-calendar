#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = '/Users/happy/Desktop/Claude Project/everest-calendar';
const OUT_ROOT = '/Users/happy/Desktop/02_Marketing/KRYO/ice_queue';
const CREATIVE_DIRECTOR_ROOT = '/Users/happy/Desktop/02_Marketing/KRYO/creative_director';
const USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2); const n = argv[i + 1];
      if (!n || n.startsWith('--')) args[k] = true;
      else { args[k] = n; i++; }
    } else args._.push(t);
  }
  return args;
}

async function loadEnvLocal() {
  const txt = await readFile(path.join(REPO_ROOT, '.env.local'), 'utf8').catch(() => '');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (!process.env[k]) process.env[k] = raw.replace(/^['"]|['"]$/g, '');
  }
}

async function sbFetch(pathAndQuery, opts = {}) {
  await loadEnvLocal();
  const url = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 30000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Supabase ${pathAndQuery} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

async function rpc(name, body = {}) {
  return sbFetch(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }).catch(err => ({ __error: String(err.message || err) }));
}

function iceScore(impact, confidence, ease) {
  return Math.round((impact * confidence * ease) / 10 * 10) / 10;
}

function clamp(n, lo = 1, hi = 10) { return Math.max(lo, Math.min(hi, Math.round(n))); }

function candidate({ title, type, hypothesis, action, impact, confidence, ease, source, data = {}, angle = null, owner = 'codex', command = null }) {
  return {
    id: `${type}:${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)}`,
    title, type, angle, hypothesis, action, owner, command,
    ice: { impact: clamp(impact), confidence: clamp(confidence), ease: clamp(ease), score: iceScore(clamp(impact), clamp(confidence), clamp(ease)) },
    source, data,
  };
}

function summarizeClarity(rows = []) {
  const byUrl = new Map();
  for (const r of rows) {
    let key = r.page_url || 'unknown';
    try { const u = new URL(key); key = `${u.origin}${u.pathname}`; } catch {}
    const cur = byUrl.get(key) || { page_url: key, sessions: 0, dead: 0, rage: 0, errors: 0, scripts: 0, quick: 0, excessive: 0 };
    cur.sessions += Number(r.total_sessions || 0);
    cur.dead += Number(r.dead_click_count || 0);
    cur.rage += Number(r.rage_click_count || 0);
    cur.errors += Number(r.error_click_count || 0);
    cur.scripts += Number(r.script_error_count || 0);
    cur.quick += Number(r.quick_back_count || 0);
    cur.excessive += Number(r.excessive_scroll_count || 0);
    byUrl.set(key, cur);
  }
  return [...byUrl.values()].map(r => ({ ...r, score: r.dead + r.rage * 2 + r.errors * 2 + r.scripts * 3 + r.quick + r.excessive })).sort((a,b) => b.score - a.score);
}

function summarizeInbox(rows = []) {
  const themes = {
    setup: ['setup','install','installation','plumbing','bathroom','apartment'],
    payment: ['payment','pay','deposit','installment','tabby','tamara','apple pay','aed','price'],
    shipping: ['ship','shipping','delivery','deliver','dubai','uae'],
    trust: ['warranty','return','guarantee','review','legit','trust'],
    electrical: ['cable','wire','power','plug','electric','voltage'],
    checkout: ['checkout','cart','order','buy']
  };
  const out = Object.fromEntries(Object.keys(themes).map(k => [k, { count: 0, examples: [] }]));
  for (const r of rows) {
    const text = [r.raw_content,r.ai_summary,r.ai_recommendation,r.draft_reply,JSON.stringify(r.metadata||{})].filter(Boolean).join(' ').toLowerCase();
    for (const [theme, words] of Object.entries(themes)) {
      if (words.some(w => text.includes(w))) {
        out[theme].count++;
        if (out[theme].examples.length < 2) out[theme].examples.push((r.ai_summary || r.raw_content || '').slice(0, 180));
      }
    }
  }
  return Object.entries(out).filter(([,v]) => v.count > 0).map(([theme,v]) => ({ theme, ...v })).sort((a,b) => b.count - a.count);
}

async function loadCreativeDirectorLatest() {
  const runsDir = path.join(CREATIVE_DIRECTOR_ROOT, 'runs');
  if (!existsSync(runsDir)) return null;
  const fs = await import('node:fs/promises');
  const dirs = (await fs.readdir(runsDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  if (!dirs.length) return null;
  const file = path.join(runsDir, dirs.at(-1), 'strategy_package.json');
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function gatherSignals() {
  const [findings, priorityRpc, lpRpc, velocity, clarity, inbox, running, learnings, cd] = await Promise.all([
    sbFetch('marketing_findings?select=category,finding_key,finding_text,evidence,refreshed_at&order=category,finding_key').catch(e => ({ __error: String(e.message || e) })),
    rpc('prioritize_next_experiments', { p_user_id: USER_ID }),
    rpc('propose_lp_experiments', {}),
    rpc('get_test_velocity', { p_weekly_target: 5 }),
    sbFetch('clarity_friction_elements?select=date,page_url,element_selector,rage_click_count,dead_click_count,error_click_count,script_error_count,excessive_scroll_count,quick_back_count,total_sessions,is_top_offender&order=date.desc&limit=100').catch(e => ({ __error: String(e.message || e) })),
    sbFetch('platform_inbox?select=id,platform,status,contact_name,raw_content,ai_summary,ai_recommendation,draft_reply,metadata,created_at&status=eq.pending&order=created_at.desc&limit=80').catch(e => ({ __error: String(e.message || e) })),
    sbFetch(`marketing_experiments?select=id,name,status,target_metric,ice_score,expected_lift_pct,hypothesis,created_at&user_id=eq.${USER_ID}&status=in.(draft,running)&order=created_at.desc&limit=50`).catch(e => ({ __error: String(e.message || e) })),
    sbFetch('hypothesis_learnings?select=id,experiment_id,predicted_lift_pct,actual_lift_pct,confidence_calibration_delta,notes,recorded_at&order=recorded_at.desc&limit=20').catch(e => ({ __error: String(e.message || e) })),
    loadCreativeDirectorLatest(),
  ]);
  return {
    findings: Array.isArray(findings) ? findings : [],
    priority_rpc: Array.isArray(priorityRpc) ? priorityRpc : [],
    lp_rpc: Array.isArray(lpRpc) ? lpRpc : [],
    velocity: velocity.__error ? null : velocity,
    clarity: Array.isArray(clarity) ? clarity : [],
    inbox: Array.isArray(inbox) ? inbox : [],
    running: Array.isArray(running) ? running : [],
    learnings: Array.isArray(learnings) ? learnings : [],
    creative_director: cd,
    errors: {
      findings: findings.__error || null,
      priority_rpc: priorityRpc.__error || null,
      lp_rpc: lpRpc.__error || null,
      clarity: clarity.__error || null,
      inbox: inbox.__error || null,
      running: running.__error || null,
      learnings: learnings.__error || null,
    }
  };
}

function findFinding(signals, key) {
  return signals.findings.find(r => `${r.category}.${r.finding_key}`.includes(key));
}

function buildCandidates(signals) {
  const out = [];
  const clarityAgg = summarizeClarity(signals.clarity);
  const objections = summarizeInbox(signals.inbox);
  const topAd = findFinding(signals, 'top_ad') || findFinding(signals, 'best_ice_shower_ad');
  const staleFindings = signals.findings.some(r => r.refreshed_at && Date.now() - Date.parse(r.refreshed_at) > 36 * 3600 * 1000);

  for (const p of signals.priority_rpc) {
    out.push(candidate({
      title: 'Fix LP add-to-cart bottleneck package',
      type: 'lp_test',
      angle: 'value_anchor',
      hypothesis: p.proposed_hypothesis,
      action: 'Create a focused LP treatment: sticky ATC, payment plan near first buy moment, and review/trust block near CTA. Feed into Creative Director before building.',
      impact: p.proposed_ice_impact || 9,
      confidence: p.proposed_ice_confidence || 7,
      ease: p.proposed_ice_ease || 6,
      source: 'prioritize_next_experiments_rpc',
      command: 'node scripts/kryo-creative-director.mjs run --target kryo2-uae --angle value_anchor',
      data: p,
    }));
  }

  for (const p of signals.lp_rpc) {
    out.push(candidate({
      title: `LP section test: ${p.source_section_id || p.funnel_step}`,
      type: 'lp_section_test',
      angle: p.suggested_angle,
      hypothesis: p.hypothesis,
      action: `Build a section-level variant for ${p.source_section_id || p.funnel_step}.`,
      impact: p.ice?.impact || 6,
      confidence: p.ice?.confidence || 6,
      ease: p.ice?.ease || p.implementation_ease || 6,
      source: 'propose_lp_experiments_rpc',
      command: `node scripts/kryo-creative-director.mjs run --target kryo2-uae --angle ${p.suggested_angle || 'setup_clarity'}`,
      data: p,
    }));
  }

  const topFriction = clarityAgg[0];
  if (topFriction?.score > 0) {
    out.push(candidate({
      title: 'Localise KRYO page Clarity friction before scaling spend',
      type: 'diagnostic',
      angle: 'setup_clarity',
      hypothesis: `${topFriction.page_url} has aggregate Clarity friction score ${topFriction.score}. API cannot identify exact element, so the next unlock is browser/recording localisation before changing spend.`,
      action: 'Open the page with DevTools/Clarity UI, find script errors/dead click element, then convert the fix into an LP patch or app setting change.',
      impact: 9,
      confidence: 8,
      ease: 5,
      source: 'clarity_friction_elements',
      command: 'browser/Clarity review, then patch exact element only after verification',
      data: topFriction,
    }));
  }

  const setupTheme = objections.find(o => o.theme === 'setup');
  if (setupTheme) {
    out.push(candidate({
      title: 'Compress setup/electrical objections into final confidence layer',
      type: 'lp_test',
      angle: 'setup_clarity',
      hypothesis: `Pending inbox/customer-service themes show setup=${setupTheme.count}; put reassurance lower on page, not in hero.`,
      action: 'Add 2 FAQ answers + one concise reassurance banner using current KRYO2 48V/6.5mm/12L specs. Keep hero desire-first.',
      impact: 8,
      confidence: 8,
      ease: 8,
      source: 'platform_inbox_objection_themes',
      command: 'node scripts/kryo-creative-director.mjs run --target kryo2-uae --angle setup_clarity',
      data: { objections: setupTheme },
    }));
  }

  if (signals.creative_director) {
    out.push(candidate({
      title: 'Build Eight Sleep-style KRYO prospecting package',
      type: 'creative_director_package',
      angle: signals.creative_director.requested_angle || 'anchor_compare',
      hypothesis: signals.creative_director.strategic_decision,
      action: 'Use Creative Director package as the structured page/ad/image plan: hero, four-card strip, dark 1°C stat banner, comparison, setup confidence, FAQ.',
      impact: 9,
      confidence: 7,
      ease: 6,
      source: 'kryo_creative_director_v1',
      command: 'node scripts/kryo-creative-director.mjs run --target kryo2-uae --angle anchor_compare',
      data: { qc: signals.creative_director.qc, package_version: signals.creative_director.version },
    }));
  }

  if (topAd) {
    out.push(candidate({
      title: 'Fork AntiTub winner into 3 buyer-qualified ad variants',
      type: 'ad_test',
      angle: 'anchor_compare',
      hypothesis: topAd.finding_text || 'AntiTub historical winner should be forked rather than inventing new broad UGC.',
      action: 'Create 3 draft ads from AntiTub structure: AED 3,990 vs AED 18,000+ tubs, no balcony footprint, no ice. Pair to KRYO2 page.',
      impact: 8,
      confidence: 8,
      ease: 7,
      source: 'marketing_findings.top_ad',
      command: 'Use /api/marketing/ads/duplicate or draft ad rows only; keep paused.',
      data: topAd,
    }));
  }

  out.push(candidate({
    title: 'Generate missing premium image assets for top LP package',
    type: 'image_asset_batch',
    angle: 'anchor_compare',
    hypothesis: 'Manual image creation is slowing test velocity; missing dark stat banner + system architecture diagram block the Eight Sleep-style package.',
    action: 'Generate/edit 16:9 dark 1°C stat banner and 16:9 system architecture diagram, then route through QC before Shopify upload.',
    impact: 7,
    confidence: 8,
    ease: 7,
    source: 'creative_director_missing_image_briefs',
    command: 'Use imagegen with image_briefs.md, then update approved asset pool.',
    data: { missing: signals.creative_director?.missing_image_briefs || [] },
  }));

  if (signals.velocity && signals.velocity.tests_completed_this_week === 0) {
    out.push(candidate({
      title: 'Close or continue stale running tests to unlock learning loop',
      type: 'experiment_judgement',
      angle: null,
      hypothesis: `Velocity is high (${signals.velocity.tests_started_this_week} started), but completed/decided is ${signals.velocity.tests_completed_this_week}/${signals.velocity.tests_decided_this_week}. Learning does not compound until tests are judged.`,
      action: 'Run experiment judge: winner/loser/continue for running tests, write hypothesis_learnings, and update ICE confidence priors.',
      impact: 9,
      confidence: 7,
      ease: 5,
      source: 'get_test_velocity_rpc',
      command: 'Build/run KRYO experiment judge v1',
      data: signals.velocity,
    }));
  }

  if (staleFindings) {
    out.push(candidate({
      title: 'Refresh marketing findings before spend decisions',
      type: 'data_hygiene',
      angle: null,
      hypothesis: 'ICE quality decays when cached findings are stale; refresh before promoting or scaling anything.',
      action: 'Call /api/marketing/launch/refresh-findings and resync Meta/Clarity as needed.',
      impact: 6,
      confidence: 9,
      ease: 9,
      source: 'marketing_findings.refreshed_at',
      command: 'curl -X POST /api/marketing/launch/refresh-findings',
      data: { stale: true },
    }));
  }

  // De-dupe by title/type, keep highest score.
  const best = new Map();
  for (const c of out) {
    const k = c.id;
    if (!best.has(k) || best.get(k).ice.score < c.ice.score) best.set(k, c);
  }
  return [...best.values()].sort((a,b) => b.ice.score - a.ice.score || b.ice.impact - a.ice.impact);
}

function renderMarkdown(queue, signals) {
  const lines = [];
  lines.push('# KRYO Dynamic ICE Queue');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Tests this week: ${signals.velocity?.tests_started_this_week ?? 'n/a'} started / ${signals.velocity?.tests_completed_this_week ?? 'n/a'} completed / target ${signals.velocity?.weekly_target ?? 'n/a'}`);
  lines.push('');
  lines.push('## Top priorities');
  queue.forEach((c, i) => {
    lines.push(`### ${i + 1}. ${c.title}`);
    lines.push(`- ICE: ${c.ice.score} (${c.ice.impact}·${c.ice.confidence}·${c.ice.ease})`);
    lines.push(`- Type: ${c.type}${c.angle ? ` / ${c.angle}` : ''}`);
    lines.push(`- Hypothesis: ${c.hypothesis}`);
    lines.push(`- Action: ${c.action}`);
    lines.push(`- Source: ${c.source}`);
    if (c.command) lines.push(`- Command: \`${c.command}\``);
    lines.push('');
  });
  lines.push('## Rule');
  lines.push('Use this queue to keep 3-5 tests always ready. Build from the top unless a blocker makes it unsafe. When a test closes, write the learning so Confidence improves next time.');
  return lines.join('\n');
}

async function writeOutputs(queue, signals) {
  await mkdir(OUT_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dir = path.join(OUT_ROOT, stamp);
  await mkdir(dir, { recursive: true });
  const payload = { generated_at: new Date().toISOString(), queue, signals_summary: { velocity: signals.velocity, errors: signals.errors, clarity_top: summarizeClarity(signals.clarity).slice(0,5), objection_themes: summarizeInbox(signals.inbox).slice(0,8), running_count: signals.running.length, learnings_count: signals.learnings.length } };
  await writeFile(path.join(dir, 'ice_queue.json'), JSON.stringify(payload, null, 2));
  await writeFile(path.join(dir, 'ice_queue.md'), renderMarkdown(queue, signals));
  await writeFile(path.join(OUT_ROOT, 'latest.json'), JSON.stringify(payload, null, 2));
  await writeFile(path.join(OUT_ROOT, 'latest.md'), renderMarkdown(queue, signals));
  return { dir, payload };
}

async function enqueueTop(queue, n, runDir) {
  const rows = queue.slice(0, n).map((c, idx) => ({
    user_id: USER_ID,
    platform: 'marketing',
    status: 'pending',
    approval_tier: 1,
    contact_name: `KRYO ICE #${idx + 1} - ${c.title}`,
    contact_identifier: `kryo_ice:${new Date().toISOString().slice(0,10)}:${idx + 1}:${c.id}`,
    raw_content: `${c.title}\nICE ${c.ice.score} (${c.ice.impact} impact · ${c.ice.confidence} confidence · ${c.ice.ease} ease)\n\nHypothesis: ${c.hypothesis}\n\nAction: ${c.action}\n\nCommand: ${c.command || 'manual/diagnostic'}`,
    ai_summary: `ICE ${c.ice.score}: ${c.title}`,
    ai_recommendation: 'Approve this as the next queued marketing improvement. Build stays approval-gated; ads remain draft/paused.',
    metadata: { category: 'angle_launch', subcategory: 'ice_queue', rank: idx + 1, ice: c.ice, type: c.type, angle: c.angle, source: c.source, command: c.command, queue_run_dir: runDir, no_spend_changed: true },
  }));
  if (!rows.length) return [];
  return sbFetch('platform_inbox?select=id,contact_name,metadata', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=representation' } });
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0] || 'run';
  const signals = await gatherSignals();
  const queue = buildCandidates(signals);
  const { dir } = await writeOutputs(queue, signals);
  let inbox = [];
  if (cmd === 'enqueue') inbox = await enqueueTop(queue, Number(args.top || 5), dir);
  console.log(JSON.stringify({ success: true, command: cmd, run_dir: dir, latest: path.join(OUT_ROOT, 'latest.md'), queue_count: queue.length, top: queue.slice(0, 5).map(c => ({ title: c.title, ice: c.ice, type: c.type, angle: c.angle })), inbox_ids: inbox.map?.(r => r.id) || [] }, null, 2));
}

main().catch(err => { console.error(JSON.stringify({ success: false, error: String(err.stack || err.message || err) }, null, 2)); process.exit(1); });
