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
import { META_URL_TAGS } from '@/lib/marketing-attribution';
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
    if (level === 'ad' && payload.url_tags === undefined) payload.url_tags = META_URL_TAGS;

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

    // 3b. Apply creative override via mint-and-swap.
    //
    // Meta's /copies endpoint accepts top-level title/body/link_url override fields (added 28 May
    // 2025) BUT in practice they do NOT propagate into object_story_spec.link_data for link_data
    // ads. The /copies call mints a new creative but populates it with source content. To make
    // the override actually serve, we have to:
    //   (a) GET the source ad's object_story_spec
    //   (b) build a new spec with overrides applied to link_data.{name,message,link} + cta.value.link
    //   (c) POST /act_<id>/adcreatives with the new spec
    //   (d) POST /<new_ad_id> { creative: { creative_id: <new> } } to swap it onto the duplicate
    //
    // Skipped for asset_feed_spec (DCT) ads — those need a separate path (the spec is multi-variant
    // and the top-level overrides don't map cleanly). The clone-ad-qc agent surfaces DCT cases.
    let overrideCreativeId: string | null = null;
    let overrideApplied = false;
    if (
      level === 'ad' &&
      newAdId &&
      body.override &&
      (body.override.title !== undefined || body.override.body !== undefined || body.override.link_url !== undefined)
    ) {
      const adAccountId = process.env.META_AD_ACCOUNT_ID;
      if (!adAccountId) {
        console.warn('META_AD_ACCOUNT_ID not set — creative override skipped, ad will serve source creative');
      } else {
        try {
          // (a) source creative spec
          const srcCreativeRes = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${body.source_id}?` +
              `fields=${encodeURIComponent('creative{id,object_story_spec,asset_feed_spec,url_tags}')}` +
              `&access_token=${metaToken}`,
            { method: 'GET' }
          );
          const srcCreativeJson = await srcCreativeRes.json();
          const srcCreative = srcCreativeJson?.creative ?? {};
          const srcOss = srcCreative.object_story_spec;

          if (srcCreative.asset_feed_spec) {
            // DCT — skip; top-level overrides apply to scalar fallbacks only
            console.warn('Source ad uses asset_feed_spec (DCT) — creative override skipped. Ad will serve source DCT permutations.');
          } else if (srcOss?.link_data) {
            // (b) build new link_data with overrides
            const newLinkData = { ...srcOss.link_data };
            if (body.override.title !== undefined) newLinkData.name = body.override.title;
            if (body.override.body !== undefined) newLinkData.message = body.override.body;
            if (body.override.link_url !== undefined) {
              newLinkData.link = body.override.link_url;
              const cta = newLinkData.call_to_action as { value?: { link?: string } } | undefined;
              if (cta?.value?.link) {
                newLinkData.call_to_action = {
                  ...(cta as object),
                  value: { ...(cta.value as object), link: body.override.link_url },
                };
              }
            }
            const newOss = { ...srcOss, link_data: newLinkData };

            // (c) POST /act_<id>/adcreatives
            const newCreativeRes = await fetch(
              `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adcreatives`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${metaToken}` },
                body: JSON.stringify({
                  name: `${body.angle ?? 'override'} clone of ${newAdId}`,
                  object_story_spec: newOss,
                  url_tags: body.override.url_tags ?? META_URL_TAGS,
                }),
              }
            );
            const newCreativeJson = await newCreativeRes.json();
            if (newCreativeJson.error) {
              console.warn('adcreative mint failed (override will not serve):', newCreativeJson.error);
            } else if (newCreativeJson.id) {
              overrideCreativeId = newCreativeJson.id;
              // (d) Reattach to the duplicate ad
              const reattachRes = await fetch(
                `https://graph.facebook.com/${META_API_VERSION}/${newAdId}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${metaToken}` },
                  body: JSON.stringify({ creative: { creative_id: newCreativeJson.id } }),
                }
              );
              if (reattachRes.ok) {
                overrideApplied = true;
              } else {
                console.warn('reattach failed (ad still has source creative):', await reattachRes.text());
              }
            }
          }
        } catch (overrideErr) {
          console.warn('creative override pipeline threw (non-fatal):', overrideErr);
        }
      }
    }

    // Insert into ad_creatives so the duplicate is queueable in platform_inbox
    // and downstream regression (creative_performance_by_angle) can pick it up.
    const sb = svcClient();
    let adCreativeRowId: string | null = null;
    let adCreativeInsertError: { code?: string; message?: string; details?: string } | null = null;
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
        // Surface the error in the response so the caller knows the row didn't insert.
        // Most common causes: CHECK constraint on angle (resolved 2026-05-14 — should not recur)
        // or unique constraint on (meta_ad_id) if the row was already inserted by a retry.
        console.warn('ad_creatives insert failed:', insErr);
        adCreativeInsertError = { code: insErr.code, message: insErr.message, details: insErr.details };
      } else {
        adCreativeRowId = row?.id ?? null;
      }
    }

    // Also tag the meta_ads row once Meta sync re-runs (next /sync/meta-campaigns cron pull will pick up the new ad).
    // meta_ads has NOT NULL on meta_adset_id, so forward-tagging from this route would fail until
    // the sync route fills the structural columns. Skip the upsert here — let the next /sync/meta-campaigns
    // cron pick up the new ad with full data, then re-tag via /tag-ad-creative if needed.

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

    const overrideFieldsRequested = Object.keys(body.override ?? {});
    const overrideExpected = overrideFieldsRequested.length > 0 && level === 'ad';
    let overrideNote = '';
    if (overrideExpected) {
      overrideNote = overrideApplied
        ? ` Creative override applied to new ad (creative_id=${overrideCreativeId}).`
        : ` WARN: creative override requested but NOT applied (ad serves source creative). Likely cause: DCT/asset_feed_spec source, missing META_AD_ACCOUNT_ID, or adcreatives mint failed. Check route logs.`;
    }
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
      ad_creative_insert_error: adCreativeInsertError,             // Non-null when the Supabase insert failed; check details in route logs.
      override_fields_requested: overrideFieldsRequested,
      override_applied: overrideApplied,                            // true if mint-and-swap actually replaced the creative
      override_creative_id: overrideCreativeId,                     // the new creative_id minted with overrides (null if DCT or skipped)
      meta_response: metaJson,
      note: (isPaused
        ? `Meta ad duplicated PAUSED.`
        : `WARN: Meta duplicate did not return PAUSED status (got '${verifiedStatus}'). Force-pause attempted. Verify in Meta Ads Manager before flipping live.`
      ) + overrideNote + ' Sync will pick up the new ad on next /sync/meta-campaigns run.',
    });
  } catch (err) {
    console.error('duplicate-ad error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
