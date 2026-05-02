// /api/marketing/launch/publish-product
// Publishes an EXISTING Shopify product to all sales-channel publications + all markets.
// Used by fix-shopify-markets.mjs to retroactively publish KRYO test variants that were
// created without the publish_active=true flag (via the legacy clone-page path).
//
// Auth: x-sync-secret.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

function authOk(req: NextRequest): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

interface PublishRequest {
  shopify_product_id: string | number;
  status?: 'ACTIVE' | 'DRAFT';  // optional — also flip status if supplied
}

export async function POST(request: NextRequest) {
  if (!authOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PublishRequest;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.shopify_product_id) {
    return NextResponse.json({ error: 'shopify_product_id required' }, { status: 400 });
  }

  let shopifyUrl: string, shopifyToken: string;
  try {
    shopifyUrl = getShopifyStoreUrl();
    shopifyToken = await getShopifyToken();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const productGid = `gid://shopify/Product/${body.shopify_product_id}`;

  // 1. Optionally flip product status (DRAFT → ACTIVE)
  if (body.status) {
    const statusRes = await fetch(`https://${shopifyUrl}/admin/api/2024-01/products/${body.shopify_product_id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
      body: JSON.stringify({ product: { id: parseInt(String(body.shopify_product_id), 10), status: body.status.toLowerCase() } }),
    });
    if (!statusRes.ok) {
      console.warn('product status flip failed (non-fatal):', statusRes.status);
    }
  }

  // 2. Fetch all publications (sales channels)
  const pubsRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
    body: JSON.stringify({ query: `query { publications(first: 25) { edges { node { id name } } } }` }),
  });
  if (!pubsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch publications', detail: await pubsRes.text() }, { status: 502 });
  }
  const pubsPayload = await pubsRes.json();
  const publications: Array<{ id: string; name: string }> =
    pubsPayload?.data?.publications?.edges?.map((e: { node: { id: string; name: string } }) => e.node) ?? [];

  if (publications.length === 0) {
    return NextResponse.json({ error: 'No publications found for shop' }, { status: 502 });
  }

  // 3. Publish to all publications (productPublish via publishablePublish)
  const publishRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
    body: JSON.stringify({
      query: `
        mutation Publish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable { ... on Product { id status onlineStoreUrl } }
            userErrors { field message }
          }
        }
      `,
      variables: { id: productGid, input: publications.map((p) => ({ publicationId: p.id })) },
    }),
  });

  const publishPayload = await publishRes.json();
  const userErrors = publishPayload?.data?.publishablePublish?.userErrors ?? [];

  // 4. Try to also publish to all market catalogs (Markets feature) so the storefront URL works from any geo.
  // Only Plus shops have full Markets API; for non-Plus, publishablePublish to all publications is enough.
  // We attempt the markets call optimistically and ignore failures.
  let marketsPublished = 0;
  try {
    const catRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
      body: JSON.stringify({
        query: `query { catalogs(first: 25, type: MARKET) { edges { node { id title status } } } }`,
      }),
    });
    if (catRes.ok) {
      const catPayload = await catRes.json();
      const catalogs: Array<{ id: string; title: string }> =
        catPayload?.data?.catalogs?.edges?.map((e: { node: { id: string; title: string } }) => e.node) ?? [];
      if (catalogs.length > 0) {
        const catalogPublishRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
          body: JSON.stringify({
            query: `
              mutation PubAvail($id: ID!, $input: [PublicationInput!]!) {
                publishablePublish(id: $id, input: $input) {
                  userErrors { field message }
                }
              }
            `,
            variables: { id: productGid, input: catalogs.map((c) => ({ publicationId: c.id })) },
          }),
        });
        if (catalogPublishRes.ok) {
          marketsPublished = catalogs.length;
        }
      }
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    success: userErrors.length === 0,
    shopify_product_id: body.shopify_product_id,
    publications_count: publications.length,
    publications: publications.map((p) => p.name),
    markets_published: marketsPublished,
    user_errors: userErrors,
  });
}
