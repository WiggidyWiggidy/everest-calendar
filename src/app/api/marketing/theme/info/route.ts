// /api/marketing/theme/info
// Returns the live (published) theme's id, handle, role. Probes write_themes scope by
// attempting GET on assets endpoint. Skill-mode auth via x-sync-secret.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

export async function GET(request: NextRequest) {
  if (!authSkill(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  let shopifyUrl: string;
  let shopifyToken: string;
  try {
    shopifyUrl = getShopifyStoreUrl();
    shopifyToken = await getShopifyToken();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const themesRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/themes.json`, {
    headers: { 'X-Shopify-Access-Token': shopifyToken },
  });
  if (!themesRes.ok) {
    return NextResponse.json({
      error: `themes.json HTTP ${themesRes.status}`,
      detail: await themesRes.text().catch(() => ''),
      hint: themesRes.status === 403 ? 'Likely missing read_themes / write_themes scope on the app config.' : undefined,
    }, { status: themesRes.status === 403 ? 403 : 502 });
  }
  const themesPayload = await themesRes.json();
  const themes = (themesPayload.themes ?? []) as Array<{ id: number; name: string; role: string; created_at: string; updated_at: string }>;
  const live = themes.find((t) => t.role === 'main');
  if (!live) {
    return NextResponse.json({ error: 'No theme with role=main found', themes }, { status: 404 });
  }

  const assetsProbe = await fetch(
    `https://${shopifyUrl}/admin/api/2025-04/themes/${live.id}/assets.json?fields=key`,
    { headers: { 'X-Shopify-Access-Token': shopifyToken } },
  );
  const assetsProbeOk = assetsProbe.ok;
  let assetCount: number | null = null;
  let kryoAssets: string[] = [];
  if (assetsProbeOk) {
    const ap = await assetsProbe.json();
    const list = (ap.assets ?? []) as Array<{ key: string }>;
    assetCount = list.length;
    kryoAssets = list
      .filter((a) => a.key.startsWith('sections/kryo-') || a.key.startsWith('templates/product.kryo-'))
      .map((a) => a.key);
  }

  return NextResponse.json({
    success: true,
    live_theme: { id: live.id, name: live.name, role: live.role, updated_at: live.updated_at },
    other_themes: themes.filter((t) => t.role !== 'main').map((t) => ({ id: t.id, name: t.name, role: t.role })),
    asset_endpoint_reachable: assetsProbeOk,
    asset_endpoint_status: assetsProbe.status,
    asset_count: assetCount,
    kryo_assets_already_deployed: kryoAssets,
    write_themes_scope_likely_present: assetsProbeOk,
    note: assetsProbeOk
      ? 'Assets endpoint reachable. write_themes scope is required for PUT — this confirms read_themes only.'
      : 'Assets endpoint unreachable. Likely missing read_themes / write_themes scope on the app config.',
  });
}
