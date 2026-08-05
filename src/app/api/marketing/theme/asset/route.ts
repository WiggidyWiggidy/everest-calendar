// Read theme assets — list by prefix or read a single asset's content.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
//
// GET /api/marketing/theme/asset?theme_id=X&prefix=templates/
// GET /api/marketing/theme/asset?theme_id=X&key=templates/product.kryo.json

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

const SHOPIFY_API_VERSION = '2026-07';

interface ShopifyAssetListItem {
  key: string;
  size: number;
  checksum?: string | null;
  content_type?: string;
  created_at?: string;
  updated_at?: string;
  public_url?: string | null;
  value?: string;
  attachment?: string;
}

async function getLiveThemeId(storeUrl: string, token: string): Promise<number> {
  const res = await fetch(`https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/themes.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok) throw new Error(`themes.json ${res.status}`);
  const data = await res.json();
  const main = data.themes?.find((t: { role: string; id: number }) => t.role === 'main');
  if (!main) throw new Error('No main theme found');
  return main.id;
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const themeIdParam = req.nextUrl.searchParams.get('theme_id');
  const prefix = req.nextUrl.searchParams.get('prefix');
  const key = req.nextUrl.searchParams.get('key');

  if (!prefix && !key) {
    return NextResponse.json({ error: 'Provide either ?prefix= or ?key=' }, { status: 400 });
  }

  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const themeId = themeIdParam ? Number(themeIdParam) : await getLiveThemeId(storeUrl, token);

  if (key) {
    const url = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Shopify ${res.status}: ${(await res.text()).slice(0, 500)}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    const asset = data.asset as ShopifyAssetListItem | undefined;
    return NextResponse.json({
      theme_id: themeId,
      key: asset?.key ?? null,
      checksum_md5: asset?.checksum ?? null,
      created_at: asset?.created_at ?? null,
      updated_at: asset?.updated_at ?? null,
      content_type: asset?.content_type ?? null,
      size: asset?.size ?? null,
      value: asset?.value ?? null,
      attachment_b64: asset?.attachment ?? null,
    });
  }

  const res = await fetch(
    `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/themes/${themeId}/assets.json`,
    { headers: { 'X-Shopify-Access-Token': token } },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Shopify ${res.status}: ${(await res.text()).slice(0, 500)}` },
      { status: res.status },
    );
  }
  const data = await res.json();
  const all: ShopifyAssetListItem[] = data.assets ?? [];
  const filtered = prefix ? all.filter((a) => a.key.startsWith(prefix)) : all;
  filtered.sort((a, b) => a.key.localeCompare(b.key));

  return NextResponse.json({
    theme_id: themeId,
    total: all.length,
    returned: filtered.length,
    prefix,
    assets: filtered.map((a) => ({
      key: a.key,
      size: a.size,
      checksum_md5: a.checksum ?? null,
      updated_at: a.updated_at ?? null,
    })),
  });
}
