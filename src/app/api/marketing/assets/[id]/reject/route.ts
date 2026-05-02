// /api/marketing/assets/[id]/reject
// Tom rejects → status='rejected', rejected_at=now, optional rejection_reason.
// Rejected assets are NOT eligible for page-builder. Kept in DB for training signal.

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

  let body: { reason?: string } = {};
  try { body = await request.json(); } catch { /* allow empty */ }

  const sb = svc();
  const { data, error } = await sb
    .from('media_assets')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: body.reason || null,
    })
    .eq('id', id)
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, asset: data });
}
