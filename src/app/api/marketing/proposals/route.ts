import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const landing_page_id = searchParams.get('landing_page_id');
    if (!landing_page_id) {
      return NextResponse.json({ error: 'landing_page_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('page_proposals')
      .select('*')
      .eq('landing_page_id', landing_page_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ proposals: data ?? [] });
  } catch (err) {
    console.error('proposals GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, status, user_plan } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (user_plan !== undefined) updates.user_plan = user_plan;
    if (status === 'approved' || status === 'user_written') {
      updates.approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('page_proposals')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('proposals PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 });
  }
}
