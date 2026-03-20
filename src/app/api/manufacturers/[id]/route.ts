// ============================================
// /api/manufacturers/[id]
// PATCH  — update status, notes, quote, etc. (session auth)
// DELETE — remove a manufacturer record (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_STATUSES = ['prospecting','contacted','sample_requested','sample_received','quoting','quoted','trialling','selected','rejected'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'company_name','contact_name','phone','email','location','website',
      'status','quoted_price_usd','lead_time_days','min_order_qty',
      'strengths','concerns','notes',
    ];

    const updatePayload: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updatePayload[field] = body[field] === '' ? null : body[field];
      }
    }

    if ('status' in updatePayload && !VALID_STATUSES.includes(updatePayload.status as string)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('manufacturers')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('/api/manufacturers/[id] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update manufacturer' }, { status: 500 });
    }

    return NextResponse.json({ manufacturer: data });
  } catch (err) {
    console.error('/api/manufacturers/[id] PATCH unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const { error } = await supabase
      .from('manufacturers')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('/api/manufacturers/[id] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete manufacturer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('/api/manufacturers/[id] DELETE unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
