// /api/marketing/assets/list
// Lists media_assets with filters. Used by the /dashboard/assets gallery.
//
// Query params:
//   status      pending_qc | pending_approval | approved | rejected | archived | in_use | all
//   scene_type  hero | lifestyle | diagram | founder | comparison | social_proof | press
//   angle       morning_energy | athlete_recovery | luxury_upgrade | value_anchor | science_authority
//   source      manual | ai_generated | scraped
//   limit       default 60, max 200
//   offset      default 0
//
// Auth: x-sync-secret.

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

export async function GET(request: NextRequest) {
  if (!authOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const scene_type = searchParams.get('scene_type');
  const angle = searchParams.get('angle');
  const source = searchParams.get('source');
  const limit = Math.min(parseInt(searchParams.get('limit') || '60', 10), 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const sb = svc();
  let q = sb
    .from('media_assets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== 'all') q = q.eq('status', status);
  if (scene_type) q = q.eq('scene_type', scene_type);
  if (angle) q = q.eq('angle', angle);
  if (source) q = q.eq('source', source);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Inventory summary alongside the listing — soft-fail if RPC missing
  let summary = null;
  try {
    const r = await sb.rpc('asset_inventory_summary');
    summary = (r as unknown as { data?: unknown })?.data || null;
  } catch { /* RPC not yet defined; non-fatal */ }

  return NextResponse.json({
    success: true,
    assets: data || [],
    total_count: count ?? 0,
    page: { limit, offset },
    inventory: summary,
  });
}
