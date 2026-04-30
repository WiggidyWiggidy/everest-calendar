// /api/marketing/launch/process-attribution
// Cron-fired (or skill-fired) RPC orchestrator.
// Calls compute_ad_metrics_daily() + compute_lp_funnel_daily() for the given date (or yesterday).
// Wired into existing process-directives daily 06:00 UTC cron.
//
// Auth: x-sync-secret (existing pattern).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

interface AttributionRequest {
  date?: string;     // YYYY-MM-DD; default yesterday
  days?: number;     // backfill last N days (loops day-by-day); overrides date
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as AttributionRequest;
    const sb = svcClient();
    const results: Array<Record<string, unknown>> = [];

    // Build the list of dates to process.
    const dates: string[] = [];
    if (body.days && body.days > 0) {
      for (let i = 1; i <= Math.min(body.days, 90); i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
    } else {
      dates.push(body.date ?? yesterdayISO());
    }

    for (const d of dates) {
      const ad = await sb.rpc('compute_ad_metrics_daily', { p_date: d });
      const lp = await sb.rpc('compute_lp_funnel_daily', { p_date: d });
      results.push({
        date: d,
        ad_metrics_rows: ad.error ? `err: ${ad.error.message}` : (ad.data?.[0]?.rows_upserted ?? 0),
        lp_funnel_rows: lp.error ? `err: ${lp.error.message}` : (lp.data?.[0]?.rows_upserted ?? 0),
      });
    }

    return NextResponse.json({
      success: true,
      dates_processed: dates.length,
      results,
    });
  } catch (err) {
    console.error('process-attribution error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
