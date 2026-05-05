// /api/marketing/launch/promote-ads
// Pushes ad_creatives with status='ready_to_promote' into Meta as PAUSED ads.
// This is the ONLY route that hits the Meta write API.
// Fires manually (Tom triggers) once Meta billing is settled + token has ads_management scope.
//
// Until billing is settled, do NOT call this. The /process-approvals route just flags ad_creatives
// as ready_to_promote — they sit until Tom is ready to push to Meta.
//
// Auth: x-sync-secret.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auditLog, enforceAdPaused } from '@/lib/marketing-safety';

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

async function metaCreateCampaign(adAccountId: string, token: string, name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch(`https://graph.facebook.com/v25.0/${adAccountId}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      special_ad_categories: [],
      // Meta added this required field 2026; explicit false = use adset-level budgets (which we set)
      is_adset_budget_sharing_enabled: false,
      access_token: token,
    }),
  });
  if (!res.ok) return { ok: false, error: `Campaign create: ${res.status} ${await res.text().catch(() => '')}` };
  const d = await res.json();
  return { ok: true, id: d.id };
}

async function metaCreateAdset(adAccountId: string, token: string, campaignId: string, name: string, dailyBudget: number, audience: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`https://graph.facebook.com/v25.0/${adAccountId}/adsets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      campaign_id: campaignId,
      daily_budget: Math.round(dailyBudget * 100), // cents
      billing_event: 'IMPRESSIONS',
      // LINK_CLICKS used here because OFFSITE_CONVERSIONS requires promoted_object
      // (pixel_id + custom_event_type). Tom can upgrade to PURCHASE optimization
      // in Meta Ads Manager UI after review — this gets the ads created PAUSED first.
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: audience,
      status: 'PAUSED',
      start_time: startTime,
      access_token: token,
    }),
  });
  if (!res.ok) return { ok: false, error: `Adset create: ${res.status} ${await res.text().catch(() => '')}` };
  const d = await res.json();
  return { ok: true, id: d.id };
}

async function metaUploadImage(adAccountId: string, token: string, imageUrl: string): Promise<{ ok: boolean; hash?: string; error?: string }> {
  const params = new URLSearchParams({ url: imageUrl, access_token: token });
  const res = await fetch(`https://graph.facebook.com/v25.0/${adAccountId}/adimages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) return { ok: false, error: `Adimage: ${res.status} ${await res.text().catch(() => '')}` };
  const d = await res.json();
  const hash = d.images ? Object.values(d.images)[0] as { hash?: string } : null;
  return { ok: true, hash: hash?.hash };
}

async function metaCreateCreative(adAccountId: string, token: string, c: { headline: string; body_copy: string; image_url: string; link: string; cta_type?: string; }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch(`https://graph.facebook.com/v25.0/${adAccountId}/adcreatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: c.headline.slice(0, 80),
      object_story_spec: {
        page_id: process.env.META_PAGE_ID,
        link_data: {
          // picture URL bypasses /adimages capability requirement
          picture: c.image_url,
          link: c.link,
          message: c.body_copy,
          name: c.headline,
          call_to_action: { type: c.cta_type || 'SHOP_NOW' },
        },
      },
      access_token: token,
    }),
  });
  if (!res.ok) return { ok: false, error: `Creative: ${res.status} ${await res.text().catch(() => '')}` };
  const d = await res.json();
  return { ok: true, id: d.id };
}

