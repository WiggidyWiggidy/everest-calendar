// /api/marketing/assets/inventory
// GET — returns counts of media_assets bucketed by (scene_type × angle × status).
// Used by the dashboard to show gaps + drives the asset-swarm-loop's slot-filling decisions.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function authOk(req: NextRequest): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const ANGLES = ['morning_energy', 'athlete_recovery', 'luxury_upgrade', 'value_anchor', 'science_authority', null];
const SCENES = ['hero', 'lifestyle', 'diagram', 'founder', 'comparison', 'social_proof', 'press', 'b_roll_video'];

export async function GET(request: NextRequest) {
  if (!authOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = svc();
  // Fetch every asset's (scene_type, angle, status) — cheap because it's just 3 columns.
  const { data, error } = await sb
    .from('media_assets')
    .select('scene_type, angle, status, source')
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];

  // Build a 3D matrix: scene → angle → status → count
  const matrix: Record<string, Record<string, Record<string, number>>> = {};
  for (const scene of SCENES) {
    matrix[scene] = {};
    for (const angle of ANGLES) {
      matrix[scene][angle ?? 'agnostic'] = {};
    }
  }

  // Status totals
  const statusTotals: Record<string, number> = {};
  // Source totals
  const sourceTotals: Record<string, number> = {};

  for (const r of rows) {
    statusTotals[r.status] = (statusTotals[r.status] || 0) + 1;
    if (r.source) sourceTotals[r.source] = (sourceTotals[r.source] || 0) + 1;

    const scene = r.scene_type || 'untagged';
    const angle = r.angle ?? 'agnostic';
    if (!matrix[scene]) matrix[scene] = {};
    if (!matrix[scene][angle]) matrix[scene][angle] = {};
    matrix[scene][angle][r.status] = (matrix[scene][angle][r.status] || 0) + 1;
  }

  // Identify gap slots: scene × angle where approved < 3
  const gaps: Array<{ scene: string; angle: string | null; approved: number; need: number; severity: 'high' | 'medium' | 'low' }> = [];
  const TARGET_PER_SLOT = 3;
  for (const scene of SCENES) {
    for (const angle of ANGLES) {
      const cell = matrix[scene]?.[angle ?? 'agnostic'] || {};
      const approved = cell.approved || 0;
      if (approved < TARGET_PER_SLOT) {
        const need = TARGET_PER_SLOT - approved;
        gaps.push({
          scene, angle,
          approved, need,
          severity: approved === 0 ? 'high' : approved === 1 ? 'medium' : 'low',
        });
      }
    }
  }
  gaps.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity] || (b.need - a.need);
  });

  return NextResponse.json({
    success: true,
    total_assets: rows.length,
    by_status: statusTotals,
    by_source: sourceTotals,
    matrix, // scene → angle → status → count
    gaps, // sorted by severity then need
    summary: {
      approved: statusTotals.approved || 0,
      pending_qc: statusTotals.pending_qc || 0,
      pending_approval: statusTotals.pending_approval || 0,
      rejected: statusTotals.rejected || 0,
      gap_slots: gaps.length,
    },
  });
}
