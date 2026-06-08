import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildKryoBehaviorReport } from '@/lib/marketing/kryo-behavior-report';

async function authenticate(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, userId: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, userId: user.id };
  return { authenticated: false, userId: null };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const windowDays = Math.min(Math.max(parseInt(url.searchParams.get('window_days') ?? '7', 10), 1), 30);
    const includeInternal = url.searchParams.get('include_internal') === '1';
    const productPath = url.searchParams.get('product_path') ?? '/products/kryo2';
    const supabase = auth.userId ? await createClient() : createServiceClient();
    const report = await buildKryoBehaviorReport(supabase, { windowDays, includeInternal, productPath });
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('kryo-behavior report error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
