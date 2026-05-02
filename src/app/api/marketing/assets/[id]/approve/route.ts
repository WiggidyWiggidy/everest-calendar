// /api/marketing/assets/[id]/approve
// Tom approves an asset → status='approved', approved_at=now.
// Approved assets are eligible for the page-builder swarm to embed.

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'asset id required' }, { status: 400 });

  let body: { scene_type?: string; angle?: string; alt?: string } = {};
  try { body = await request.json(); } catch { /* allow empty body */ }

  const sb = svc();
  const update: Record<string, unknown> = {
    status: 'approved',
    approved_at: new Date().toISOString(),
    rejected_at: null,
    rejection_reason: null,
  };
  // Allow Tom to set/correct scene_type + angle + alt at approval time
  if (body.scene_type) update.scene_type = body.scene_type;
  if (body.angle) update.angle = body.angle;
  if (body.alt) update.ai_description = body.alt;

  const { data, error } = await sb
    .from('media_assets')
    .update(update)
    .eq('id', id)
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, asset: data });
}
