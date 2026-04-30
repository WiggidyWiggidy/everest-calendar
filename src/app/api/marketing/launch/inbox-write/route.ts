// /api/marketing/launch/inbox-write
// Writes one launch payload to platform_inbox: 1 row per asset (LP + each ad creative).
// Reuses the existing approval inbox (status=pending → approved/rejected/edited via /inbox).
//
// Caller: /launch-kryo skill, after clone-page + ad_creative inserts.
// Auth: x-sync-secret.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

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

interface InboxAsset {
  kind: 'landing_page' | 'ad_creative';
  resource_id: string;        // landing_pages.id OR ad_creatives.id
  preview_url?: string;
  variant_angle: string;
  hypothesis?: string;
  summary: string;            // short human-readable description
  payload?: Record<string, unknown>; // any extra structured info for the renderer
}

interface InboxWriteRequest {
  launch_run_id: string;      // groups assets from one /launch-kryo invocation
  variant_angle: string;
  hypothesis?: string;
  expected_lift_pct?: number;
  assets: InboxAsset[];
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
    }

    const body = (await request.json()) as InboxWriteRequest;
    if (!body.launch_run_id || !body.variant_angle || !Array.isArray(body.assets) || body.assets.length === 0) {
      return NextResponse.json({ error: 'launch_run_id, variant_angle, and at least one asset required' }, { status: 400 });
    }

    const sb = svcClient();
    const rows = body.assets.map((a) => ({
      user_id: TOM_USER_ID,
      platform: 'marketing',
      contact_name: `KRYO Launch — ${body.variant_angle}`,
      contact_identifier: `${body.launch_run_id}:${a.kind}:${a.resource_id}`,
      raw_content: a.summary,
      ai_summary: a.summary,
      ai_recommendation: `Approve to ${a.kind === 'landing_page' ? 'publish the page (Shopify draft → live)' : 'flag the paused Meta ad as ready (Tom flips live in Ads Manager once billing settled)'}.`,
      draft_reply: null,
      approval_tier: 1,
      status: 'pending',
      metadata: {
        kind: a.kind,
        resource_id: a.resource_id,
        preview_url: a.preview_url ?? null,
        variant_angle: body.variant_angle,
        hypothesis: body.hypothesis ?? null,
        expected_lift_pct: body.expected_lift_pct ?? null,
        launch_run_id: body.launch_run_id,
        ...(a.payload ?? {}),
      },
    }));

    const { data, error } = await sb
      .from('platform_inbox')
      .insert(rows)
      .select('id, contact_identifier, metadata');

    if (error) {
      console.error('platform_inbox insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      launch_run_id: body.launch_run_id,
      assets_inserted: data?.length ?? 0,
      inbox_ids: data?.map((r) => r.id) ?? [],
      next: 'Tom approves via /inbox swipe or platform_inbox UPDATE status=approved. process-approvals route fires publish on approval.',
    });
  } catch (err) {
    console.error('inbox-write error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
