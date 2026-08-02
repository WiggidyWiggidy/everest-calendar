#!/usr/bin/env node
/**
 * Upload images to Shopify Files (Content > Files) and print the
 * `shopify://shop_images/<name>` reference that an image_picker setting expects.
 *
 * Usage:
 *   node scripts/shopify-upload-files.mjs manifest.json --vercel-env production [--dry-run]
 *
 * manifest.json: [{ "file": "/abs/path.png", "name": "kryo-setup-07-clean-wall.png", "alt": "..." }]
 *
 * Idempotent: a name already present in Files is skipped and its existing reference returned,
 * so re-running never creates `name-1.png` duplicates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const API_VERSION = '2024-10';

const manifestPath = process.argv[2];
const vercelEnv = process.argv.includes('--vercel-env')
  ? process.argv[process.argv.indexOf('--vercel-env') + 1] : '';
const dryRun = process.argv.includes('--dry-run');
if (!manifestPath) { console.log('usage: shopify-upload-files.mjs <manifest.json> [--vercel-env production] [--dry-run]'); process.exit(1); }

async function loadEnvFile(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim().replace(/^export\s+/, '');
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
const hasCreds = () => Boolean(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);

await loadEnvFile(path.join(os.homedir(), '.zshenv'));
await loadEnvFile(path.join(repoRoot, '.env.local'));
if (!hasCreds() && vercelEnv) {
  const tmp = path.join(os.tmpdir(), `everest-vercel-${vercelEnv}-${Date.now()}.env`);
  const r = spawnSync('vercel', ['env', 'pull', tmp, '--environment', vercelEnv, '--yes'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`vercel env pull failed: ${r.stderr || r.stdout}`);
  await loadEnvFile(tmp);
}
if (!hasCreds()) throw new Error('Missing Shopify creds. Pass --vercel-env production.');

async function token() {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token;
}
const ACCESS = await token();

async function gql(query, variables) {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(`GraphQL: ${JSON.stringify(j.errors).slice(0, 500)}`);
  return j.data;
}

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

// Existing filenames, so a re-run does not create duplicates.
const existing = new Map();
let cursor = null;
for (let page = 0; page < 20; page++) {
  const d = await gql(`query($c:String){ files(first:250, after:$c){ pageInfo{hasNextPage endCursor}
    nodes{ ... on MediaImage { id fileStatus image { url } } } } }`, { c: cursor });
  for (const n of d.files.nodes) {
    if (!n || !n.image || !n.image.url) continue;
    existing.set(decodeURIComponent(n.image.url.split('/').pop().split('?')[0]), n.id);
  }
  if (!d.files.pageInfo.hasNextPage) break;
  cursor = d.files.pageInfo.endCursor;
}
console.log(`# ${existing.size} files already in Shopify Files`);

const results = [];
for (const item of manifest) {
  const name = item.name;
  if (existing.has(name)) {
    console.log(`SKIP (exists)  ${name}`);
    results.push({ name, ref: `shopify://shop_images/${name.replace(/\.[^.]+$/, '')}`, existed: true });
    continue;
  }
  if (dryRun) { console.log(`WOULD UPLOAD  ${name}  <- ${item.file}`); results.push({ name, ref: null, dryRun: true }); continue; }

  const buf = await fs.readFile(item.file);
  const ext = (name.split('.').pop() || 'png').toLowerCase();
  const mime = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  const staged = await gql(`mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){
      stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }`,
    { input: [{ filename: name, mimeType: mime, httpMethod: 'POST', resource: 'FILE', fileSize: String(buf.length) }] });
  const errs = staged.stagedUploadsCreate.userErrors;
  if (errs.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errs)}`);
  const target = staged.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buf], { type: mime }), name);
  const up = await fetch(target.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`staged upload HTTP ${up.status}: ${(await up.text()).slice(0, 300)}`);

  const created = await gql(`mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){
      files{ ... on MediaImage { id fileStatus } } userErrors{ field message } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', alt: item.alt || '', filename: name }] });
  const cErrs = created.fileCreate.userErrors;
  if (cErrs.length) throw new Error(`fileCreate ${name}: ${JSON.stringify(cErrs)}`);

  console.log(`UPLOADED      ${name}`);
  results.push({ name, ref: `shopify://shop_images/${name.replace(/\.[^.]+$/, '')}`, id: created.fileCreate.files[0].id });
}

// Shopify processes asynchronously; a READY status is what makes the reference resolve.
const pending = results.filter((r) => r.id);
if (pending.length) {
  process.stdout.write('# waiting for Shopify to process');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = await gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on MediaImage { id fileStatus } } }`,
      { ids: pending.map((p) => p.id) });
    const notReady = d.nodes.filter((n) => n && n.fileStatus !== 'READY');
    if (!notReady.length) { console.log(' — all READY'); break; }
    process.stdout.write('.');
  }
}

console.log('\n' + JSON.stringify(results, null, 1));
