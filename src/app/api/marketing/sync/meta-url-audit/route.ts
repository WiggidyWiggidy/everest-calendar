import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isCanonicalMetaTags, META_URL_TAGS } from '@/lib/marketing-attribution';

type Creative = {
  id?: string;
  url_tags?: string;
  object_story_spec?: { link_data?: { link?: string } };
  asset_feed_spec?: { link_urls?: Array<{ website_url?: string }> };
};
type MetaAd = { id: string; name?: string; status?: string; effective_status?: string; creative?: Creative };

function authorized(request: NextRequest) {
  return request.headers.get('x-sync-secret') === process.env.MARKETING_SYNC_SECRET;
}

function destination(creative?: Creative) {
  return creative?.object_story_spec?.link_data?.link ||
    creative?.asset_feed_spec?.link_urls?.[0]?.website_url || null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const account = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!account || !token) return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 400 });
  const sb = createServiceClient();
  try {
    const fields = 'id,name,status,effective_status,creative{id,url_tags,object_story_spec,asset_feed_spec}';
    let next: string | undefined = `https://graph.facebook.com/v25.0/${account}/ads?fields=${encodeURIComponent(fields)}&effective_status=${encodeURIComponent(JSON.stringify(['ACTIVE']))}&limit=200&access_token=${encodeURIComponent(token)}`;
    const ads: MetaAd[] = [];
    while (next) {
      const response = await fetch(next, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Meta ads audit failed ${response.status}: ${(await response.text()).slice(0, 600)}`);
      const page = await response.json() as { data?: MetaAd[]; paging?: { next?: string } };
      ads.push(...(page.data ?? []));
      next = page.paging?.next;
    }
    const broken = ads.filter(ad => !isCanonicalMetaTags(ad.creative?.url_tags));
    const now = new Date().toISOString();
    for (const ad of broken) {
      await sb.from('marketing_guardrail_alerts').upsert({
        fingerprint: `meta_url_tags_missing:${ad.id}`,
        alert_type: 'meta_url_tags_missing',
        severity: 'high',
        entity_type: 'meta_ad',
        entity_id: ad.id,
        status: 'open',
        evidence: { ad_name: ad.name, destination: destination(ad.creative), current_url_tags: ad.creative?.url_tags ?? null, required_url_tags: META_URL_TAGS },
        last_seen_at: now,
      }, { onConflict: 'fingerprint' });
    }
    return NextResponse.json({
      success: true,
      active_ads_checked: ads.length,
      broken_ads: broken.map(ad => ({ meta_ad_id: ad.id, name: ad.name, destination: destination(ad.creative), url_tags: ad.creative?.url_tags ?? null })),
      required_url_tags: META_URL_TAGS,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