async function metaCreateAd(adAccountId: string, token: string, name: string, adsetId: string, creativeId: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload = enforceAdPaused({
    name: name.slice(0, 80),
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: 'PAUSED',
    access_token: token,
  });
  const res = await fetch(`https://graph.facebook.com/v25.0/${adAccountId}/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: `Ad: ${res.status} ${await res.text().catch(() => '')}` };
  const d = await res.json();
  return { ok: true, id: d.id };
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!metaToken || !adAccountId) {
      return NextResponse.json({ error: 'META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set' }, { status: 400 });
    }

    const sb = svcClient();
    // Accept an optional experiment_id filter — when running a specific split test,
    // pass {experiment_id: "..."} to push only that experiment's drafts.
    const reqBody = (await request.json().catch(() => ({}))) as { experiment_id?: string };

    let query = sb
      .from('ad_creatives')
      .select('*')
      .eq('user_id', TOM_USER_ID)
      .in('status', ['ready_to_promote', 'draft'])
      .is('meta_ad_id', null)
      .order('created_at', { ascending: true })
      .limit(20);

    if (reqBody.experiment_id) {
      query = query.eq('experiment_id', reqBody.experiment_id);
    }

    const { data: ready, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!ready || ready.length === 0) {
      return NextResponse.json({
        success: true,
        promoted: 0,
        note: reqBody.experiment_id
          ? `No draft/ready ad_creatives found for experiment_id=${reqBody.experiment_id}.`
          : 'No ad_creatives at status=ready_to_promote or draft.',
      });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const c of ready) {
      try {
        if (!c.composite_image_url) {
          results.push({ ad_creative_id: c.id, status: 'skipped', reason: 'composite_image_url missing — generate or fall back to product photo first' });
          continue;
        }

        const datePart = new Date().toISOString().split('T')[0];
        const campaign = await metaCreateCampaign(adAccountId, metaToken, `KRYO ${c.headline?.slice(0, 40) || 'Ad'} - ${datePart}`);
        if (!campaign.ok) { results.push({ ad_creative_id: c.id, status: 'failed', step: 'campaign', error: campaign.error }); continue; }

        // Strip our custom fields and add Meta-required advantage_audience flag
        // (required since Meta API v22+; explicit 0 = Advantage Audience disabled)
        const audienceForMeta: Record<string, unknown> = { ...(c.target_audience as Record<string, unknown> ?? {}) };
        delete audienceForMeta.link_url;
        delete audienceForMeta.landing_page_id;
        delete audienceForMeta.cell_label;
        audienceForMeta.targeting_automation = { advantage_audience: 0 };

        const adset = await metaCreateAdset(adAccountId, metaToken, campaign.id!, `${c.headline?.slice(0, 40) || 'KRYO'} - adset`, Number(c.daily_budget) || 15, audienceForMeta);
        if (!adset.ok) { results.push({ ad_creative_id: c.id, status: 'failed', step: 'adset', error: adset.error }); continue; }

        // Bypass /adimages upload — uses Meta capability our app doesn't have.
        // Meta's link_data.picture accepts a URL directly, no upload required.
        // composite_image_url is the canonical CDN URL we already have.

        // Build the click-through URL.
        // Per-cell link_url (set in target_audience.link_url at draft time) takes precedence;
        // falls back to /products/kryo_ if missing. UTM params append for cell-level attribution
        // join via {{ad.id}} (Meta substitutes at click-time, even when URL-encoded).
        const audience = (c.target_audience as { link_url?: string; landing_page_id?: string } | null) ?? {};
        const baseLink = audience.link_url || `https://${process.env.SHOPIFY_STORE_URL || 'everestlabs.co'}/products/kryo_`;
        const linkObj = new URL(baseLink);
        if (!linkObj.searchParams.has('utm_source')) linkObj.searchParams.set('utm_source', 'meta');
        if (!linkObj.searchParams.has('utm_medium')) linkObj.searchParams.set('utm_medium', 'paid_social');
        if (!linkObj.searchParams.has('utm_campaign')) linkObj.searchParams.set('utm_campaign', '{{campaign.id}}');
        if (!linkObj.searchParams.has('utm_content')) linkObj.searchParams.set('utm_content', '{{ad.id}}');
        const link = linkObj.toString();
        const creative = await metaCreateCreative(adAccountId, metaToken, {
          headline: c.headline || 'KRYO',
          body_copy: c.body_copy || '',
          image_url: c.composite_image_url,
          link,
          cta_type: c.cta_text === 'Learn More' ? 'LEARN_MORE' : 'SHOP_NOW',
        });
        if (!creative.ok) { results.push({ ad_creative_id: c.id, status: 'failed', step: 'creative', error: creative.error }); continue; }

        const ad = await metaCreateAd(adAccountId, metaToken, c.headline || 'KRYO Ad', adset.id!, creative.id!);
        if (!ad.ok) { results.push({ ad_creative_id: c.id, status: 'failed', step: 'ad', error: ad.error }); continue; }

        await sb
          .from('ad_creatives')
          .update({
            meta_campaign_id: campaign.id,
            meta_adset_id: adset.id,
            meta_ad_id: ad.id,
            status: 'live_paused',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id);

        await auditLog(
          sb,
          TOM_USER_ID,
          'ad_promoted_paused_to_meta',
          'ad_creative',
          c.id,
          { status: 'ready_to_promote', meta_ad_id: null },
          { status: 'live_paused', meta_ad_id: ad.id, meta_adset_id: adset.id, meta_campaign_id: campaign.id },
          'scheduled_agent',
          { headline: c.headline },
        );

        results.push({
          ad_creative_id: c.id,
          status: 'live_paused',
          meta_campaign_id: campaign.id,
          meta_adset_id: adset.id,
          meta_ad_id: ad.id,
        });
      } catch (e) {
        results.push({ ad_creative_id: c.id, status: 'errored', error: (e as Error).message });
      }
    }

    return NextResponse.json({ success: true, promoted: results.filter(r => r.status === 'live_paused').length, results });
  } catch (err) {
    console.error('promote-ads error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
