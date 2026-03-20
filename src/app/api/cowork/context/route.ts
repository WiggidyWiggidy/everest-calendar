// ============================================
// /api/cowork/context
// GET  — fetch design brief for a contact
// PATCH — update design brief
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contactKey = new URL(request.url).searchParams.get('contact_key') ?? 'cad_designer';

    const { data } = await supabase
      .from('cowork_context')
      .select('brief, updated_at')
      .eq('user_id', user.id)
      .eq('contact_key', contactKey)
      .maybeSingle();

    return NextResponse.json({ brief: data?.brief ?? '', updated_at: data?.updated_at ?? null });
  } catch (err) {
    console.error('/api/cowork/context GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brief, contact_key = 'cad_designer' } = await request.json();
    if (typeof brief !== 'string') {
      return NextResponse.json({ error: 'brief must be a string' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('cowork_context')
      .upsert(
        { user_id: user.id, contact_key, brief, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,contact_key' }
      )
      .select('brief, updated_at')
      .single();

    if (error) {
      console.error('/api/cowork/context PATCH error:', error);
      return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 });
    }

    return NextResponse.json({ brief: data.brief, updated_at: data.updated_at });
  } catch (err) {
    console.error('/api/cowork/context PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
