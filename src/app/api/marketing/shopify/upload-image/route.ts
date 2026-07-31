// Upload an image OR video to Shopify Files via stagedUploadsCreate + fileCreate.
// Auth: x-sync-secret = MARKETING_SYNC_SECRET.
//
// POST /api/marketing/shopify/upload-image
// Body: { filename: "kryo_v4_hero_white.png", data_b64: "<base64>", mime_type?: "image/png", alt?: "..." }
//
// Resource detection: derived from filename extension.
//   .png/.jpg/.jpeg/.webp/.gif → resource: IMAGE, contentType: IMAGE
//   .mp4/.mov/.webm            → resource: VIDEO, contentType: VIDEO
//
// Returns: { success, gid, filename, cdn_url, file_status, content_type: 'IMAGE'|'VIDEO' }

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
  // Video sources — populated for MediaImage(video) once processed
  sources?: Array<{ url: string; mimeType: string; width?: number; height?: number; format?: string }>;
  preview?: { image?: { url: string } };
  originalSource?: { url: string };
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
        ... on Video {
          sources { url mimeType width height format }
          preview { image { url } }
          originalSource { url }
        }
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
      ... on Video {
        id
        fileStatus
        alt
        sources { url mimeType width height format }
        preview { image { url } }
        originalSource { url }
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

  const lowerName = filename.toLowerCase();
  const isVideo = /\.(mp4|mov|webm|m4v)$/i.test(lowerName);
  const mimeType = body.mime_type ?? (
    lowerName.endsWith('.png') ? 'image/png' :
    lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') ? 'image/jpeg' :
    lowerName.endsWith('.webp') ? 'image/webp' :
    lowerName.endsWith('.gif') ? 'image/gif' :
    lowerName.endsWith('.mp4') ? 'video/mp4' :
    lowerName.endsWith('.mov') ? 'video/quicktime' :
    lowerName.endsWith('.webm') ? 'video/webm' :
    lowerName.endsWith('.m4v') ? 'video/x-m4v' :
    'application/octet-stream'
  );
  const resource: 'IMAGE' | 'VIDEO' = isVideo ? 'VIDEO' : 'IMAGE';
  const contentType: 'IMAGE' | 'VIDEO' = resource;

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
        resource,
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
        contentType,
        alt: alt ?? filename.replace(/\.[a-z0-9]+$/i, ''),
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

  // Step 4: poll node(id) until processed.
  // Images: image.url populated. Videos: sources[] populated (longer process — up to 30s+).
  // Use higher poll budget for video.
  const maxPolls = isVideo ? 30 : 12;
  let resolved: ShopifyFile = file;
  for (let i = 0; i < maxPolls; i++) {
    const ready =
      (!isVideo && resolved.image?.url) ||
      (isVideo && (resolved.sources?.length ?? 0) > 0);
    if (ready) break;
    if (resolved.fileStatus === 'FAILED') break;
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const node = (await gql(storeUrl, token, FILE_NODE_QUERY, { id: file.id })) as { node: ShopifyFile };
      resolved = node.node ?? resolved;
    } catch {
      // soft-fail polling — return what we have
      break;
    }
  }

  // Pick best CDN URL based on type
  let cdnUrl: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (isVideo) {
    // Prefer mp4 source if multiple, fall back to first
    const mp4 = resolved.sources?.find((s) => s.mimeType === 'video/mp4') ?? resolved.sources?.[0];
    cdnUrl = mp4?.url ?? resolved.preview?.image?.url ?? resolved.originalSource?.url ?? null;
    width = mp4?.width ?? null;
    height = mp4?.height ?? null;
  } else {
    cdnUrl = resolved.image?.url ?? null;
    width = resolved.image?.width ?? null;
    height = resolved.image?.height ?? null;
  }

  return NextResponse.json({
    success: !!cdnUrl,
    gid: resolved.id,
    file_status: resolved.fileStatus,
    content_type: contentType,
    cdn_url: cdnUrl,
    preview_image_url: isVideo ? resolved.preview?.image?.url ?? null : null,
    width,
    height,
    filename,
    mime_type: mimeType,
    bytes_uploaded: bytes.length,
  });
}
