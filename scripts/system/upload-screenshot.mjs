// upload-screenshot.mjs
// Uploads a local PNG to Supabase Storage 'kryo-swarm-shots' bucket. Returns public URL.
// Used by swarm-loop to make screenshots accessible from Tom's inbox card on his phone.
//
// Usage:   node scripts/system/upload-screenshot.mjs <local-png-path> [storage-path]
// Outputs: { url, path } JSON to stdout.
//
// First-run note: bucket is auto-created if missing. Public-read so URLs work without auth.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL;
const SUPABASE_KEY = process.env.EVEREST_SUPABASE_SERVICE_KEY;
const BUCKET = 'kryo-swarm-shots';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: EVEREST_SUPABASE_URL + EVEREST_SUPABASE_SERVICE_KEY required');
  process.exit(2);
}

async function ensureBucket() {
  // Create bucket if missing (idempotent — 409 means it exists, we ignore).
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text();
  // Some Supabase deployments return 400 with "already exists" — also fine.
  if (text.includes('already exists') || text.includes('Duplicate')) return;
  throw new Error(`bucket create HTTP ${res.status}: ${text.slice(0, 300)}`);
}

export async function uploadScreenshot(localPath, storagePath) {
  await ensureBucket();
  const buf = await readFile(localPath);
  const safeName = (storagePath || basename(localPath)).replace(/[^a-zA-Z0-9._/-]/g, '-');
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${safeName}`;
  // Upsert (idempotent — overwrite if same path)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'x-upsert': 'true',
    },
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upload HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${safeName}`;
  return { url: publicUrl, path: safeName, bytes: buf.length };
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const local = process.argv[2];
  const storage = process.argv[3];
  if (!local) { console.error('Usage: upload-screenshot.mjs <local-png> [storage-path]'); process.exit(2); }
  const out = await uploadScreenshot(local, storage);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
