import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

async function authenticateSync(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, userId: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, userId: user.id };
  return { authenticated: false, userId: null };
}

function parseIncludeInternal(request: NextRequest, body?: Record<string, unknown>): boolean {
  const url = new URL(request.url);
  const queryValue = url.searchParams.get('include_internal') ?? url.searchParams.get('raw');
  const bodyValue = body?.include_internal ?? body?.raw;
  const value = bodyValue ?? queryValue;
  return value === true || value === 'true' || value === '1';
}

async function handleSnapshot(request: NextRequest, body?: Record<string, unknown>) {
  const auth = await authenticateSync(request);
  if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const startedAt = Date.now();
  const includeInternal = parseIncludeInternal(request, body);
  const supabase = auth.userId ? await createClient() : createServiceClient();
  const { data, error } = await supabase.rpc('get_ga4_48h_snapshot', { include_internal: includeInternal });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, elapsed_ms: Date.now() - startedAt, snapshot: data });
}

export async function GET(request: NextRequest) {
  return handleSnapshot(request);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return handleSnapshot(request, body as Record<string, unknown>);
}
