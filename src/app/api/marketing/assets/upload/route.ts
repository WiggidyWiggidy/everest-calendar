// /api/marketing/assets/upload
// Accepts a multipart file upload (or a JSON {url, scene_type, angle, source}).
// Stores in kryo-assets Supabase Storage bucket → media_assets row → status=pending_qc.
//
// Two modes:
//   1. multipart/form-data with 'file' field — direct upload from dashboard
//   2. application/json {url, scene_type?, angle?, alt?, source?} — paste-by-URL (e.g. from Slack)
//
// Auth: x-sync-secret OR (future) signed user session.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
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

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._/-]/g, '-').slice(0, 200);
}

export async function POST(request: NextRequest) {
  if (!authOk(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  const sb = svc();

  // ── Mode 1: multipart upload ──
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await request.formData(); }
    catch (e) { return NextResponse.json({ error: 'Invalid multipart body', detail: (e as Error).message }, { status: 400 }); }

    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file field required' }, { status: 400 });

    const sceneType = (form.get('scene_type') as string) || null;
    const angle = (form.get('angle') as string) || null;
    const alt = (form.get('alt') as string) || null;
    const sourceLabel = (form.get('source') as string) || 'manual';

    const buf = Buffer.from(await file.arrayBuffer());
    const ts = Date.now();
    const path = `manual/${ts}-${safeName(file.name)}`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'image/png',
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ error: 'Storage upload failed', detail: upErr.message }, { status: 500 });
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

    const { data: row, error: dbErr } = await sb
      .from('media_assets')
      .insert({
        user_id: TOM_USER_ID,
        storage_path: path,
        public_url: pub.publicUrl,
        filename: file.name,
        file_size: buf.length,
        mime_type: file.type || 'image/png',
        status: 'pending_qc',
        source: sourceLabel,
        scene_type: sceneType,
        angle,
        ai_description: alt,
      })
      .select('*').single();
    if (dbErr) return NextResponse.json({ error: 'DB insert failed', detail: dbErr.message }, { status: 500 });

    return NextResponse.json({ success: true, asset: row, public_url: pub.publicUrl });
  }

  // ── Mode 2: JSON paste-by-URL ──
  if (contentType.includes('application/json')) {
    let body: { url?: string; scene_type?: string; angle?: string; alt?: string; source?: string; filename?: string };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.url) return NextResponse.json({ error: 'url required' }, { status: 400 });

    // Fetch the remote URL, save into our bucket so we own the asset (avoids 3rd-party link rot)
    let buf: Buffer;
    let mime = 'image/png';
    try {
      const r = await fetch(body.url);
      if (!r.ok) throw new Error(`fetch ${r.status}`);
      const arr = await r.arrayBuffer();
      buf = Buffer.from(arr);
      mime = r.headers.get('content-type') || 'image/png';
    } catch (e) {
      return NextResponse.json({ error: 'Could not fetch URL', detail: (e as Error).message }, { status: 502 });
    }

    const ts = Date.now();
    const fname = body.filename || (body.url.split('/').pop() || 'asset.png').split('?')[0];
    const path = `manual/${ts}-${safeName(fname)}`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
    if (upErr) return NextResponse.json({ error: 'Storage upload failed', detail: upErr.message }, { status: 500 });
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

    const { data: row, error: dbErr } = await sb
      .from('media_assets')
      .insert({
        user_id: TOM_USER_ID,
        storage_path: path,
        public_url: pub.publicUrl,
        filename: fname,
        file_size: buf.length,
        mime_type: mime,
        status: 'pending_qc',
        source: body.source || 'manual',
        scene_type: body.scene_type || null,
        angle: body.angle || null,
        ai_description: body.alt || null,
      })
      .select('*').single();
    if (dbErr) return NextResponse.json({ error: 'DB insert failed', detail: dbErr.message }, { status: 500 });

    return NextResponse.json({ success: true, asset: row, public_url: pub.publicUrl });
  }

  return NextResponse.json({ error: 'Send multipart/form-data or application/json' }, { status: 415 });
}

// Increase body size limit for large image uploads (Next.js default is 1MB)
export const config = { api: { bodyParser: false } };
