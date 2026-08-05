// Guarded KRYO product-media association/reorder surface for approved baseline releases.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
// Scope is deliberately narrow: one KRYO product, exact before-state preconditions,
// and only add/reorder or remove/restore operations. No file deletion is exposed.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

const SHOPIFY_API_VERSION = '2026-07';
const KRYO_PRODUCT_ID = 'gid://shopify/Product/9334472311092';

type Action = 'add_reorder' | 'remove_restore';

interface MediaMutationRequest {
  action: Action;
  product_id: string;
  expected_before_ids: string[];
  file_ids: string[];
  desired_order: string[];
}

interface MediaNode {
  id: string;
  alt?: string | null;
  status?: string | null;
  fileStatus?: string | null;
  image?: { url?: string | null } | null;
}

async function gql(
  storeUrl: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`Shopify GQL ${res.status}: ${text.slice(0, 500)}`); }
  if (!res.ok || payload.errors?.length) {
    throw new Error(`Shopify GQL ${res.status}: ${JSON.stringify(payload.errors ?? payload).slice(0, 800)}`);
  }
  return payload.data;
}

const PRODUCT_MEDIA_QUERY = `
  query ProductMedia($id: ID!) {
    product(id: $id) {
      id
      media(first: 50) {
        nodes {
          id
          alt
          status
          ... on MediaImage {
            fileStatus
            image { url }
          }
        }
      }
    }
  }
`;

const SOURCE_MEDIA_QUERY = `
  query SourceMedia($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on MediaImage {
        id
        fileStatus
        image { url }
      }
    }
  }
`;

const FILE_UPDATE_MUTATION = `
  mutation UpdateFiles($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id fileStatus }
      userErrors { field message }
    }
  }
`;

const REORDER_MEDIA_MUTATION = `
  mutation ReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id done }
      mediaUserErrors { field message }
    }
  }
`;

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

async function readMedia(storeUrl: string, token: string): Promise<MediaNode[]> {
  const data = await gql(storeUrl, token, PRODUCT_MEDIA_QUERY, { id: KRYO_PRODUCT_ID });
  if (!data.product) throw new Error('KRYO product not found');
  return data.product.media?.nodes ?? [];
}

