// /api/marketing/assets/[id]
// GET — single asset detail.
// DELETE — removes from Storage + DB. Used for "delete bad ones" workflow.
//          Skipped if asset is in_use (has any landing_pages references).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'kryo-assets';

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authOk(_req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sb = svc();
  const { data, error } = await sb.from('media_assets').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ asset: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sb = svc();

  const { data: asset, error: rErr } = await sb.from('media_assets').select('*').eq('id', id).single();
  if (rErr || !asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

  // Refuse delete if currently embedded in a live page (used_in_pages non-empty)
  if (Array.isArray(asset.used_in_pages) && asset.used_in_pages.length > 0) {
    return NextResponse.json({
      error: 'Asset is in use',
      detail: `Embedded in ${asset.used_in_pages.length} landing page(s). Archive instead.`,
      used_in_pages: asset.used_in_pages,
    }, { status: 409 });
  }

  // Delete from Storage
  if (asset.storage_path) {
    const { error: sErr } = await sb.storage.from(BUCKET).remove([asset.storage_path]);
    if (sErr) console.warn('storage delete failed (non-fatal):', sErr.message);
  }

  // Delete row
  const { error: dErr } = await sb.from('media_assets').delete().eq('id', id);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted_id: id });
}
