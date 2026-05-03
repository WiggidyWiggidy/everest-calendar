// Lists ALL files in the Shopify backend (Settings → Files), not just product-attached.
// Auth: x-sync-secret header matching MARKETING_SYNC_SECRET (no user session needed).
// Returns: array of { url, alt, mimeType, width, height, createdAt } sorted by recency.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

interface FileEdgeNode {
  alt?: string | null;
  createdAt?: string;
  image?: { url?: string; altText?: string; width?: number; height?: number };
  mimeType?: string;
  originalSource?: { url?: string; fileSize?: number };
}

const QUERY = `
  query Files($cursor: String) {
    files(first: 100, after: $cursor, query: "media_type:IMAGE") {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          alt
          createdAt
          ... on MediaImage {
            image { url altText width height }
            mimeType
            originalSource { url fileSize }
          }
        }
      }
    }
  }
`;

export async function GET(req: NextRequest) {
  const syncSecret = req.headers.get('x-sync-secret');
  if (syncSecret !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let token: string;
  let storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const filter = req.nextUrl.searchParams.get('filter')?.toLowerCase() ?? '';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '300'), 1000);

  const all: Array<{
    url: string;
    alt: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    createdAt: string;
  }> = [];

  let cursor: string | null = null;
  do {
    const res = await fetch(`https://${storeUrl}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Shopify ${res.status}: ${(await res.text()).slice(0, 500)}` },
        { status: 500 },
      );
    }
    const data = await res.json();
    if (data.errors) {
      return NextResponse.json({ error: 'GraphQL', detail: data.errors }, { status: 500 });
    }
    const block = data.data?.files;
    if (!block) break;
    for (const edge of block.edges) {
      const n: FileEdgeNode = edge.node;
      const url = n.image?.url ?? n.originalSource?.url ?? '';
      if (!url) continue;
      all.push({
        url,
        alt: n.alt ?? n.image?.altText ?? '',
        mimeType: n.mimeType ?? '',
        width: n.image?.width ?? null,
        height: n.image?.height ?? null,
        createdAt: n.createdAt ?? '',
      });
    }
    cursor = block.pageInfo.hasNextPage ? block.pageInfo.endCursor : null;
    if (all.length >= limit) break;
  } while (cursor);

  // Filter by filename keyword if requested
  const filtered = filter
    ? all.filter((f) => f.url.toLowerCase().includes(filter) || f.alt.toLowerCase().includes(filter))
    : all;

  // Sort newest first
  filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return NextResponse.json({
    total: all.length,
    returned: filtered.length,
    filter,
    files: filtered.slice(0, limit),
  });
}
