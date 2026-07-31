import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

function authOk(req: NextRequest): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

interface RedirectBody {
  path?: string;
  target?: string;
}

export async function POST(request: NextRequest) {
  if (!authOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: RedirectBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const path = body.path?.trim();
  const target = body.target?.trim();
  if (!path || !target) {
    return NextResponse.json({ error: 'path and target required' }, { status: 400 });
  }
  if (!path.startsWith('/')) {
    return NextResponse.json({ error: 'path must start with /' }, { status: 400 });
  }
  if (!target.startsWith('/')) {
    return NextResponse.json({ error: 'target must start with /' }, { status: 400 });
  }

  try {
    const shopifyUrl = getShopifyStoreUrl();
    const shopifyToken = await getShopifyToken();

    const listRes = await fetch(`https://${shopifyUrl}/admin/api/2024-01/redirects.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': shopifyToken },
    });
    if (!listRes.ok) {
      const detail = await listRes.text();
      return NextResponse.json({ error: `Redirect list failed: ${listRes.status}`, detail }, { status: 500 });
    }

    const listJson = await listRes.json();
    const existing = (listJson.redirects ?? []).find((r: { id: number; path: string; target: string }) => r.path === path);

    if (existing) {
      const updateRes = await fetch(`https://${shopifyUrl}/admin/api/2024-01/redirects/${existing.id}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ redirect: { id: existing.id, path, target } }),
      });
      const updateText = await updateRes.text();
      if (!updateRes.ok) {
        return NextResponse.json({ error: `Redirect update failed: ${updateRes.status}`, detail: updateText }, { status: 500 });
      }
      return NextResponse.json({ success: true, mode: 'updated', path, target, redirect_id: existing.id, raw: updateText });
    }

    const createRes = await fetch(`https://${shopifyUrl}/admin/api/2024-01/redirects.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ redirect: { path, target } }),
    });
    const createText = await createRes.text();
    if (!createRes.ok) {
      return NextResponse.json({ error: `Redirect create failed: ${createRes.status}`, detail: createText }, { status: 500 });
    }
    return NextResponse.json({ success: true, mode: 'created', path, target, raw: createText });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Internal error' }, { status: 500 });
  }
}
