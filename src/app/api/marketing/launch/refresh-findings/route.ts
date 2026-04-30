// /api/marketing/launch/refresh-findings
// Cron-fired (or manually triggered) wrapper around refresh_marketing_findings() RPC.
// Pure SQL — zero LLM cost. Wipes + rebuilds the marketing_findings cache so future sessions
// (Opus or otherwise) read pre-computed insights via 1 cheap query instead of running joins.
//
// Wired into process-directives cron at the end of the daily 06:00 UTC marketing sync chain.
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

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = svcClient();
    const { data, error } = await sb.rpc('refresh_marketing_findings');

    if (error) {
      console.error('refresh_marketing_findings RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // RPC returns array of { out_category, out_findings_written }
    const categories = (data ?? []).map((r: { out_category: string; out_findings_written: number }) => ({
      category: r.out_category,
      n: r.out_findings_written,
    }));
    const total = categories.reduce((s: number, c: { n: number }) => s + c.n, 0);

    return NextResponse.json({
      success: true,
      total_findings: total,
      categories,
      note: 'marketing_findings table refreshed. Future sessions read via SELECT * FROM marketing_findings.',
    });
  } catch (err) {
    console.error('refresh-findings route error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
