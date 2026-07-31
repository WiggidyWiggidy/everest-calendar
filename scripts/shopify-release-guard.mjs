#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const API_VERSION = '2024-10';

function parseArgs(argv = process.argv) {
  const command = argv[2];
  const args = { command, handle: 'kryo2_', assets: [], reason: '', release: '', out: '', qc: true, passthrough: [] };
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') { args.passthrough = argv.slice(i + 1); break; }
    if (arg === '--handle') args.handle = argv[++i];
    else if (arg === '--assets') args.assets = argv[++i].split(',').map((x) => x.trim()).filter(Boolean);
    else if (arg === '--reason') args.reason = argv[++i];
    else if (arg === '--release') args.release = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--no-qc') args.qc = false;
    else if (arg === '--help' || !command) usage(0);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['backup', 'restore', 'run'].includes(command)) usage(1);
  return args;
}

function usage(code) {
  console.log(`Usage:
  node scripts/shopify-release-guard.mjs backup --handle kryo2_ --assets templates/product.kryo2_.json,blocks/example.liquid --reason "one logical change"
  node scripts/shopify-release-guard.mjs restore --release artifacts/shopify-releases/.../release.json
  node scripts/shopify-release-guard.mjs run --handle kryo2_ --assets templates/product.kryo2_.json -- <write command>

Rules enforced by convention:
  - One release = one logical change and explicit asset list.
  - run creates one immutable backup, executes the write command, runs qc:shopify-page, and restores the backup if QC fails.
  - Manual Shopify edits should be verified with qc:shopify-page but never auto-restored.`);
  process.exit(code);
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim().replace(/^export\s+/, '');
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

async function loadEnv() {
  await loadEnvFile(path.join(os.homedir(), '.zshenv'));
  await loadEnvFile(path.join(repoRoot, '.env.local'));
}

function briefJson(value, max = 600) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}


