// /api/marketing/launch/winning-creative-brief
// Designer / AI-tool pull endpoint. Returns a JSON pack ready to paste into a graphic-designer brief
// or feed an image-gen tool to produce variations of the winners.
//
// Pure SQL read on ice_shower_winning_creatives view (KRYO + NUE Shower + iceshower_legacy ONLY).
// Cold-plunge-tub data (EverestPod, EverestEvo) is hard-excluded by the view's WHERE clause.
// Zero LLM cost.
//
// Query params (all optional):
//   asset_type   = title | body | image | video | call_to_action     (default: image)
//   n            = how many winners to return                          (default: 3, max: 20)
//   include_misses = true | false                                      (default: false; if true, also return $0-spend assets)
//
// Auth: x-sync-secret OR Supabase user session.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

async function authenticate(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  if (secret && secret === process.env.MARKETING_SYNC_SECRET) {
    return { ok: true, userId: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { ok: true, userId: user.id } : { ok: false, userId: null };
}

interface Winner {
  asset_row_id: string;
  meta_ad_id: string;
  ad_name: string | null;
  product_line: string | null;
  asset_type: string;
  asset_text: string | null;
  asset_image_hash: string | null;
  asset_image_url: string | null;
  asset_video_id: string | null;
  asset_video_url: string | null;
  asset_thumbnail_url: string | null;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_purchases: number;
  total_revenue: number;
  ctr_pct: number | null;
  roas: number | null;
  cpa: number | null;
  days_active: number;
  rank_by_spend: number;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const assetType = (url.searchParams.get('asset_type') ?? 'image').toLowerCase();
    const allowedTypes = new Set(['title', 'body', 'image', 'video', 'call_to_action', 'description']);
    if (!allowedTypes.has(assetType)) {
      return NextResponse.json({ error: `asset_type must be one of: ${Array.from(allowedTypes).join(', ')}` }, { status: 400 });
    }
    const n = Math.min(Math.max(parseInt(url.searchParams.get('n') ?? '3'), 1), 20);
    const includeMisses = url.searchParams.get('include_misses') === 'true';

    const sb = auth.userId ? await createClient() : createServiceClient();

    // Pull winners from the ice_shower view (KRYO/NUE/iceshower_legacy only — cold_plunge_tub excluded).
    let query = sb
      .from('ice_shower_winning_creatives')
      .select('*')
      .eq('asset_type', assetType)
      .order('rank_by_spend', { ascending: true })
      .limit(n);
    if (!includeMisses) {
      // Skip $0-spend assets when looking at winners only
      query = query.gt('total_spend', 0);
    }

    const { data: winners, error: wErr } = await query;
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

    // Pull associated context: titles + bodies tested alongside the asset's parent ad
    const winnerAdIds = Array.from(new Set((winners ?? []).map((w: Winner) => w.meta_ad_id))).filter(Boolean);
    let associatedTitles: string[] = [];
    let associatedBodies: string[] = [];
    if (winnerAdIds.length > 0) {
      const { data: ctx } = await sb
        .from('meta_creative_assets')
        .select('asset_type, asset_text')
        .in('meta_ad_id', winnerAdIds)
        .in('asset_type', ['title', 'body'])
        .not('asset_text', 'is', null);
      associatedTitles = Array.from(new Set((ctx ?? []).filter(c => c.asset_type === 'title').map(c => c.asset_text as string)));
      associatedBodies = Array.from(new Set((ctx ?? []).filter(c => c.asset_type === 'body').map(c => c.asset_text as string)));
    }

    // Pull canonical product context for designer brief grounding
    const { data: canonical } = await sb
      .from('product_context')
      .select('content')
      .eq('context_key', 'kryo_v4_canonical')
      .maybeSingle();

    // Composition rules derived from the live KRYO source page (hard-coded — these are facts, not opinions)
    const compositionRules: string[] = [
      'Product is KRYO V4 cold plunge — not EverestPod, NUE Shower, or EverestEvo.',
      'Price anchor: AED 3,990 starting OR 4 × AED 997.50 monthly. NEVER reference $1,690 / $1,990 / EverestPod pricing.',
      'Comparison anchor: AED 18,000+ industrial tubs (KRYO is the cheaper alternative).',
      'Geo: UAE primary (12x ROAS history). Use Dubai high-rise / luxury apartment imagery.',
      'Core spec callouts: 1°C precision, 14L pressurised reservoir, 0.1HP compressor, IPX4, 3-min zero-drill install, 0.15 m² footprint.',
      'Hero image style: studio shot of black anodized KRYO unit (matches Side_angle_1.webp on /products/kryo_).',
      'Voice: tight, physics-grounded, no em dashes, no hype. Match canonical "ensuite cryo-engine" framing.',
    ];

    return NextResponse.json({
      product_family: 'ice_shower',
      product_lines_in_scope: ['kryo', 'nue_shower', 'iceshower_legacy'],
      product_lines_excluded: ['everestpod', 'everestevo', 'cold_plunge_tub'],
      asset_type: assetType,
      n_requested: n,
      include_misses: includeMisses,
      winners: winners ?? [],
      associated_text_context: {
        titles_tested_in_winning_ads: associatedTitles,
        bodies_tested_in_winning_ads: associatedBodies.map(b => b.length > 500 ? b.slice(0, 500) + '…' : b),
      },
      canonical_product: canonical?.content ?? null,
      composition_rules: compositionRules,
      designer_instructions: [
        `1. Open this brief and the ${(winners ?? []).length} winner(s) above.`,
        `2. Generate ${assetType === 'image' ? '5–10 image variations' : assetType === 'video' ? '3–5 video variations' : '3 copy variations'} that preserve what made the winners work (composition, framing, anchor messaging) while varying ONE element at a time.`,
        `3. Reference composition_rules — every variation must respect those constraints.`,
        `4. Reject anything that touches EverestPod, NUE Shower, or EverestEvo branding.`,
        `5. Output URLs / files; don't write copy unless asset_type=title|body|description.`,
      ],
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('winning-creative-brief error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
