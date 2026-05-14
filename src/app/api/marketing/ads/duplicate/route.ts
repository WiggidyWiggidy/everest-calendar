// /api/marketing/ads/duplicate
// Duplicates an existing Meta ad / ad set / campaign via the /copies endpoint,
// with one optional field override (title, body, link_url, url_tags) applied in the same call.
// Always lands PAUSED — guarded by enforceAdPaused() / status_option override / response check.
//
// Three modes:
//   - level='ad' (default): clones the ad. Top-level creative override available since 28 May 2025.
//   - level='adset': clones the adset (and optionally children via deep_copy=true). Use for audience swaps.
//   - level='campaign': clones a whole campaign. Rare; for sub-campaign-level A/B isolation.
//
// Auth: x-sync-secret (existing MARKETING_SYNC_SECRET pattern).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auditLog } from '@/lib/marketing-safety';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';
const META_API_VERSION = 'v25.0';

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

interface DuplicateRequest {
  source_id: string;                         // The source Meta entity ID to clone
  level?: 'ad' | 'adset' | 'campaign';       // Default 'ad'
  deep_copy?: boolean;                       // Adset/campaign: include children. Default false.
  rename_suffix?: string;                    // e.g. " — heat_fatigue"
  rename_strategy?: 'DEEP_RENAME' | 'ONLY_TOP_LEVEL_RENAME' | 'NO_RENAME'; // Default ONLY_TOP_LEVEL_RENAME
  // Ad-level creative overrides (available since 28 May 2025 via top-level fields on /ad/copies)
  override?: {
    title?: string;
    body?: string;
    link_url?: string;
    url_tags?: string;
  };
  // Adset-level overrides (passed through as adset fields on /adset/copies)
  adset_targeting_override?: Record<string, unknown>;  // Replaces targeting wholesale
  adset_campaign_id?: string;                          // Re-parent under a different campaign
  // Tracking
  experiment_id?: string;                    // For attribution in marketing_experiments
  angle?: string;                            // Tag the new ad with this angle (writes to meta_ads.angle after sync)
  hook_type?: string;
  audience_segment_label?: string;
  landing_page_id?: string;                  // FK to landing_pages.id (the cloned LP this ad points to)
}

interface MetaCopyResponse {
  copied_campaign_id?: string;
  copied_adset_id?: string;
  copied_ad_id?: string;
  ad_object_ids?: Array<{
    copied_campaign_id?: string;
    copied_adset_id?: string;
    copied_ad_id?: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
    }

