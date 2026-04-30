// /api/marketing/images/generate
// Cloud image generation via fal.ai FLUX endpoints — produces premium product/lifestyle imagery
// for KRYO landing-page variants. Indexes generated images into media_assets for reuse.
//
// Caller: /launch-kryo skill (variant-specific hero/comparison/lifestyle imagery), or Tom direct.
// Auth: x-sync-secret header (reuses MARKETING_SYNC_SECRET).
// Cost: ~$0.025/image on FLUX.1 dev. Tom adds FAL_API_KEY to Vercel env.
//
// This is NOT an LLM call — it's an image generation API. Tom's "no paid LLM" rule does not apply.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/dev';

const ASPECT_TO_FAL_SIZE: Record<string, string> = {
  square: 'square_hd',           // 1024x1024 — Meta square ad
  landscape: 'landscape_16_9',   // 16:9 hero
  portrait: 'portrait_16_9',     // 9:16 reel/story
  landscape_4_3: 'landscape_4_3',
};

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface GenerateRequest {
  prompt: string;
  variant_angle?: string;
  aspect?: keyof typeof ASPECT_TO_FAL_SIZE;
  count?: number;
  category?: 'product_hero' | 'lifestyle' | 'feature' | 'social_proof' | 'packaging' | 'other';
  tags?: string[];
}

interface FalImage { url: string; width?: number; height?: number; content_type?: string }
interface FalResponse { images?: FalImage[]; seed?: number; timings?: Record<string, number> }

export async function POST(request: NextRequest) {
  if (!authSkill(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) {
    return NextResponse.json({ error: 'FAL_API_KEY not set in environment' }, { status: 500 });
  }

  const body = (await request.json()) as GenerateRequest;
  if (!body.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const aspect = body.aspect ?? 'landscape';
  const image_size = ASPECT_TO_FAL_SIZE[aspect] ?? 'landscape_16_9';
  const count = Math.max(1, Math.min(4, body.count ?? 1));

  const falRes = await fetch(FAL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: body.prompt,
      image_size,
      num_images: count,
      enable_safety_checker: true,
    }),
  });

  if (!falRes.ok) {
    const detail = await falRes.text().catch(() => '');
    return NextResponse.json({ error: `fal.ai HTTP ${falRes.status}`, detail: detail.slice(0, 500) }, { status: 502 });
  }

  const falPayload = (await falRes.json()) as FalResponse;
  const images = falPayload.images ?? [];
  if (images.length === 0) {
    return NextResponse.json({ error: 'fal.ai returned no images', detail: JSON.stringify(falPayload).slice(0, 500) }, { status: 502 });
  }

  // Index in media_assets so future /launch-kryo runs can reuse.
  const sb = svcClient();
  const inserted: Array<{ id: string; public_url: string; ai_category: string | null; width: number | null; height: number | null }> = [];
  for (const img of images) {
    const { data, error } = await sb
      .from('media_assets')
      .insert({
        user_id: TOM_USER_ID,
        storage_path: `fal:${img.url}`,        // we don't re-upload; fal hosts the file
        public_url: img.url,
        filename: `fal-${Date.now()}.jpg`,
        file_size: null,
        mime_type: img.content_type ?? 'image/jpeg',
        width: img.width ?? null,
        height: img.height ?? null,
        ai_category: body.category ?? 'other',
        ai_description: body.prompt.slice(0, 1000),
        ai_tags: [...(body.tags ?? []), ...(body.variant_angle ? [`variant:${body.variant_angle}`] : []), 'fal.ai', 'flux'],
        ai_suitable_for: body.variant_angle ? [body.variant_angle] : null,
        status: 'active',
      })
      .select('id, public_url, ai_category, width, height')
      .single();
    if (error) {
      console.warn('media_assets insert failed (non-fatal):', error.message);
      continue;
    }
    if (data) inserted.push(data as { id: string; public_url: string; ai_category: string | null; width: number | null; height: number | null });
  }

  return NextResponse.json({
    success: true,
    images: images.map((i) => ({ url: i.url, width: i.width ?? null, height: i.height ?? null })),
    media_asset_ids: inserted.map((r) => r.id),
    fal_seed: falPayload.seed ?? null,
    cost_estimate_usd: count * 0.025,
  });
}
