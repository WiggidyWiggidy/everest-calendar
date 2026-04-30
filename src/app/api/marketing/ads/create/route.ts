import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      ad_creative_id,
      campaign_name,
      adset_name,
      daily_budget,
      target_audience,
      landing_url,    // optional override; defaults to /products/kryo_ if missing
    } = await request.json();

    if (!ad_creative_id) {
      return NextResponse.json({ error: 'ad_creative_id required' }, { status: 400 });
    }

    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!metaToken || !adAccountId) {
      return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 400 });
    }

    // Get the creative
    const { data: creative, error: creativeError } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('id', ad_creative_id)
      .eq('user_id', user.id)
      .single();

    if (creativeError || !creative) {
      return NextResponse.json({ error: 'Creative not found' }, { status: 404 });
    }

    if (!creative.composite_image_url) {
      return NextResponse.json({ error: 'Creative has no composite image. Generate one first.' }, { status: 400 });
    }

    // Step 1: Create campaign
    const campaignRes = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/campaigns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaign_name || `ISU-001 ${creative.headline || 'Ad'} - ${new Date().toISOString().split('T')[0]}`,
          objective: 'OUTCOME_SALES',
          status: 'PAUSED',
          special_ad_categories: [],
          access_token: metaToken,
        }),
      }
    );

    if (!campaignRes.ok) {
      const err = await campaignRes.text();
      return NextResponse.json({ error: 'Meta Campaign API error', detail: err }, { status: 500 });
    }
    const campaignData = await campaignRes.json();
    const campaignId = campaignData.id;

    // Step 2: Create ad set
    const adsetRes = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/adsets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: adset_name || `${creative.headline || 'Ad'} - Adset`,
          campaign_id: campaignId,
          daily_budget: Math.round((daily_budget || creative.daily_budget || 10) * 100),
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: target_audience || creative.target_audience || {
            geo_locations: { countries: ['AU'] },
            age_min: 25,
            age_max: 55,
          },
          status: 'PAUSED',
          access_token: metaToken,
        }),
      }
    );

    if (!adsetRes.ok) {
      const err = await adsetRes.text();
      return NextResponse.json({ error: 'Meta Adset API error', detail: err }, { status: 500 });
    }
    const adsetData = await adsetRes.json();
    const adsetId = adsetData.id;

    // Step 3: Upload image to Meta
    const imageRes = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/adimages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: creative.composite_image_url,
          access_token: metaToken,
        }),
      }
    );

    let imageHash = '';
    if (imageRes.ok) {
      const imageData = await imageRes.json();
      const images = imageData.images as Record<string, { hash: string }> | undefined;
      imageHash = images ? Object.values(images)[0]?.hash ?? '' : '';
    }

    // Step 4: Create ad creative on Meta
    // UTM contract: every link emits utm_source=meta + utm_medium=paid + UTM template tokens
    // ({{campaign.id}}, {{adset.id}}, {{ad.id}}) which Meta substitutes at click-time.
    // This solves the chicken-and-egg of needing the ad_id in the URL before the ad exists.
    // Caller can override the base URL by passing `landing_url` in the request body — defaults to
    // the canonical KRYO product page if not provided.
    const baseLandingUrl =
      (typeof landing_url === 'string' && landing_url.length > 0)
        ? landing_url
        : (process.env.SHOPIFY_STORE_URL
            ? `https://${process.env.SHOPIFY_STORE_URL}/products/kryo_`
            : 'https://everestlabs.co/products/kryo_');
    const utmTaggedLink = (() => {
      const url = new URL(baseLandingUrl);
      url.searchParams.set('utm_source', 'meta');
      url.searchParams.set('utm_medium', 'paid');
      url.searchParams.set('utm_campaign', '{{campaign.id}}');
      url.searchParams.set('utm_content', '{{ad.id}}');
      // Meta auto-decodes {{}} tokens at click-time even when URL-encoded.
      return url.toString();
    })();

    const adCreativeRes = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/adcreatives`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: creative.headline || 'KRYO Ad',
          object_story_spec: {
            page_id: process.env.META_PAGE_ID,
            link_data: {
              image_hash: imageHash,
              link: utmTaggedLink,
              message: creative.body_copy || '',
              name: creative.headline || 'KRYO',
              call_to_action: { type: 'SHOP_NOW' },
            },
          },
          access_token: metaToken,
        }),
      }
    );

    let metaCreativeId = '';
    if (adCreativeRes.ok) {
      const adCreativeData = await adCreativeRes.json();
      metaCreativeId = adCreativeData.id;
    }

    // Step 5: Create the ad
    const adRes = await fetch(
      `https://graph.facebook.com/v25.0/${adAccountId}/ads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: creative.headline || 'ISU-001 Ad',
          adset_id: adsetId,
          creative: { creative_id: metaCreativeId },
          status: 'PAUSED',
          access_token: metaToken,
        }),
      }
    );

    let metaAdId = '';
    if (adRes.ok) {
      const adData = await adRes.json();
      metaAdId = adData.id;
    }

    // Update our creative record
    await supabase
      .from('ad_creatives')
      .update({
        meta_ad_id: metaAdId,
        meta_campaign_id: campaignId,
        meta_adset_id: adsetId,
        status: 'live',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ad_creative_id)
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      meta_campaign_id: campaignId,
      meta_adset_id: adsetId,
      meta_ad_id: metaAdId,
      note: 'Ad created in PAUSED state. Enable in Meta Ads Manager when ready.',
    });
  } catch (err) {
    console.error('ads/create error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: List ad creatives with metrics
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: creatives, error } = await supabase
      .from('ad_creatives')
      .select('*, ad_metrics_daily(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ creatives: creatives ?? [] });
  } catch (err) {
    console.error('ads/create GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
