// ============================================
// GET  /api/inbox  — list inbox items
// POST /api/inbox  — manually create inbox item
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('platform_inbox')
    .select('*')
    .eq('user_id', user.id)
    .order('approval_tier', { ascending: false })
    .order('created_at', { ascending: false });

  if (status === 'pending') {
    query = query.eq('status', 'pending');
  } else if (status === 'done') {
    query = query.in('status', ['approved', 'edited', 'rejected', 'snoozed']);
  } else if (status) {
    query = query.eq('status', status);
  }

  const { data: items, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = items ?? [];

  // ── Pipeline context joins ──────────────────────────────────────────────
  // Batch-fetch candidate and manufacturer records to enrich each card

  // Upwork candidates
  const candidateIds = Array.from(
    new Set(rows.map((i: { candidate_id: string | null }) => i.candidate_id).filter(Boolean) as string[])
  );
  const candidateMap: Record<string, { id: string; name: string; tier: string; status: string }> = {};
  if (candidateIds.length > 0) {
    const { data: candidates } = await supabase
      .from('upwork_candidates')
      .select('id, name, tier, status')
      .in('id', candidateIds);
    for (const c of candidates ?? []) candidateMap[c.id] = c;
  }

  // Alibaba manufacturers (manufacturer_id stored in metadata JSONB)
  const manufacturerIds = Array.from(
    new Set(
      rows
        .filter((i: { platform: string; metadata: Record<string, unknown> | null }) =>
          i.platform === 'alibaba' && i.metadata?.manufacturer_id
        )
        .map((i: { metadata: Record<string, unknown> | null }) => i.metadata!.manufacturer_id as string)
    )
  );
  const manufacturerMap: Record<string, { id: string; company_name: string; status: string }> = {};
  if (manufacturerIds.length > 0) {
    const { data: manufacturers } = await supabase
      .from('manufacturers')
      .select('id, company_name, status')
      .in('id', manufacturerIds);
    for (const m of manufacturers ?? []) manufacturerMap[m.id] = m;
  }

  // Attach enrichment to each item
  const enriched = rows.map((item: { candidate_id: string | null; platform: string; metadata: Record<string, unknown> | null }) => ({
    ...item,
    _candidate:    item.candidate_id ? (candidateMap[item.candidate_id] ?? null) : null,
    _manufacturer: item.platform === 'alibaba' && item.metadata?.manufacturer_id
      ? (manufacturerMap[item.metadata.manufacturer_id as string] ?? null)
      : null,
  }));

  // Count pending items for sidebar badge
  const { count: pendingCount } = await supabase
    .from('platform_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending');

  return NextResponse.json({ items: enriched, pendingCount: pendingCount ?? 0 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    platform, contact_name, contact_identifier, raw_content,
    media_url, media_type, ai_summary, ai_recommendation,
    draft_reply, approval_tier,
  } = body;

  if (!platform || !raw_content || approval_tier === undefined) {
    return NextResponse.json({ error: 'platform, raw_content, and approval_tier are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('platform_inbox')
    .insert({
      user_id: user.id,
      platform, contact_name, contact_identifier, raw_content,
      media_url, media_type, ai_summary, ai_recommendation,
      draft_reply, approval_tier,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
