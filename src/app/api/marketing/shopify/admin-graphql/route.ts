import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

export async function POST(request: NextRequest) {
  if (!authSkill(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  let body: { query?: string; variables?: Record<string, unknown> };
  try {
    body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.query || typeof body.query !== 'string') {
    return NextResponse.json({ error: 'query (string) required' }, { status: 400 });
  }

  let shopifyUrl: string;
  let shopifyToken: string;
  try {
    shopifyUrl = getShopifyStoreUrl();
    shopifyToken = await getShopifyToken();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const res = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyToken,
    },
    body: JSON.stringify({
      query: body.query,
      variables: body.variables ?? {},
    }),
  });

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  return NextResponse.json(
    {
      success: res.ok,
      status: res.status,
      payload,
    },
    { status: res.ok ? 200 : 502 },
  );
}
