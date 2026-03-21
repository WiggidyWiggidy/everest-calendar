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

  // Count pending items for sidebar badge
  const { count: pendingCount } = await supabase
    .from('platform_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending');

  return NextResponse.json({ items: items ?? [], pendingCount: pendingCount ?? 0 });
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