async function waitForOrder(
  storeUrl: string,
  token: string,
  expected: string[],
  timeoutMs = 30000,
): Promise<MediaNode[]> {
  const started = Date.now();
  let last: MediaNode[] = [];
  while (Date.now() - started < timeoutMs) {
    last = await readMedia(storeUrl, token);
    if (sameArray(last.map((x) => x.id), expected)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Media order verification timed out. Expected ${JSON.stringify(expected)}, observed ${JSON.stringify(last.map((x) => x.id))}`);
}

async function waitForSet(
  storeUrl: string,
  token: string,
  expected: string[],
  timeoutMs = 30000,
): Promise<MediaNode[]> {
  const started = Date.now();
  let last: MediaNode[] = [];
  while (Date.now() - started < timeoutMs) {
    last = await readMedia(storeUrl, token);
    if (sameSet(last.map((x) => x.id), expected)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Media-set verification timed out. Expected ${JSON.stringify(expected)}, observed ${JSON.stringify(last.map((x) => x.id))}`);
}

function calculateMoves(current: string[], desired: string[]) {
  const working = [...current];
  const moves: Array<{ id: string; newPosition: string }> = [];
  for (let i = 0; i < desired.length; i += 1) {
    const id = desired[i];
    if (working[i] === id) continue;
    const from = working.indexOf(id);
    if (from < 0) throw new Error(`Desired media ${id} is not attached`);
    moves.push({ id, newPosition: String(i) });
    const [item] = working.splice(from, 1);
    working.splice(i, 0, item);
  }
  return moves;
}

async function updateReferences(
  storeUrl: string,
  token: string,
  fileIds: string[],
  mode: 'add' | 'remove',
) {
  if (!fileIds.length) return;
  const files = fileIds.map((id) => ({
    id,
    ...(mode === 'add'
      ? { referencesToAdd: [KRYO_PRODUCT_ID] }
      : { referencesToRemove: [KRYO_PRODUCT_ID] }),
  }));
  const data = await gql(storeUrl, token, FILE_UPDATE_MUTATION, { files });
  if (data.fileUpdate.userErrors?.length) {
    throw new Error(`fileUpdate ${mode} errors: ${JSON.stringify(data.fileUpdate.userErrors)}`);
  }
}

async function reorder(
  storeUrl: string,
  token: string,
  current: string[],
  desired: string[],
) {
  const moves = calculateMoves(current, desired);
  if (!moves.length) return;
  const data = await gql(storeUrl, token, REORDER_MEDIA_MUTATION, {
    id: KRYO_PRODUCT_ID,
    moves,
  });
  if (data.productReorderMedia.mediaUserErrors?.length) {
    throw new Error(`productReorderMedia errors: ${JSON.stringify(data.productReorderMedia.mediaUserErrors)}`);
  }
}

function validateBody(body: MediaMutationRequest): string | null {
  if (!body || !['add_reorder', 'remove_restore'].includes(body.action)) return 'action must be add_reorder or remove_restore';
  if (body.product_id !== KRYO_PRODUCT_ID) return `product_id must be ${KRYO_PRODUCT_ID}`;
  for (const key of ['expected_before_ids', 'file_ids', 'desired_order'] as const) {
    if (!Array.isArray(body[key]) || body[key].some((x) => typeof x !== 'string')) return `${key} must be an array of IDs`;
    if (!unique(body[key])) return `${key} contains duplicate IDs`;
  }
  if (!body.file_ids.length) return 'file_ids must not be empty';
  if (body.action === 'add_reorder') {
    if (body.file_ids.some((id) => body.expected_before_ids.includes(id))) return 'add file_ids must not already be in expected_before_ids';
    if (!sameSet(body.desired_order, [...body.expected_before_ids, ...body.file_ids])) return 'desired_order must exactly equal expected_before_ids + file_ids as a set';
  } else {
    if (body.file_ids.some((id) => !body.expected_before_ids.includes(id))) return 'remove file_ids must all exist in expected_before_ids';
    if (!sameSet(body.desired_order, body.expected_before_ids.filter((id) => !body.file_ids.includes(id)))) return 'desired_order must exactly equal expected_before_ids minus file_ids';
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const productId = req.nextUrl.searchParams.get('product_id');
  if (productId !== KRYO_PRODUCT_ID) {
    return NextResponse.json({ error: `product_id must be ${KRYO_PRODUCT_ID}` }, { status: 422 });
  }
  try {
    const token = await getShopifyToken();
    const storeUrl = getShopifyStoreUrl();
    const media = await readMedia(storeUrl, token);
    return NextResponse.json({
      product_id: KRYO_PRODUCT_ID,
      media: media.map((m) => ({
        id: m.id,
        alt: m.alt ?? null,
        status: m.status ?? null,
        file_status: m.fileStatus ?? null,
        url: m.image?.url ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: MediaMutationRequest;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const invalid = validateBody(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  try {
    const token = await getShopifyToken();
    const storeUrl = getShopifyStoreUrl();
    const before = await readMedia(storeUrl, token);
    const beforeIds = before.map((x) => x.id);
    if (!sameArray(beforeIds, body.expected_before_ids)) {
      return NextResponse.json({
        error: 'PRECONDITION_DRIFT',
        expected_before_ids: body.expected_before_ids,
        observed_before_ids: beforeIds,
      }, { status: 409 });
    }

    if (body.action === 'add_reorder') {
      const source = await gql(storeUrl, token, SOURCE_MEDIA_QUERY, { ids: body.file_ids });
      const sourceNodes: MediaNode[] = source.nodes ?? [];
      const missingOrUnready = body.file_ids.filter((id) => {
        const node = sourceNodes.find((n) => n?.id === id);
        return !node || node.fileStatus !== 'READY' || !node.image?.url;
      });
      if (missingOrUnready.length) {
        return NextResponse.json({ error: 'Source media missing or not READY', media_ids: missingOrUnready }, { status: 422 });
      }

      let added = false;
      try {
        await updateReferences(storeUrl, token, body.file_ids, 'add');
        added = true;
        const attached = await waitForSet(storeUrl, token, body.desired_order);
        await reorder(storeUrl, token, attached.map((x) => x.id), body.desired_order);
        const after = await waitForOrder(storeUrl, token, body.desired_order);
        return NextResponse.json({
          success: true,
          action: body.action,
          before_ids: beforeIds,
          after: after.map((m) => ({ id: m.id, url: m.image?.url ?? null })),
        });
      } catch (error) {
        if (added) {
          try {
            await updateReferences(storeUrl, token, body.file_ids, 'remove');
            await waitForOrder(storeUrl, token, body.expected_before_ids);
          } catch (rollbackError) {
            return NextResponse.json({
              error: 'MEDIA_ROLLBACK_FAILED',
              cause: String((error as Error).message ?? error),
              rollback_error: String((rollbackError as Error).message ?? rollbackError),
            }, { status: 500 });
          }
        }
        throw error;
      }
    }

    // remove_restore
    let removed = false;
    try {
      await updateReferences(storeUrl, token, body.file_ids, 'remove');
      removed = true;
      const after = await waitForOrder(storeUrl, token, body.desired_order);
      return NextResponse.json({
        success: true,
        action: body.action,
        before_ids: beforeIds,
        after: after.map((m) => ({ id: m.id, url: m.image?.url ?? null })),
      });
    } catch (error) {
      if (removed) {
        try {
          await updateReferences(storeUrl, token, body.file_ids, 'add');
          const attached = await waitForSet(storeUrl, token, body.expected_before_ids);
          await reorder(storeUrl, token, attached.map((x) => x.id), body.expected_before_ids);
          await waitForOrder(storeUrl, token, body.expected_before_ids);
        } catch (rollbackError) {
          return NextResponse.json({
            error: 'MEDIA_ROLLBACK_FAILED',
            cause: String((error as Error).message ?? error),
            rollback_error: String((rollbackError as Error).message ?? rollbackError),
          }, { status: 500 });
        }
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message ?? error) }, { status: 500 });
  }
}
