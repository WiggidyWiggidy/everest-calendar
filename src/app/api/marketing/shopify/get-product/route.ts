// Read a Shopify product by handle or ID — returns template_suffix + full body_html.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
// Use: GET /api/marketing/shopify/get-product?handle=kryo_
//   or GET /api/marketing/shopify/get-product?id=9331613204788

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

interface ShopifyProductResponse {
  product?: {
    id?: number;
    title?: string;
    handle?: string;
    template_suffix?: string | null;
    body_html?: string;
    vendor?: string;
    tags?: string;
    images?: Array<{ src: string; alt?: string }>;
    variants?: Array<{ id: number; title: string; price: string }>;
  };
  products?: Array<ShopifyProductResponse['product']>;
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const handle = req.nextUrl.searchParams.get('handle');
  const id = req.nextUrl.searchParams.get('id');
  if (!handle && !id) {
    return NextResponse.json({ error: 'handle or id query param required' }, { status: 400 });
  }

  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const url = handle
    ? `https://${storeUrl}/admin/api/2024-10/products.json?handle=${encodeURIComponent(handle)}&fields=id,title,handle,template_suffix,body_html,vendor,tags,images,variants`
    : `https://${storeUrl}/admin/api/2024-10/products/${id}.json?fields=id,title,handle,template_suffix,body_html,vendor,tags,images,variants`;

  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Shopify ${res.status}: ${(await res.text()).slice(0, 500)}` },
      { status: 500 },
    );
  }

  const data: ShopifyProductResponse = await res.json();
  const product = data.product ?? data.products?.[0];
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: product.id,
    handle: product.handle,
    title: product.title,
    template_suffix: product.template_suffix ?? null,
    template_filename: product.template_suffix
      ? `templates/product.${product.template_suffix}.json`
      : 'templates/product.json',
    body_html_length: (product.body_html ?? '').length,
    body_html_preview: (product.body_html ?? '').slice(0, 500),
    image_count: product.images?.length ?? 0,
    variants: product.variants?.map((v) => ({ id: v.id, title: v.title, price: v.price })),
  });
}
