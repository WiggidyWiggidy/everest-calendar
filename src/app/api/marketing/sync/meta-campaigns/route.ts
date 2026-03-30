import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

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

interface MetaPagedResponse<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

async function fetchAllPages<T>(url: string, token: string): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = `${url}&access_token=${token}&limit=200`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta API error: ${res.status} ${err}`);
    }
    const json: MetaPagedResponse<T> = await res.json();
    all.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }
  return all;
}

interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

interface MetaAdsetRaw {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  optimization_goal?: string;
  daily_budget?: string;
  targeting?: Record<string, unknown>;
}

interface MetaAdRaw {
  id: string;
  name: string;
  adset_id: string;
  status: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    link_url?: string;
    call_to_action_type?: string;
    asset_feed_spec?: Record<string, unknown>;
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!metaToken || !adAccountId) {
      return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 400 });
    }

    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();
    const userId = auth.userId || DEFAULT_USER_ID;

    // 1. Fetch all campaigns
    const campaignFields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time';
    const campaigns = await fetchAllPages<MetaCampaignRaw>(
      `https://graph.facebook.com/v25.0/${adAccountId}/campaigns?fields=${campaignFields}`,
      metaToken
    );

    // 2. Fetch all adsets
    const adsetFields = 'id,name,campaign_id,status,optimization_goal,daily_budget,targeting';
    const adsets = await fetchAllPages<MetaAdsetRaw>(
      `https://graph.facebook.com/v25.0/${adAccountId}/adsets?fields=${adsetFields}`,
      metaToken
    );

    // 3. Fetch all ads with creative details
    const adFields = 'id,name,adset_id,status,creative{id,name,title,body,image_url,thumbnail_url,link_url,call_to_action_type,asset_feed_spec}';
    const ads = await fetchAllPages<MetaAdRaw>(
      `https://graph.facebook.com/v25.0/${adAccountId}/ads?fields=${encodeURIComponent(adFields)}`,
      metaToken
    );

    const stats = { campaigns: 0, adsets: 0, ads: 0, errors: [] as string[] };

    // Upsert campaigns
    for (const c of campaigns) {
      const { error } = await supabase.from('meta_campaigns').upsert({
        user_id: userId,
        meta_campaign_id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective ?? null,
        daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null, // Meta returns cents
        lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
        start_time: c.start_time ?? null,
        stop_time: c.stop_time ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'meta_campaign_id' });
      if (error) stats.errors.push(`campaign ${c.id}: ${error.message}`);
      else stats.campaigns++;
    }

    // Upsert adsets (only those whose campaign exists)
    const campaignIds = new Set(campaigns.map(c => c.id));
    for (const a of adsets) {
      if (!campaignIds.has(a.campaign_id)) continue;
      const { error } = await supabase.from('meta_adsets').upsert({
        user_id: userId,
        meta_adset_id: a.id,
        meta_campaign_id: a.campaign_id,
        name: a.name,
        status: a.status,
        optimization_goal: a.optimization_goal ?? null,
        daily_budget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
        targeting: a.targeting ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'meta_adset_id' });
      if (error) stats.errors.push(`adset ${a.id}: ${error.message}`);
      else stats.adsets++;
    }

    // Upsert ads (only those whose adset exists)
    const adsetIds = new Set(adsets.map(a => a.id));
    for (const ad of ads) {
      if (!adsetIds.has(ad.adset_id)) continue;
      const cr = ad.creative;
      const { error } = await supabase.from('meta_ads').upsert({
        user_id: userId,
        meta_ad_id: ad.id,
        meta_adset_id: ad.adset_id,
        name: ad.name,
        status: ad.status,
        headline: cr?.title ?? null,
        body: cr?.body ?? null,
        image_url: cr?.image_url ?? null,
        thumbnail_url: cr?.thumbnail_url ?? null,
        link_url: cr?.link_url ?? null,
        cta_type: cr?.call_to_action_type ?? null,
        is_dynamic_creative: !!cr?.asset_feed_spec,
        asset_feed_spec: cr?.asset_feed_spec ?? null,
        creative_id: cr?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'meta_ad_id' });
      if (error) stats.errors.push(`ad ${ad.id}: ${error.message}`);
      else stats.ads++;
    }

    return NextResponse.json({
      synced: true,
      discovered: {
        campaigns: stats.campaigns,
        adsets: stats.adsets,
        ads: stats.ads,
      },
      errors: stats.errors.length > 0 ? stats.errors : undefined,
    });
  } catch (err) {
    console.error('sync/meta-campaigns error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
