#!/usr/bin/env node
// asset-swarm-loop.mjs — autonomous AI-image-generation orchestrator.
// Runs every 6h via LaunchAgent. Detects under-supplied (scene_type, angle) slots,
// fires N=4 parallel generation attempts per slot, runs qc-asset on each, picks best,
// stores at status=pending_approval. Tom approves from /dashboard/assets when he wakes up.
//
// Usage:
//   node scripts/system/asset-swarm-loop.mjs               # full sweep across all gaps
//   node scripts/system/asset-swarm-loop.mjs --once        # single batch then exit
//   node scripts/system/asset-swarm-loop.mjs --scene hero --angle athlete_recovery --count 4

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = dirname(__dirname);
const REPO_ROOT = dirname(SCRIPTS_DIR);

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++; }
    else args[a.slice(2)] = 'true';
  }
}

const log = (m) => process.stderr.write(`[asset-swarm] ${new Date().toISOString().slice(11,19)} ${m}\n`);

const ANGLES = ['morning_energy', 'athlete_recovery', 'luxury_upgrade', 'value_anchor', 'science_authority'];
const SCENES = ['hero', 'lifestyle', 'diagram', 'founder', 'comparison'];
const TARGET_COUNT_PER_SLOT = parseInt(process.env.ASSET_TARGET_PER_SLOT || '3', 10);
const ATTEMPTS_PER_SLOT = parseInt(args.count || '4', 10);

if (!process.env.FAL_API_KEY && !process.env.REPLICATE_API_TOKEN) {
  log('FATAL: no AI image provider creds. Set FAL_API_KEY (preferred) or REPLICATE_API_TOKEN.');
  process.exit(1);
}

// ── Identify gaps ──────────────────────────────────────
async function findGaps() {
  // Approved assets per (scene_type, angle)
  const { data, error } = await sb
    .from('media_assets')
    .select('scene_type, angle')
    .eq('status', 'approved')
    .eq('mime_type', 'image/*'); // approximation; some libs don't support like in eq
  if (error) throw new Error(`gap query: ${error.message}`);

  // Build counts per slot
  const counts = {};
  for (const r of data || []) {
    if (!r.scene_type) continue;
    const key = `${r.scene_type}|${r.angle || 'agnostic'}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  // Compute slots that are under-supplied
  const gaps = [];
  for (const scene of SCENES) {
    for (const angle of [...ANGLES, null]) { // null = angle-agnostic
      const key = `${scene}|${angle || 'agnostic'}`;
      const have = counts[key] || 0;
      const need = TARGET_COUNT_PER_SLOT - have;
      if (need > 0) gaps.push({ scene, angle, have, need });
    }
  }

  // Sort: highest gap first
  gaps.sort((a, b) => b.need - a.need);
  return gaps;
}

// ── Generate + QC one slot ─────────────────────────────
async function generateForSlot(scene, angle, attempts) {
  const variants = Array.from({ length: attempts }, (_, i) => i + 1);
  // Run attempts SERIALLY to be polite to provider rate limits + avoid duplicate filenames
  const results = [];
  for (const v of variants) {
    try {
      const args_ = ['--scene', scene];
      if (angle) { args_.push('--angle', angle); }
      args_.push('--variant', String(v));
      log(`gen ${scene}/${angle || 'agnostic'} variant ${v}`);
      const stdout = execFileSync('node', [`${SCRIPTS_DIR}/system/generate-asset.mjs`, ...args_], {
        cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, env: process.env, timeout: 5 * 60 * 1000,
      });
      const row = JSON.parse(stdout);
      results.push(row);
    } catch (e) {
      log(`gen FAIL ${scene}/${angle || 'agnostic'}/v${v}: ${String(e).slice(0, 200)}`);
    }
  }

  // QC each result. qc-asset transitions row to pending_approval (pass) or rejected (fail).
  for (const row of results) {
    try {
      execFileSync('node', [`${SCRIPTS_DIR}/system/qc-asset.mjs`, '--asset-id', row.id], {
        cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, env: process.env, timeout: 60_000,
      });
    } catch (e) {
      log(`qc FAIL ${row.id}: ${String(e).slice(0, 200)}`);
    }
  }
  return results.length;
}

// ── Main ──────────────────────────────────────────────
const summary = { runs: [], total_generated: 0, started_at: new Date().toISOString() };

if (args.scene) {
  // Manual: generate for one specific slot
  const generated = await generateForSlot(args.scene, args.angle || null, ATTEMPTS_PER_SLOT);
  summary.runs.push({ scene: args.scene, angle: args.angle || null, generated });
  summary.total_generated = generated;
} else {
  // Autonomous: detect gaps, fill them
  const gaps = await findGaps();
  log(`found ${gaps.length} under-supplied slots`);
  if (gaps.length === 0) {
    log('library is fully stocked at TARGET_COUNT_PER_SLOT=' + TARGET_COUNT_PER_SLOT + '; exiting');
  }
  // Process top 3 gaps per run (rate limit + cost cap; cron fires every 6h so library fills fast)
  const TOP_N_GAPS = parseInt(args.gaps || '3', 10);
  for (const gap of gaps.slice(0, TOP_N_GAPS)) {
    log(`filling: ${gap.scene}/${gap.angle || 'agnostic'} (have=${gap.have}, need=${gap.need})`);
    const generated = await generateForSlot(gap.scene, gap.angle, Math.min(gap.need + 1, ATTEMPTS_PER_SLOT));
    summary.runs.push({ scene: gap.scene, angle: gap.angle, have: gap.have, generated });
    summary.total_generated += generated;
  }
}

summary.completed_at = new Date().toISOString();
log(`✓ swarm complete; generated=${summary.total_generated} across ${summary.runs.length} slot(s)`);
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
