// ============================================
// /api/manufacturers
// GET  — list manufacturers (session auth, optional ?status= filter)
// POST — create a new manufacturer record (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('manufacturers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('/api/manufacturers GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch manufacturers' }, { status: 500 });
    }

    return NextResponse.json({ manufacturers: data });
  } catch (err) {
    console.error('/api/manufacturers GET unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      company_name, contact_name, phone, email, location, website,
      status = 'prospecting',
      quoted_price_usd, lead_time_days, min_order_qty,
      strengths, concerns, notes,
    } = body;

    if (!company_name || typeof company_name !== 'string' || !company_name.trim()) {
      return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
    }

    const validStatuses = ['prospecting','contacted','sample_requested','sample_received','quoting','quoted','trialling','selected','rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('manufacturers')
      .insert({
        user_id:          user.id,
        company_name:     company_name.trim(),
        contact_name:     contact_name ?? null,
        phone:            phone ?? null,
        email:            email ?? null,
        location:         location ?? null,
        website:          website ?? null,
        status,
        quoted_price_usd: quoted_price_usd ?? null,
        lead_time_days:   lead_time_days ?? null,
        min_order_qty:    min_order_qty ?? null,
        strengths:        strengths ?? null,
        concerns:         concerns ?? null,
        notes:            notes ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('/api/manufacturers POST error:', error);
      return NextResponse.json({ error: 'Failed to create manufacturer' }, { status: 500 });
    }

    return NextResponse.json({ manufacturer: data }, { status: 201 });
  } catch (err) {
    console.error('/api/manufacturers POST unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
