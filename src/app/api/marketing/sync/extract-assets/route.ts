// /api/marketing/sync/extract-assets
// Wraps extract_meta_creative_assets() RPC.
// Pure SQL — extracts every title/body/image/CTA/link from meta_ads.asset_feed_spec into
// the normalized meta_creative_assets table. Idempotent. Zero LLM cost.
// Wired into process-directives daily 06:00 UTC cron after /sync/meta-campaigns.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function authSync(request: NextRequest): boolean {
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
    if (!authSync(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = svcClient();
    const { data, error } = await sb.rpc('extract_meta_creative_assets');

    if (error) {
      console.error('extract_meta_creative_assets RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const r = data?.[0] ?? {};
    return NextResponse.json({
      success: true,
      ads_processed: r.out_ads_processed ?? 0,
      assets_extracted: r.out_assets_extracted ?? 0,
      note: 'meta_creative_assets refreshed from current asset_feed_spec snapshots.',
    });
  } catch (err) {
    console.error('sync/extract-assets error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
