// ============================================
// /api/cowork/contacts
// GET  — list all contacts for the user (session auth)
// POST — create a new contact (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('cowork_contacts')
      .select('id, key, display_name, phone')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('/api/cowork/contacts GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    // Always include the default cad_designer contact even if not yet in DB
    const contacts = data ?? [];
    const hasCad = contacts.some((c) => c.key === 'cad_designer');
    if (!hasCad) {
      contacts.unshift({ id: 'default', key: 'cad_designer', display_name: 'CAD Designer', phone: null });
    }

    return NextResponse.json({ contacts });
  } catch (err) {
    console.error('/api/cowork/contacts GET unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { key, display_name, phone, system_prompt } = body;

    if (!key || !display_name) {
      return NextResponse.json({ error: 'key and display_name are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('cowork_contacts')
      .upsert(
        { user_id: user.id, key, display_name, phone: phone ?? null, system_prompt: system_prompt ?? null },
        { onConflict: 'user_id,key' }
      )
      .select()
      .single();

    if (error) {
      console.error('/api/cowork/contacts POST error:', error);
      return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
    }

    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (err) {
    console.error('/api/cowork/contacts POST unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
