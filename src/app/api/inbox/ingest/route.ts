// ============================================
// POST /api/inbox/ingest
// External agent intake — API-key auth.
// Used by Upwork monitor, Alibaba monitor,
// and any other agent without a browser session.
// Auth: X-API-Key header → INBOX_INGEST_KEY env var
// Calls create_inbox_item SECURITY DEFINER RPC (anon client)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.INBOX_INGEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    platform,
    contact_name,
    contact_identifier,
    raw_content,
    media_url,
    media_type,
    ai_summary,
    ai_recommendation,
    draft_reply,
    approval_tier,
    candidate_id,
    metadata,
  } = body;

  // ── Validate required fields ──────────────────────────────────────────────
  if (!platform || !['whatsapp', 'upwork', 'alibaba'].includes(platform as string)) {
    return NextResponse.json({ error: 'platform must be whatsapp, upwork, or alibaba' }, { status: 400 });
  }
  if (!raw_content || typeof raw_content !== 'string') {
    return NextResponse.json({ error: 'raw_content is required' }, { status: 400 });
  }
  if (typeof approval_tier !== 'number' || approval_tier < 0 || approval_tier > 3) {
    return NextResponse.json({ error: 'approval_tier must be 0-3' }, { status: 400 });
  }

  // ── Call RPC via anon client ───────────────────────────────────────────────
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.rpc('create_inbox_item', {
    p_platform:                  platform,
    p_contact_name:              contact_name ?? null,
    p_contact_identifier:        contact_identifier ?? null,
    p_raw_content:               raw_content,
    p_media_url:                 media_url ?? null,
    p_media_type:                media_type ?? null,
    p_ai_summary:                ai_summary ?? null,
    p_ai_recommendation:         ai_recommendation ?? null,
    p_draft_reply:               draft_reply ?? null,
    p_approval_tier:             approval_tier,
    p_cowork_message_inbound_id: null,
    p_candidate_id:              candidate_id ?? null,
    p_metadata:                  metadata ?? null,
  });

  if (error) {
    console.error('[ingest] create_inbox_item error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, inbox_id: (data as { inbox_id: string }).inbox_id }, { status: 201 });
}
