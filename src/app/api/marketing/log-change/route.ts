import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logMarketingChange } from '@/lib/marketing/change-log';

async function authenticate(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, service: true };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { authenticated: Boolean(user), service: false };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body?.source || !body?.surface || !body?.object_type || !body?.change_type) {
      return NextResponse.json({ error: 'source, surface, object_type, change_type required' }, { status: 400 });
    }

    const supabase = auth.service ? createServiceClient() : await createClient();
    await logMarketingChange(supabase, {
      actor: body.actor ?? 'tom_manual',
      source: body.source,
      surface: body.surface,
      objectType: body.object_type,
      objectId: body.object_id ?? null,
      objectName: body.object_name ?? null,
      market: body.market ?? 'AE',
      productHandle: body.product_handle ?? 'kryo2',
      changeType: body.change_type,
      beforePayload: body.before_payload ?? null,
      afterPayload: body.after_payload ?? null,
      note: body.note ?? null,
      experimentId: body.experiment_id ?? null,
      autoLogged: false,
      metadata: body.metadata ?? {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
