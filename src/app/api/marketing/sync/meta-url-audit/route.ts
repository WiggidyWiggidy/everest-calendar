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
    let next: string | undefined = `https://graph.facebook.com/v25.0/${account}/ads?fields=${encodeURIComponent(fields)}&limit=500&access_token=${encodeURIComponent(token)}`;
    const allAds: MetaAd[] = [];
    while (next) {
      const response = await fetch(next, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Meta ads audit failed ${response.status}: ${(await response.text()).slice(0, 600)}`);
      const page = await response.json() as { data?: MetaAd[]; paging?: { next?: string } };
      allAds.push(...(page.data ?? []));
      next = page.paging?.next;
    }
    const ads = allAds.filter(ad => ad.status === 'ACTIVE');
    const broken = ads.filter(ad => !isCanonicalMetaTags(ad.creative?.url_tags));
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 86400000).toISOString();
    const upsertAlert = async (fingerprint: string, alertType: string, severity: 'warning' | 'medium' | 'high', entityId: string | null, evidence: Record<string, unknown>) => {
      await sb.from('marketing_guardrail_alerts').upsert({
        fingerprint, alert_type: alertType, severity, entity_type: entityId ? 'meta_ad' : 'site',
        entity_id: entityId, status: 'open', evidence, last_seen_at: now,
      }, { onConflict: 'fingerprint' });
    };
    for (const ad of broken) {
      await upsertAlert(`meta_url_tags_missing:${ad.id}`, 'meta_url_tags_missing', 'high', ad.id,
        { ad_name: ad.name, destination: destination(ad.creative), current_url_tags: ad.creative?.url_tags ?? null, required_url_tags: META_URL_TAGS });
    }
    const healthyIds = ads.filter(ad => isCanonicalMetaTags(ad.creative?.url_tags)).map(ad => ad.id);
    if (healthyIds.length) {
      await sb.from('marketing_guardrail_alerts').update({ status: 'resolved', resolved_at: now, last_seen_at: now })
        .eq('alert_type', 'meta_url_tags_missing').in('entity_id', healthyIds).eq('status', 'open');
    }
    const { data: metricRows = [] } = await sb.from('meta_ad_metrics_hourly').select('meta_ad_id,spend,link_clicks,landing_page_views').gte('report_hour', since);
    const metrics = new Map<string, { spend: number; clicks: number; lpv: number }>();
    for (const row of metricRows ?? []) {
      const current = metrics.get(row.meta_ad_id) ?? { spend: 0, clicks: 0, lpv: 0 };
      current.spend += Number(row.spend ?? 0); current.clicks += Number(row.link_clicks ?? 0); current.lpv += Number(row.landing_page_views ?? 0);
      metrics.set(row.meta_ad_id, current);
    }
    const { data: touchRows = [] } = await sb.from('attribution_touches').select('session_id,meta_ad_id').eq('page_path', '/products/kryo2')
      .eq('traffic_class', 'paid_meta').eq('is_internal', false).gte('ts', since);
    const sessionsByAd = new Map<string, Set<string>>();
    for (const row of touchRows ?? []) {
      if (!row.meta_ad_id) continue;
      if (!sessionsByAd.has(row.meta_ad_id)) sessionsByAd.set(row.meta_ad_id, new Set());
      sessionsByAd.get(row.meta_ad_id)!.add(row.session_id);
    }
    for (const [adId, metric] of Array.from(metrics.entries())) {
      if ((metric.spend >= 5 || metric.clicks >= 5) && metric.lpv === 0) {
        await upsertAlert(`meta_spend_no_lpv:${adId}`, 'meta_spend_no_lpv', 'high', adId, metric);
      }
      if (metric.clicks >= 10 && metric.lpv / metric.clicks < 0.6) {
        await upsertAlert(`meta_low_lpv_to_click:${adId}`, 'meta_low_lpv_to_click', 'medium', adId, { ...metric, lpv_to_click_rate: metric.lpv / metric.clicks });
      }
      if (metric.lpv >= 5 && (sessionsByAd.get(adId)?.size ?? 0) === 0) {
        await upsertAlert(`meta_lpv_no_matched_sessions:${adId}`, 'meta_lpv_no_matched_sessions', 'high', adId, { ...metric, matched_sessions: 0 });
      }
    }
    const paidSessions = new Set((touchRows ?? []).map(row => row.session_id)).size;
    const identifiedSessions = new Set((touchRows ?? []).filter(row => row.meta_ad_id).map(row => row.session_id)).size;
    if (paidSessions >= 10 && identifiedSessions / paidSessions < 0.9) {
      await upsertAlert('meta_paid_session_id_coverage', 'meta_paid_session_id_coverage', 'high', null, { paid_sessions: paidSessions, identified_sessions: identifiedSessions, coverage: identifiedSessions / paidSessions });
    }
    return NextResponse.json({
      success: true,
      active_ads_checked: ads.length,
      broken_ads: broken.map(ad => ({ meta_ad_id: ad.id, name: ad.name, destination: destination(ad.creative), url_tags: ad.creative?.url_tags ?? null })),
      downstream_checks: { ads_with_metrics: metrics.size, paid_sessions: paidSessions, identified_sessions: identifiedSessions },
      required_url_tags: META_URL_TAGS,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
