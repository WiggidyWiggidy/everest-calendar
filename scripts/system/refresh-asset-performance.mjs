#!/usr/bin/env node
// refresh-asset-performance.mjs — nightly performance feedback loop.
// For each landing_page that has lp_funnel_daily metrics, compute its conversion rate.
// Bump performance_score for every embedded asset (used_in_pages references):
//   high CR → +0.10 per asset
//   mid CR  → +0.02
//   low CR  → -0.05
// The asset selector then prefers high-score assets in future page builds.
//
// Usage: node scripts/system/refresh-asset-performance.mjs [--days 7]

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[++i]; }
}
const DAYS = parseInt(args.days || '7', 10);
const log = (m) => process.stderr.write(`[asset-perf] ${m}\n`);

// Fetch landing pages with funnel data in the last N days
const since = new Date(Date.now() - DAYS * 86400e3).toISOString().slice(0, 10);
const { data: funnel, error: fErr } = await sb
  .from('lp_funnel_daily')
  .select('landing_page_id, sessions, orders, overall_conversion_rate')
  .gte('date', since);

if (fErr) {
  log(`funnel query fail: ${fErr.message}`);
  process.exit(2);
}

// Aggregate per-LP
const lpAgg = {};
for (const r of funnel || []) {
  if (!r.landing_page_id) continue;
  if (!lpAgg[r.landing_page_id]) lpAgg[r.landing_page_id] = { sessions: 0, orders: 0 };
  lpAgg[r.landing_page_id].sessions += r.sessions || 0;
  lpAgg[r.landing_page_id].orders += r.orders || 0;
}

const lpScores = Object.entries(lpAgg).map(([lpId, m]) => ({
  lpId,
  sessions: m.sessions,
  orders: m.orders,
  cr: m.sessions > 0 ? m.orders / m.sessions : 0,
}));

if (lpScores.length === 0) {
  log(`no funnel data in last ${DAYS} days; nothing to refresh`);
  process.stdout.write(JSON.stringify({ refreshed: 0, days: DAYS, lp_count: 0 }, null, 2) + '\n');
  process.exit(0);
}

// Compute median + p75 to bucket high/mid/low
const crs = lpScores.map((x) => x.cr).sort((a, b) => a - b);
const median = crs[Math.floor(crs.length / 2)] || 0;
const p75 = crs[Math.floor(crs.length * 0.75)] || 0;

log(`${lpScores.length} pages with funnel data; median CR ${(median*100).toFixed(2)}%, p75 ${(p75*100).toFixed(2)}%`);

// For each LP, find embedded assets (media_assets where used_in_pages contains lpId)
let totalUpdates = 0;
for (const lp of lpScores) {
  const delta = lp.cr >= p75 ? 0.10 : (lp.cr >= median ? 0.02 : -0.05);
  // PostgREST: query rows where used_in_pages contains the lp UUID
  const { data: assets, error: aErr } = await sb
    .from('media_assets')
    .select('id, performance_score')
    .contains('used_in_pages', [lp.lpId]);
  if (aErr) { log(`asset query fail for lp ${lp.lpId}: ${aErr.message}`); continue; }
  for (const a of assets || []) {
    const newScore = Math.max(-1, Math.min(2, (Number(a.performance_score) || 0) + delta));
    await sb.from('media_assets').update({ performance_score: newScore }).eq('id', a.id);
    totalUpdates++;
  }
  if ((assets || []).length > 0) {
    log(`lp ${lp.lpId.slice(0, 8)}: cr=${(lp.cr*100).toFixed(2)}% Δ=${delta>=0?'+':''}${delta.toFixed(2)} × ${assets.length} asset(s)`);
  }
}

log(`refreshed ${totalUpdates} asset performance scores`);
process.stdout.write(JSON.stringify({
  refreshed: totalUpdates,
  days: DAYS,
  lp_count: lpScores.length,
  median_cr: median,
  p75_cr: p75,
}, null, 2) + '\n');
