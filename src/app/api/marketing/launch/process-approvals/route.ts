// /api/marketing/launch/process-approvals
// Cron-fired (or skill-fired) approval bridge.
// Watches platform_inbox for rows where:
//   platform='marketing' AND status='approved' AND metadata->>'processed_at' IS NULL
// On each approved asset:
//   - kind='landing_page'  → call Shopify pages.json PUT to publish
//   - kind='ad_creative'   → flag the ad_creatives row as 'ready_to_promote'
//                            (Meta API push deferred until billing settled + ads_management scope; see /api/marketing/launch/promote-ads)
//
// Auth: x-sync-secret. Wired into existing process-directives daily cron.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { snapshotShopifyPage, auditLog } from '@/lib/marketing-safety';

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

async function publishShopifyPage(
  shopifyUrl: string,
  shopifyToken: string,
  shopifyPageId: string
): Promise<{ ok: boolean; handle?: string; error?: string }> {
  const res = await fetch(
    `https://${shopifyUrl}/admin/api/2024-01/pages/${shopifyPageId}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
      body: JSON.stringify({ page: { id: parseInt(shopifyPageId, 10), published: true } }),
    }
  );
  if (!res.ok) {
    return { ok: false, error: `Shopify ${res.status}: ${await res.text().catch(() => '')}` };
  }
  const data = await res.json();
  return { ok: true, handle: data.page?.handle };
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = svcClient();
    const { data: pending, error: pendErr } = await sb
      .from('platform_inbox')
      .select('id, metadata, status, contact_identifier')
      .eq('user_id', TOM_USER_ID)
      .eq('platform', 'marketing')
      .eq('status', 'approved')
      .order('updated_at', { ascending: true })
      .limit(50);

    if (pendErr) {
      return NextResponse.json({ error: pendErr.message }, { status: 500 });
    }

    // Filter rows we haven't already processed (processed_at not yet stamped in metadata)
    const toProcess = (pending ?? []).filter((r: { metadata?: Record<string, unknown> }) => !r.metadata?.processed_at);

    if (toProcess.length === 0) {
      return NextResponse.json({ success: true, processed: 0, note: 'No approved marketing rows pending processing.' });
    }

    let shopifyUrl = '';
    let shopifyToken = '';
    try {
      shopifyUrl = getShopifyStoreUrl();
      shopifyToken = await getShopifyToken();
    } catch (e) {
      return NextResponse.json({ error: 'Shopify creds unavailable: ' + (e as Error).message }, { status: 500 });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const row of toProcess) {
      const meta = row.metadata as Record<string, unknown>;
      const kind = meta?.kind as string | undefined;
      const resourceId = meta?.resource_id as string | undefined;
      const launchRunId = meta?.launch_run_id as string | undefined;

      if (!kind || !resourceId) {
        results.push({ inbox_id: row.id, status: 'skipped', reason: 'missing kind or resource_id in metadata' });
        continue;
      }

      try {
        if (kind === 'landing_page') {
          const { data: lp } = await sb
            .from('landing_pages')
            .select('shopify_page_id, name, status')
            .eq('id', resourceId)
            .eq('user_id', TOM_USER_ID)
            .single();

          if (!lp?.shopify_page_id) {
            results.push({ inbox_id: row.id, status: 'failed', reason: 'no shopify_page_id on landing_pages row' });
            continue;
          }

          // Snapshot before publish
          await snapshotShopifyPage(sb, TOM_USER_ID, lp.shopify_page_id, shopifyUrl, shopifyToken, 'pre_publish');

          const pub = await publishShopifyPage(shopifyUrl, shopifyToken, lp.shopify_page_id);
          if (!pub.ok) {
            results.push({ inbox_id: row.id, status: 'failed', reason: pub.error });
            continue;
          }

          await sb
            .from('landing_pages')
            .update({ status: 'monitoring', updated_at: new Date().toISOString() })
            .eq('id', resourceId);

          await auditLog(
            sb,
            TOM_USER_ID,
            'page_published_via_inbox_approval',
            'shopify_page',
            lp.shopify_page_id,
            { published: false },
            { published: true, handle: pub.handle },
            'scheduled_agent',
            { landing_page_id: resourceId, launch_run_id: launchRunId, inbox_id: row.id },
          );

          results.push({
            inbox_id: row.id,
            status: 'published',
            landing_page_id: resourceId,
            handle: pub.handle,
            preview_url: pub.handle ? `https://${shopifyUrl}/pages/${pub.handle}` : null,
          });
        } else if (kind === 'ad_creative') {
          // Until Meta billing is settled + token has ads_management scope, we don't push to Meta API.
          // Just mark the ad_creative as ready_to_promote so /promote-ads can fire later.
          await sb
            .from('ad_creatives')
            .update({ status: 'ready_to_promote', updated_at: new Date().toISOString() })
            .eq('id', resourceId);

          await auditLog(
            sb,
            TOM_USER_ID,
            'ad_flagged_ready_via_inbox_approval',
            'ad_creative',
            resourceId,
            { status: 'draft' },
            { status: 'ready_to_promote' },
            'scheduled_agent',
            { launch_run_id: launchRunId, inbox_id: row.id },
          );

          results.push({
            inbox_id: row.id,
            status: 'ad_ready_to_promote',
            ad_creative_id: resourceId,
            note: 'Will push to Meta when billing settled + token upgraded. Run /api/marketing/launch/promote-ads then.',
          });
        } else {
          results.push({ inbox_id: row.id, status: 'skipped', reason: `unknown kind: ${kind}` });
          continue;
        }

        // Mark inbox row processed (stamp metadata)
        const newMeta = { ...meta, processed_at: new Date().toISOString() };
        await sb
          .from('platform_inbox')
          .update({ metadata: newMeta, updated_at: new Date().toISOString() })
          .eq('id', row.id);
      } catch (e) {
        results.push({ inbox_id: row.id, status: 'errored', reason: (e as Error).message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error('process-approvals error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
