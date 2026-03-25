// ============================================
// /api/approve — Telegram Mini App approval endpoint
// GET: fetch draft for editing
// POST: approve/edit/reject with optional edited text + rejection reason
// No auth required — called from Telegram Web App context
// ============================================
import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseRpc(fn: string, params: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function supabaseQuery(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function supabaseInsert(table: string, data: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

// GET /api/approve?id=9ddb — fetch draft for Mini App
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const items = await supabaseQuery(
    'platform_inbox',
    `id=like.${id}%25&status=eq.pending&draft_reply=not.is.null&select=id,contact_name,platform,draft_reply,ai_summary,contact_identifier&limit=1`
  );

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'No pending item found' }, { status: 404 });
  }

  const item = items[0];
  return NextResponse.json({
    id: item.id,
    short_id: item.id.substring(0, 4),
    contact_name: item.contact_name,
    platform: item.platform,
    draft_reply: item.draft_reply,
    ai_summary: item.ai_summary,
    contact_identifier: item.contact_identifier,
  });
}

// POST /api/approve — process approval/edit/rejection
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, id, text, reason } = body as {
    action: string;
    id: string;
    text?: string;
    reason?: string;
  };

  if (!action || !id) {
    return NextResponse.json({ error: 'action and id required' }, { status: 400 });
  }

  if (!['approve', 'edit', 'reject', 'snooze'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Determine the actual action: if text differs from original, it's an edit
  const rpcAction = text ? 'edit' : action;
  const rpcText = text || null;

  const result = await supabaseRpc('approve_inbox_item', {
    p_id_prefix: id,
    p_action: rpcAction === 'edit' ? 'edit' : action,
    p_edited_text: rpcText,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // For rejections with a reason, log the detailed feedback
  if (action === 'reject' && reason) {
    await supabaseInsert('observations', {
      observation_type: 'draft_rejected',
      contact_key: result.matched_contact_key || result.contact,
      original_text: result.final_reply,
      metadata: {
        reason,
        platform: result.platform,
        inbox_id: id,
      },
    });
  }

  return NextResponse.json({
    ...result,
    original_draft: text ? result.final_reply : undefined,
  });
}
