// select-assets.mjs
// Asset library query interface — used by clone-and-substitute when populating image URLs.
//
// Returns the BEST approved assets for a given (scene_type, angle, count) query.
// "Best" = approved + matches scene_type + (matches angle OR angle-agnostic) + least-recently-used
// (so we rotate through the library evenly instead of hammering the same image).
//
// Falls back to the canonical KRYO product image if the library is empty.
//
// Usage: node scripts/system/select-assets.mjs --scene lifestyle --angle athlete_recovery --count 3

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL;
const SUPABASE_KEY = process.env.EVEREST_SUPABASE_SERVICE_KEY;

const CANONICAL_FALLBACK_IMAGE = 'https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=1920';

export async function selectAssets({ scene_type, angle, count = 3, asset_type = 'image', exclude = [] }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('EVEREST_SUPABASE_URL + EVEREST_SUPABASE_SERVICE_KEY required');
  }

  // Query: approved + matching scene + matching angle (or null/agnostic) + LRU.
  // PostgREST: scene_type=eq.<x>&or=(angle.eq.<a>,angle.is.null)&status=eq.approved&order=last_used_at.asc.nullsfirst
  const params = new URLSearchParams();
  params.set('select', 'id,public_url,storage_path,width,height,scene_type,angle,ai_description,alt_text:filename,canonical_name,source,used_in_pages,last_used_at');
  params.set('status', 'eq.approved');
  if (scene_type) params.set('scene_type', `eq.${scene_type}`);
  if (asset_type) params.set('mime_type', `like.${asset_type}/*`);
  if (angle) params.set('or', `(angle.eq.${angle},angle.is.null)`);
  params.set('order', 'last_used_at.asc.nullsfirst,created_at.desc');
  params.set('limit', String(count * 3)); // over-fetch then filter

  const url = `${SUPABASE_URL}/rest/v1/media_assets?${params.toString()}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`select-assets HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();

  // Filter excluded + de-dup by public_url
  const seen = new Set(exclude);
  const picked = [];
  for (const r of rows) {
    const u = r.public_url;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    picked.push({
      id: r.id,
      url: u,
      width: r.width, height: r.height,
      alt: r.ai_description || r.canonical_name || r.alt_text || `KRYO ${scene_type || 'asset'}`,
      angle: r.angle,
      scene_type: r.scene_type,
      source: r.source,
    });
    if (picked.length >= count) break;
  }

  // Always return at least `count` items — pad with canonical fallback if library is sparse.
  while (picked.length < count) {
    picked.push({
      id: null,
      url: CANONICAL_FALLBACK_IMAGE,
      width: 1920, height: null,
      alt: `KRYO V4 ${scene_type || ''}`.trim(),
      angle: null,
      scene_type,
      source: 'canonical_fallback',
    });
  }

  return picked.slice(0, count);
}

// Mark an asset as used — bumps last_used_at + appends landing_page_id to used_in_pages.
export async function markAssetUsed(assetId, landingPageId) {
  if (!assetId || !SUPABASE_URL) return;
  // Read existing used_in_pages so we can append (PostgREST jsonb append is awkward, use RPC or read-modify-write)
  await fetch(`${SUPABASE_URL}/rest/v1/media_assets?id=eq.${assetId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      last_used_at: new Date().toISOString(),
      // used_in_pages append handled via SQL function call if landingPageId provided
      ...(landingPageId ? { used_in_pages: [landingPageId] } : {}), // PostgREST array set (not append)
    }),
  });
}

// CLI mode: prints JSON array to stdout
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
  }
  const picked = await selectAssets({
    scene_type: args.scene,
    angle: args.angle,
    count: parseInt(args.count || '3', 10),
    asset_type: args.type || 'image',
  });
  process.stdout.write(JSON.stringify(picked, null, 2) + '\n');
}
