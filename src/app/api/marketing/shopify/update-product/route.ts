// Update a Shopify product's title and/or handle in place.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
//
// POST /api/marketing/shopify/update-product
// {
//   "product_id": 9331849003316,
//   "title": "KRYO 2.0",            // optional
//   "handle": "kryo-2-0"            // optional, must be slug-safe
// }
//
// Shopify auto-creates a 301 redirect from the old handle to the new one.
// At least one of title/handle must be supplied.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { product_id?: string | number; title?: string; handle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { product_id, title, handle } = body;
  if (!product_id) {
    return NextResponse.json({ error: 'product_id required' }, { status: 400 });
  }
  if (title === undefined && handle === undefined) {
    return NextResponse.json(
      { error: 'At least one of title or handle must be supplied' },
      { status: 400 },
    );
  }
  if (handle !== undefined && !HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: `Invalid handle "${handle}" — must match ${HANDLE_RE}` },
      { status: 400 },
    );
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim().length < 1)) {
    return NextResponse.json({ error: 'title must be non-empty string' }, { status: 400 });
  }

  const numericId = typeof product_id === 'string' ? parseInt(product_id, 10) : product_id;
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: `Invalid product_id: ${product_id}` }, { status: 400 });
  }

  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const productPayload: Record<string, unknown> = { id: numericId };
  if (title !== undefined) productPayload.title = title;
  if (handle !== undefined) productPayload.handle = handle;

  const updateRes = await fetch(
    `https://${storeUrl}/admin/api/2024-10/products/${numericId}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ product: productPayload }),
    },
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text().catch(() => '');
    return NextResponse.json(
      { error: `Shopify ${updateRes.status}: ${errText.slice(0, 800)}` },
      { status: 500 },
    );
  }

  const data = await updateRes.json();
  const finalHandle = data.product?.handle as string | undefined;
  const finalTitle = data.product?.title as string | undefined;

  return NextResponse.json({
    success: true,
    product_id: numericId,
    title: finalTitle,
    handle: finalHandle,
    storefront_url: finalHandle ? `https://${storeUrl}/products/${finalHandle}` : null,
    public_url: finalHandle ? `https://everestlabs.co/en-gb/products/${finalHandle}` : null,
    note: 'Shopify auto-creates a 301 redirect from the previous handle.',
  });
}
