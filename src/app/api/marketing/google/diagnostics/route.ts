export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

function authorized(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret') || request.nextUrl.searchParams.get('secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('system_config')
    .select('key,value_text,updated_at')
    .in('key', ['google_diagnostics.kryo_latest', 'google_diagnostics.sync_status']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latest = data?.find(r => r.key === 'google_diagnostics.kryo_latest');
  const status = data?.find(r => r.key === 'google_diagnostics.sync_status');

  if (!latest?.value_text) {
    return NextResponse.json({
      error: 'No diagnostic summary yet. Run /api/cron/google-diagnostics-sync first.',
      sync_status: status?.value_text ? JSON.parse(status.value_text) : null,
    }, { status: 404 });
  }

  return NextResponse.json({
    updated_at: latest.updated_at,
    sync_status: status?.value_text ? JSON.parse(status.value_text) : null,
    diagnostic: JSON.parse(latest.value_text),
  });
}
