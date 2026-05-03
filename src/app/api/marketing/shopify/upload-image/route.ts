// Upload an image to Shopify Files via stagedUploadsCreate + fileCreate.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
//
// POST /api/marketing/shopify/upload-image
// Body: { filename: "kryo_v4_hero_white.png", data_b64: "<base64>", mime_type: "image/png", alt?: "..." }
//
// Returns: { success, gid, filename, cdn_url, file_status }

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

interface UploadRequest {
  filename: string;
  data_b64?: string;
  source_url?: string;
  mime_type?: string;
  alt?: string;
}

interface StagedTarget {
  url: string;                          // presigned PUT URL
  resourceUrl: string;                  // pass to fileCreate.originalSource
  parameters: Array<{ name: string; value: string }>;
}

interface ShopifyFile {
  id: string;
  fileStatus: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  alt?: string;
  image?: { url: string; width: number; height: number };
}

const STAGED_UPLOADS_MUTATION = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE_MUTATION = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        ... on MediaImage { image { url width height } }
      }
      userErrors { field message }
    }
  }
`;

const FILE_NODE_QUERY = `
  query fileNode($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        fileStatus
        alt
        image { url width height }
      }
    }
  }
`;

async function gql(storeUrl: string, token: string, query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://${storeUrl}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GQL ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  if (data.errors) throw new Error(`Shopify GQL errors: ${JSON.stringify(data.errors).slice(0, 400)}`);
  return data.data;
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UploadRequest;
  try {
    body = (await req.json()) as UploadRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { filename, data_b64, source_url, alt } = body;
  if (!filename || (!data_b64 && !source_url)) {
    return NextResponse.json({ error: 'filename + (data_b64 OR source_url) required' }, { status: 400 });
  }

  const mimeType = body.mime_type ?? (
    filename.endsWith('.png') ? 'image/png' :
    filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' :
    filename.endsWith('.webp') ? 'image/webp' :
    filename.endsWith('.gif') ? 'image/gif' :
    'application/octet-stream'
  );

  let token: string, storeUrl: string;
  try {
    token = await getShopifyToken();
    storeUrl = getShopifyStoreUrl();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Resolve bytes
  let bytes: Buffer;
  if (data_b64) {
    bytes = Buffer.from(data_b64, 'base64');
  } else {
    const r = await fetch(source_url!);
    if (!r.ok) return NextResponse.json({ error: `source_url fetch failed: ${r.status}` }, { status: 502 });
    bytes = Buffer.from(await r.arrayBuffer());
  }

  // Step 1: stagedUploadsCreate — get a presigned upload target
  let stagedData;
  try {
    stagedData = (await gql(storeUrl, token, STAGED_UPLOADS_MUTATION, {
      input: [{
        filename,
        mimeType,
        resource: 'IMAGE',
        fileSize: String(bytes.length),
        httpMethod: 'POST',
      }],
    })) as { stagedUploadsCreate: { stagedTargets: StagedTarget[]; userErrors: Array<{ field: string[]; message: string }> } };
  } catch (e) {
    return NextResponse.json({ error: `stagedUploadsCreate: ${(e as Error).message}` }, { status: 502 });
  }

  const stagedErrors = stagedData.stagedUploadsCreate.userErrors;
  if (stagedErrors?.length) {
    return NextResponse.json({ error: 'stagedUploadsCreate userErrors', detail: stagedErrors }, { status: 422 });
  }
  const target = stagedData.stagedUploadsCreate.stagedTargets[0];
  if (!target) {
    return NextResponse.json({ error: 'stagedUploadsCreate returned no target' }, { status: 502 });
  }

  // Step 2: POST bytes to the staged target (multipart with required parameters)
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([bytes as unknown as ArrayBuffer], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    return NextResponse.json(
      { error: `Staged upload PUT failed: ${uploadRes.status}`, detail: (await uploadRes.text()).slice(0, 400) },
      { status: 502 },
    );
  }

  // Step 3: fileCreate to register the uploaded file
  let createData;
  try {
    createData = (await gql(storeUrl, token, FILE_CREATE_MUTATION, {
      files: [{
        originalSource: target.resourceUrl,
        contentType: 'IMAGE',
        alt: alt ?? filename.replace(/\.[a-z]+$/, ''),
      }],
    })) as { fileCreate: { files: ShopifyFile[]; userErrors: Array<{ field: string[]; message: string }> } };
  } catch (e) {
    return NextResponse.json({ error: `fileCreate: ${(e as Error).message}` }, { status: 502 });
  }

  const createErrors = createData.fileCreate.userErrors;
  if (createErrors?.length) {
    return NextResponse.json({ error: 'fileCreate userErrors', detail: createErrors }, { status: 422 });
  }
  const file = createData.fileCreate.files[0];
  if (!file) return NextResponse.json({ error: 'fileCreate returned no file' }, { status: 502 });

  // Step 4: poll node(id) until image.url is populated (Shopify async-processes images)
  let resolved: ShopifyFile = file;
  for (let i = 0; i < 12; i++) {
    if (resolved.image?.url) break;
    if (resolved.fileStatus === 'FAILED') break;
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const node = (await gql(storeUrl, token, FILE_NODE_QUERY, { id: file.id })) as { node: ShopifyFile };
      resolved = node.node ?? resolved;
    } catch {
      // soft-fail polling — return what we have
      break;
    }
  }

  return NextResponse.json({
    success: !!resolved.image?.url,
    gid: resolved.id,
    file_status: resolved.fileStatus,
    cdn_url: resolved.image?.url ?? null,
    width: resolved.image?.width ?? null,
    height: resolved.image?.height ?? null,
    filename,
    mime_type: mimeType,
    bytes_uploaded: bytes.length,
  });
}