function hasDirectShopifyCreds() {
  return Boolean(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

function marketingBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
}

async function marketingFetch(routePath, opts = {}) {
  await loadEnv();
  if (!process.env.MARKETING_SYNC_SECRET) throw new Error('MARKETING_SYNC_SECRET missing for marketing API fallback');
  const res = await fetch(`${marketingBaseUrl()}${routePath}`, {
    method: opts.method || 'GET',
    headers: { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET, 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Marketing API ${routePath} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

async function marketingGet(routePath) { return marketingFetch(routePath); }
async function marketingPost(routePath, body) { return marketingFetch(routePath, { method: 'POST', body, timeout: 90000 }); }

async function token() {
  await loadEnv();
  const store = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!store || !clientId || !clientSecret) throw new Error('Missing Shopify credentials');
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok || !json.access_token) throw new Error(`Shopify token failed ${res.status}: ${briefJson(json)}`);
  return { store, accessToken: json.access_token };
}

async function rest(pathname, opts = {}) {
  const { store, accessToken } = await token();
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 45000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Shopify REST ${pathname} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

async function getLiveTheme() {
  await loadEnv();
  if (hasDirectShopifyCreds()) {
    const themes = await rest('/themes.json?fields=id,name,role');
    const theme = themes.themes?.find((t) => t.role === 'main');
    if (!theme) throw new Error('Live theme not found');
    return { ...theme, sourceMethod: 'direct_shopify_admin' };
  }
  const info = await marketingGet('/api/marketing/theme/info');
  if (!info.live_theme?.id) throw new Error('Live theme not found through marketing API');
  return { ...info.live_theme, sourceMethod: 'marketing_api' };
}

async function getTemplateKey(handle) {
  await loadEnv();
  if (hasDirectShopifyCreds()) {
    const products = await rest(`/products.json?handle=${encodeURIComponent(handle)}&fields=id,handle,title,template_suffix`);
    const product = products.products?.[0];
    if (!product) throw new Error(`Product not found: ${handle}`);
    return { product, templateKey: product.template_suffix ? `templates/product.${product.template_suffix}.json` : 'templates/product.json' };
  }
  const product = await marketingGet(`/api/marketing/shopify/get-product?handle=${encodeURIComponent(handle)}`);
  return { product, templateKey: product.template_filename || (product.template_suffix ? `templates/product.${product.template_suffix}.json` : 'templates/product.json') };
}

async function getAsset(themeId, key) {
  await loadEnv();
  if (hasDirectShopifyCreds()) {
    const json = await rest(`/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
    if (!json.asset?.value && json.asset?.value !== '') throw new Error(`Asset missing: ${key}`);
    return json.asset.value;
  }
  const json = await marketingGet(`/api/marketing/theme/asset?key=${encodeURIComponent(key)}`);
  if (!json.value && json.value !== '') throw new Error(`Asset missing through marketing API: ${key}`);
  return json.value;
}

async function putAsset(themeId, key, value) {
  await loadEnv();
  if (hasDirectShopifyCreds()) {
    return rest(`/themes/${themeId}/assets.json`, {
      method: 'PUT',
      body: JSON.stringify({ asset: { key, value } }),
      timeout: 60000,
    });
  }
  return marketingPost('/api/marketing/theme/deploy-asset', { theme_id: Number(themeId), key, value });
}

async function backup(args) {
  const liveTheme = await getLiveTheme();
  const { product, templateKey } = await getTemplateKey(args.handle);
  const assets = [...new Set([templateKey, ...args.assets])];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.out || `artifacts/shopify-releases/${stamp}-${args.handle}`);
  await fs.mkdir(outDir, { recursive: true });
  const backedUp = [];
  for (const key of assets) {
    const value = await getAsset(liveTheme.id, key);
    const file = key.replace(/[^a-z0-9_.-]+/gi, '_');
    await fs.writeFile(path.join(outDir, file), value);
    backedUp.push({ key, file, bytes: value.length });
  }
  const release = {
    createdAt: new Date().toISOString(),
    handle: args.handle,
    reason: args.reason || null,
    agentInitiated: true,
    oneLogicalChangeOnly: true,
    liveTheme,
    sourceMethod: liveTheme.sourceMethod || 'unknown',
    product: { id: product.id, handle: product.handle, title: product.title, template_suffix: product.template_suffix || null },
    assets: backedUp,
    rules: [
      'After write, require source readback and qc:shopify-page PASS on desktop and mobile.',
      'If agent-initiated QC fails, restore exactly these backed-up assets and stop.',
      'Do not add a second fix in the same release.',
    ],
  };
  await fs.writeFile(path.join(outDir, 'release.json'), JSON.stringify(release, null, 2));
  console.log(`SHOPIFY_RELEASE_BACKUP created ${path.join(outDir, 'release.json')}`);
  for (const asset of backedUp) console.log(`- ${asset.key} (${asset.bytes} bytes)`);
  return path.join(outDir, 'release.json');
}

async function restore(args) {
  if (!args.release) throw new Error('--release is required');
  const releasePath = path.resolve(repoRoot, args.release);
  const release = JSON.parse(await fs.readFile(releasePath, 'utf8'));
  const base = path.dirname(releasePath);
  for (const asset of release.assets || []) {
    const value = await fs.readFile(path.join(base, asset.file), 'utf8');
    await putAsset(release.liveTheme.id, asset.key, value);
    console.log(`RESTORED ${asset.key}`);
  }
  console.log(`SHOPIFY_RELEASE_RESTORED ${releasePath}`);
}

function runCommand(command, cwd = repoRoot) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: 'inherit', shell: false });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function guardedRun(args) {
  if (!args.passthrough.length) throw new Error('run requires a command after --');
  const releasePath = await backup(args);
  const writeCode = await runCommand(args.passthrough);
  if (writeCode !== 0) {
    console.error(`WRITE_COMMAND_FAILED exit=${writeCode}; restoring backup`);
    await restore({ release: releasePath });
    process.exit(writeCode);
  }
  if (args.qc) {
    const qcCode = await runCommand(['npm', 'run', 'qc:shopify-page', '--', '--handle', args.handle]);
    if (qcCode !== 0) {
      console.error(`PUBLIC_QC_FAILED exit=${qcCode}; restoring backup and stopping`);
      await restore({ release: releasePath });
      process.exit(qcCode);
    }
  }
  console.log(`SHOPIFY_RELEASE_GUARDED_PASS ${releasePath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const action = args.command === 'backup' ? backup(args) : args.command === 'restore' ? restore(args) : guardedRun(args);
  action.catch((err) => { console.error(`SHOPIFY_RELEASE_GUARD_ERROR: ${err.message}`); process.exit(2); });
}
