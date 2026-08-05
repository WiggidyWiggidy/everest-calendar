// Read a Shopify product by handle or ID — deterministic state for KRYO execution tasks.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
// Use: GET /api/marketing/shopify/get-product?handle=kryo2
//   or GET /api/marketing/shopify/get-product?id=9334472311092

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

interface ShopifyVariant {
  id?: number;
  title?: string;
  price?: string;
  inventory_quantity?: number;
  inventory_policy?: string;
  inventory_management?: string | null;
}

interface ShopifyImage {
  id?: number;
  src?: string;
  alt?: string | null;
  position?: number;
}

interface ShopifyProduct {
  id?: number;
  title?: string;
  handle?: string;
  status?: string;
  template_suffix?: string | null;
  body_html?: string;
  vendor?: string;
  tags?: string;
  images?: ShopifyImage[];
  variants?: ShopifyVariant[];
}

interface ShopifyProductResponse {
  product?: ShopifyProduct;
  products?: ShopifyProduct[];
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

  const fields = 'id,title,handle,status,template_suffix,body_html,vendor,tags,images,variants';
  const url = handle
    ? `https://${storeUrl}/admin/api/2024-10/products.json?handle=${encodeURIComponent(handle)}&fields=${fields}`
    : `https://${storeUrl}/admin/api/2024-10/products/${id}.json?fields=${fields}`;

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

  const variants = (product.variants ?? []).map((v) => {
    const inventoryQuantity = Number(v.inventory_quantity ?? 0);
    const inventoryPolicy = v.inventory_policy ?? null;
    return {
      id: v.id,
      title: v.title,
      price: v.price,
      inventory_quantity: inventoryQuantity,
      inventory_policy: inventoryPolicy,
      inventory_management: v.inventory_management ?? null,
      sellable_now: inventoryQuantity > 0 || inventoryPolicy === 'continue',
    };
  });

  const totalInventory = variants.reduce((sum, v) => sum + Math.max(0, v.inventory_quantity), 0);

  return NextResponse.json({
    id: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status ?? null,
    template_suffix: product.template_suffix ?? null,
    template_filename: product.template_suffix
      ? `templates/product.${product.template_suffix}.json`
      : 'templates/product.json',
    body_html_length: (product.body_html ?? '').length,
    body_html_preview: (product.body_html ?? '').slice(0, 500),
    total_inventory: totalInventory,
    image_count: product.images?.length ?? 0,
    images: (product.images ?? []).map((img) => ({
      id: img.id,
      src: img.src,
      alt: img.alt ?? null,
      position: img.position ?? null,
    })),
    variants,
  });
}
