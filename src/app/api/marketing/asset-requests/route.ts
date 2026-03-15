import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('asset_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ requests: data ?? [] });
  } catch (err) {
    console.error('asset-requests GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { description, asset_type, landing_page_id, notes } = body;

    if (!description || !asset_type) {
      return NextResponse.json({ error: 'description and asset_type are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('asset_requests')
      .insert({
        user_id: user.id,
        description,
        asset_type,
        landing_page_id: landing_page_id ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ request: data });
  } catch (err) {
    console.error('asset-requests POST error:', err);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, status } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase
      .from('asset_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('asset-requests PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
  }
}
