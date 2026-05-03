// Update a Shopify product's body_html in place — no clone, no new product.
// Accepts: { product_id: string|number, body_html: string }
// Auth: x-sync-secret header matching MARKETING_SYNC_SECRET.
//
// Use case: iterate the long-form page on the same product URL.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

export async function POST(req: NextRequest) {
  const syncSecret = req.headers.get('x-sync-secret');
  if (syncSecret !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { product_id?: string | number; body_html?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { product_id, body_html } = body;
  if (!product_id || typeof body_html !== 'string') {
    return NextResponse.json(
      { error: 'product_id and body_html (string) are required' },
      { status: 400 },
    );
  }
  if (body_html.length < 100) {
    return NextResponse.json(
      { error: `body_html too short (${body_html.length} chars). Refusing to wipe product.` },
      { status: 400 },
    );
  }

  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const numericId = typeof product_id === 'string' ? parseInt(product_id, 10) : product_id;
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: `Invalid product_id: ${product_id}` }, { status: 400 });
  }

  const updateRes = await fetch(
    `https://${storeUrl}/admin/api/2024-01/products/${numericId}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ product: { id: numericId, body_html } }),
    },
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text().catch(() => '');
    return NextResponse.json(
      { error: `Shopify ${updateRes.status}: ${errText.slice(0, 500)}` },
      { status: 500 },
    );
  }

  const data = await updateRes.json();
  return NextResponse.json({
    success: true,
    product_id: numericId,
    handle: data.product?.handle,
    body_html_length: body_html.length,
    storefront_url: `https://${storeUrl}/products/${data.product?.handle ?? ''}`,
  });
}
