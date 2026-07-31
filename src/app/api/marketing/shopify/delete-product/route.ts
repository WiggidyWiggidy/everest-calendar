import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

function authOk(req: NextRequest): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

export async function POST(request: NextRequest) {
  if (!authOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { product_id?: string | number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.product_id) {
    return NextResponse.json({ error: 'product_id required' }, { status: 400 });
  }

  try {
    const shopifyUrl = getShopifyStoreUrl();
    const shopifyToken = await getShopifyToken();
    const productId = String(body.product_id);

    const res = await fetch(`https://${shopifyUrl}/admin/api/2024-01/products/${productId}.json`, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: `Shopify delete failed: ${res.status}`, detail }, { status: 500 });
    }

    return NextResponse.json({ success: true, product_id: productId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Internal error' }, { status: 500 });
  }
}
