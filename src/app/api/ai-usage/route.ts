import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const offsetMs = 8 * 60 * 60 * 1000;
    const localNow = new Date(now.getTime() + offsetMs);
    const todayLocal = localNow.toISOString().split('T')[0];
    const dayStart = new Date(todayLocal + 'T00:00:00+08:00').toISOString();
    const dayEnd   = new Date(todayLocal + 'T23:59:59+08:00').toISOString();

    const { data, error } = await supabase
      .from('ai_usage_log')
      .select('operation, input_tokens, output_tokens, cost_usd')
      .eq('user_id', user.id)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const totalCost   = rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
    const totalInput  = rows.reduce((sum, r) => sum + r.input_tokens, 0);
    const totalOutput = rows.reduce((sum, r) => sum + r.output_tokens, 0);

    const ops: Record<string, { calls: number; cost: number; input: number; output: number }> = {};
    for (const r of rows) {
      if (!ops[r.operation]) ops[r.operation] = { calls: 0, cost: 0, input: 0, output: 0 };
      ops[r.operation].calls++;
      ops[r.operation].cost   += Number(r.cost_usd);
      ops[r.operation].input  += r.input_tokens;
      ops[r.operation].output += r.output_tokens;
    }

    return NextResponse.json({
      total_cost:          totalCost,
      total_input_tokens:  totalInput,
      total_output_tokens: totalOutput,
      total_calls:         rows.length,
      by_operation:        Object.entries(ops).map(([operation, s]) => ({ operation, ...s })),
    });
  } catch (err) {
    console.error('ai-usage route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