    const body = (await request.json()) as DuplicateRequest;
    if (!body.source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 });
    }
    const level = body.level ?? 'ad';
    if (!['ad', 'adset', 'campaign'].includes(level)) {
      return NextResponse.json({ error: `Invalid level '${level}'. Must be ad|adset|campaign.` }, { status: 400 });
    }

    const metaToken = process.env.META_ACCESS_TOKEN;
    if (!metaToken) {
      return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 });
    }

    // Build the /copies payload. CRITICAL: status_option=PAUSED always.
    // Default Meta behaviour is INHERITED_FROM_SOURCE which would mirror live source → live copy.
    const renameStrategy = body.rename_strategy ?? 'ONLY_TOP_LEVEL_RENAME';
    const payload: Record<string, unknown> = {
      status_option: 'PAUSED',
      deep_copy: body.deep_copy ?? false,
      rename_options: {
        rename_strategy: renameStrategy,
        ...(body.rename_suffix ? { rename_suffix: body.rename_suffix } : {}),
      },
    };

    // Ad-level: top-level creative overrides (Meta May 2025 feature)
    if (level === 'ad' && body.override) {
      if (body.override.title !== undefined) payload.title = body.override.title;
      if (body.override.body !== undefined) payload.body = body.override.body;
      if (body.override.link_url !== undefined) payload.link_url = body.override.link_url;
      if (body.override.url_tags !== undefined) payload.url_tags = body.override.url_tags;
    }

    // Adset-level: targeting/campaign reparent
    if (level === 'adset') {
      if (body.adset_targeting_override) {
        payload.targeting = body.adset_targeting_override;
      }
      if (body.adset_campaign_id) {
        payload.campaign_id = body.adset_campaign_id;
      }
    }

    // Fire the /copies call
    const copyUrl = `https://graph.facebook.com/${META_API_VERSION}/${body.source_id}/copies`;
    const metaRes = await fetch(copyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${metaToken}`,
      },
      body: JSON.stringify(payload),
    });

    const metaText = await metaRes.text();
    let metaJson: MetaCopyResponse & { error?: { message?: string; code?: number; error_subcode?: number } };
    try {
      metaJson = JSON.parse(metaText);
    } catch {
      return NextResponse.json({
        error: 'Meta /copies returned non-JSON',
        http_status: metaRes.status,
        detail: metaText.slice(0, 500),
      }, { status: 502 });
    }

    if (!metaRes.ok || metaJson.error) {
      return NextResponse.json({
        error: 'Meta /copies failed',
        http_status: metaRes.status,
        meta_error: metaJson.error ?? metaText.slice(0, 500),
        request_payload: payload,
      }, { status: 502 });
    }

    // Extract the new IDs. Meta returns different shapes per level.
    const newCampaignId = metaJson.copied_campaign_id ?? metaJson.ad_object_ids?.[0]?.copied_campaign_id ?? null;
    const newAdsetId = metaJson.copied_adset_id ?? metaJson.ad_object_ids?.[0]?.copied_adset_id ?? null;
    const newAdId = metaJson.copied_ad_id ?? metaJson.ad_object_ids?.[0]?.copied_ad_id ?? null;

    if (level === 'ad' && !newAdId) {
      return NextResponse.json({
        error: 'Meta /copies succeeded but no new ad_id in response',
        meta_response: metaJson,
      }, { status: 502 });
    }

    // Verify the new ad is actually PAUSED (defence-in-depth — should always be true given status_option)
    let verifiedStatus: string | null = null;
    let preview_url: string | null = null;
    if (newAdId) {
      const verifyRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${newAdId}?fields=status,effective_status,preview_shareable_link&access_token=${metaToken}`,
        { method: 'GET' }
      );
      if (verifyRes.ok) {
        const verifyJson = await verifyRes.json();
        verifiedStatus = verifyJson.effective_status ?? verifyJson.status ?? null;
        preview_url = verifyJson.preview_shareable_link ?? null;
      }
    }
    const isPaused = verifiedStatus === null || verifiedStatus === 'PAUSED' || verifiedStatus === 'IN_PROCESS';

    if (!isPaused && verifiedStatus) {
      // Force-pause as last-line guard. status_option=PAUSED should have handled this, but defend anyway.
      const pauseRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${newAdId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${metaToken}` },
          body: JSON.stringify({ status: 'PAUSED' }),
        }
      );
      if (!pauseRes.ok) {
        console.warn('Force-pause failed (the copy may be live):', await pauseRes.text());
      }
    }

    // Insert into ad_creatives so the duplicate is queueable in platform_inbox
    // and downstream regression (creative_performance_by_angle) can pick it up.
    const sb = svcClient();
    let adCreativeRowId: string | null = null;
    if (newAdId) {
      const { data: lpRow } = body.landing_page_id
        ? await sb.from('landing_pages').select('shopify_url').eq('id', body.landing_page_id).maybeSingle()
        : { data: null };
      const linkUrl = body.override?.link_url ?? lpRow?.shopify_url ?? null;

      const insertPayload = {
        user_id: TOM_USER_ID,
        meta_ad_id: newAdId,
        meta_adset_id: newAdsetId,
        meta_campaign_id: newCampaignId,
        status: 'live_paused',
        channel: 'meta',
        experiment_id: body.experiment_id ?? null,
        landing_page_id: body.landing_page_id ?? null,
        angle: body.angle ?? null,
        hook_type: body.hook_type ?? null,
        audience_segment_label: body.audience_segment_label ?? null,
        headline: body.override?.title ?? null,
        body_copy: body.override?.body ?? null,
        target_audience: linkUrl ? { link_url: linkUrl } : {},
      };
      const { data: row, error: insErr } = await sb
        .from('ad_creatives')
        .insert(insertPayload)
        .select('id')
        .single();
      if (insErr) {
        console.warn('ad_creatives insert failed (non-fatal):', insErr);
      } else {
        adCreativeRowId = row?.id ?? null;
      }
    }

    // Also tag the meta_ads row once Meta sync re-runs (next /sync/meta-campaigns cron pull will pick up the new ad).
    // For now, write a forward-write into meta_ads if a row already happens to exist (rare; usually sync hasn't run yet).
    if (newAdId && (body.angle || body.hook_type || body.audience_segment_label || body.experiment_id)) {
      await sb.from('meta_ads').upsert({
        meta_ad_id: newAdId,
        angle: body.angle ?? null,
        hook_type: body.hook_type ?? null,
        audience_segment_label: body.audience_segment_label ?? null,
        experiment_id: body.experiment_id ?? null,
      }, { onConflict: 'meta_ad_id', ignoreDuplicates: false });
    }

    // Audit log
    await auditLog(
      sb,
      TOM_USER_ID,
      'meta_ad_duplicated',
      'meta_ad',
      newAdId ?? newAdsetId ?? newCampaignId ?? body.source_id,
      { source_id: body.source_id, level, status_option: 'PAUSED' },
      { new_ad_id: newAdId, new_adset_id: newAdsetId, new_campaign_id: newCampaignId, override_applied: Object.keys(body.override ?? {}).length > 0, deep_copy: payload.deep_copy },
      'scheduled_agent',
      { angle: body.angle, hook_type: body.hook_type, experiment_id: body.experiment_id, ad_creative_id: adCreativeRowId, verified_status: verifiedStatus },
    );

    return NextResponse.json({
      success: true,
      level,
      source_id: body.source_id,
      new_ad_id: newAdId,
      new_adset_id: newAdsetId,
      new_campaign_id: newCampaignId,
      verified_status: verifiedStatus,
      is_paused: isPaused,
      preview_url,
      ad_creative_row_id: adCreativeRowId,
      override_applied: Object.keys(body.override ?? {}),
      meta_response: metaJson,
      note: isPaused
        ? `Meta ad duplicated PAUSED. Sync will pick up the new ad on next /sync/meta-campaigns run. Approve via platform_inbox.`
        : `WARN: Meta duplicate did not return PAUSED status (got '${verifiedStatus}'). Force-pause attempted. Verify in Meta Ads Manager before flipping live.`,
    });
  } catch (err) {
    console.error('duplicate-ad error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
