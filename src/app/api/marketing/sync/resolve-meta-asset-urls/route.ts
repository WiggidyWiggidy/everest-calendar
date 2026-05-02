// /api/marketing/sync/resolve-meta-asset-urls
// Resolves Meta image hashes → URLs (via /adimages) and video IDs → source URLs (via /{video_id}).
// Pure HTTP fetch + SQL upsert. Zero LLM cost.
// Cron-callable. KRYO-only scope by default — only resolves assets attached to product_line='kryo' ads.
//
// Result: meta_creative_assets gets asset_image_url + asset_video_url + asset_thumbnail_url populated,
// turning the asset library into a queryable winning-creatives database that points at real images/videos
// graphic designers (or AI variation tools) can reference directly.

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

interface AssetRow { id: string; meta_ad_id: string; asset_image_hash: string | null; asset_video_id: string | null }

async function resolveImageHashes(adAccountId: string, token: string, hashes: string[]): Promise<Record<string, { url?: string; permalink_url?: string }>> {
  // /v25.0/{ad_account}/adimages?hashes=["h1","h2",...]&fields=hash,url,permalink_url
  const out: Record<string, { url?: string; permalink_url?: string }> = {};
  if (hashes.length === 0) return out;
  // Batch up to 100 per call
  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);
    const url = `https://graph.facebook.com/v25.0/${adAccountId}/adimages` +
      `?hashes=${encodeURIComponent(JSON.stringify(batch))}` +
      `&fields=hash,url,permalink_url` +
      `&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('adimages fetch failed', res.status, await res.text().catch(() => ''));
      continue;
    }
    const json = await res.json();
    // Response shape: { data: { <hash>: { hash, url, permalink_url } } } OR { data: [{...}] }
    const data = json.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.hash) out[item.hash] = { url: item.url, permalink_url: item.permalink_url };
      }
    } else if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        const item = data[k];
        if (item?.hash) out[item.hash] = { url: item.url, permalink_url: item.permalink_url };
      }
    }
    // 200ms breath between batches
    await new Promise(r => setTimeout(r, 200));
  }
  return out;
}

async function resolveVideoId(videoId: string, token: string): Promise<{ source?: string; permalink_url?: string; picture?: string } | null> {
  const url = `https://graph.facebook.com/v25.0/${videoId}?fields=source,permalink_url,picture&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    if (!authSync(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!metaToken || !adAccountId) {
      return NextResponse.json({ error: 'Meta credentials missing' }, { status: 400 });
    }

    let kryoOnly = true;
    let limit = 200;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.kryo_only === false) kryoOnly = false;
      if (typeof body.limit === 'number') limit = Math.min(Math.max(body.limit, 1), 500);
    } catch { /* defaults */ }

    const sb = svcClient();

    // Pull image-asset rows needing URL resolution
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: imageRows, error: imgErr } = await sb
      .from('meta_creative_assets')
      .select('id, meta_ad_id, asset_image_hash, asset_video_id, meta_ads!inner(product_line)')
      .eq('asset_type', 'image')
      .is('asset_image_url', null)
      .not('asset_image_hash', 'is', null)
      .filter(kryoOnly ? 'meta_ads.product_line' : 'id', kryoOnly ? 'eq' : 'not.is', kryoOnly ? 'kryo' : null as unknown as string)
      .limit(limit);
    if (imgErr) {
      // Fallback: ignore the inner-join filter syntax variation if PostgREST complains
    }

    // Re-do simpler: 2 queries, then filter in TS
    const { data: rawImages } = await sb
      .from('meta_creative_assets')
      .select('id, meta_ad_id, asset_image_hash, asset_video_id')
      .eq('asset_type', 'image')
      .is('asset_image_url', null)
      .not('asset_image_hash', 'is', null)
      .limit(limit);
    const { data: rawVideos } = await sb
      .from('meta_creative_assets')
      .select('id, meta_ad_id, asset_image_hash, asset_video_id')
      .eq('asset_type', 'video')
      .is('asset_video_url', null)
      .not('asset_video_id', 'is', null)
      .limit(limit);

    let kryoAdIds = new Set<string>();
    if (kryoOnly) {
      const { data: kryoAds } = await sb.from('meta_ads').select('meta_ad_id').eq('product_line', 'kryo');
      kryoAdIds = new Set((kryoAds ?? []).map((r: { meta_ad_id: string }) => r.meta_ad_id));
    }

    const images = ((rawImages ?? []) as AssetRow[]).filter(r => !kryoOnly || kryoAdIds.has(r.meta_ad_id));
    const videos = ((rawVideos ?? []) as AssetRow[]).filter(r => !kryoOnly || kryoAdIds.has(r.meta_ad_id));

    // Resolve images
    const uniqueHashes = Array.from(new Set(images.map(r => r.asset_image_hash!).filter(Boolean)));
    const hashToUrl = await resolveImageHashes(adAccountId, metaToken, uniqueHashes);
    let imagesUpdated = 0;
    for (const row of images) {
      const resolved = row.asset_image_hash ? hashToUrl[row.asset_image_hash] : null;
      if (resolved?.url) {
        const { error } = await sb
          .from('meta_creative_assets')
          .update({ asset_image_url: resolved.url, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (!error) imagesUpdated++;
      }
    }

    // Resolve videos (one call each — Meta doesn't support batch on video reads cleanly)
    let videosUpdated = 0;
    for (const row of videos) {
      if (!row.asset_video_id) continue;
      const v = await resolveVideoId(row.asset_video_id, metaToken);
      if (v?.source || v?.permalink_url) {
        await sb.from('meta_creative_assets').update({
          asset_video_url: v.source ?? v.permalink_url ?? null,
          asset_thumbnail_url: v.picture ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        videosUpdated++;
      }
      await new Promise(r => setTimeout(r, 150)); // gentle on rate limit
    }

    return NextResponse.json({
      success: true,
      kryo_only: kryoOnly,
      images_examined: images.length,
      images_updated: imagesUpdated,
      videos_examined: videos.length,
      videos_updated: videosUpdated,
    });
  } catch (err) {
    console.error('resolve-meta-asset-urls error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
