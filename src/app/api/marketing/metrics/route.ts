import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('marketing_metrics_daily')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ metrics: data ?? [] });
  } catch (err) {
    console.error('marketing/metrics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { date, ...metrics } = body;
    if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('marketing_metrics_daily')
      .upsert({ ...metrics, date, user_id: user.id }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, metric: data });
  } catch (err) {
    console.error('marketing/metrics POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
