#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const API_VERSION = '2024-10';

function parseArgs(argv = process.argv) {
  const args = { command: argv[2], key: '', file: '', out: '', theme: '', envFile: '', vercelEnv: '', allowLive: false };
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--key') args.key = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--theme') args.theme = argv[++i];
    else if (a === '--env-file') args.envFile = argv[++i];
    else if (a === '--vercel-env') args.vercelEnv = argv[++i];
    else if (a === '--allow-live') args.allowLive = true;
    else if (a === '--help') usage(0);
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!['get', 'put', 'theme'].includes(args.command)) usage(1);
  if (args.command !== 'theme' && !args.key) throw new Error('--key required');
  if (args.command === 'put' && !args.file) throw new Error('--file required for put');
  return args;
}

function usage(code) {
  console.log(`Usage:
  npm run shopify:asset -- get --key blocks/ai_gen_block_x.liquid --out /tmp/x.liquid --vercel-env production
  npm run shopify:asset -- put --key blocks/ai_gen_block_x.liquid --file /tmp/x.liquid --theme 167... --allow-live --vercel-env production

Direct Shopify Admin asset read/write. Pulls Vercel env to temp when local Shopify creds are blank. No CLI login.`);
  process.exit(code);
}

async function loadEnvFile(file) {
  if (!file) return;
  try {
    const raw = await fs.readFile(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim().replace(/^export\s+/, '');
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

function hasShopifyCreds() {
  return Boolean(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

async function ensureEnv(args) {
  await loadEnvFile(path.join(os.homedir(), '.zshenv'));
  await loadEnvFile(path.join(repoRoot, '.env.local'));
  if (args.envFile) await loadEnvFile(path.resolve(args.envFile));
  if (!hasShopifyCreds() && args.vercelEnv) {
    const tmp = path.join(os.tmpdir(), `everest-vercel-${args.vercelEnv}-${Date.now()}.env`);
    const pulled = spawnSync('vercel', ['env', 'pull', tmp, '--environment', args.vercelEnv, '--yes'], { cwd: repoRoot, encoding: 'utf8' });
    if (pulled.status !== 0) throw new Error(`vercel env pull failed: ${pulled.stderr || pulled.stdout}`);
    await loadEnvFile(tmp);
  }
  if (!hasShopifyCreds()) throw new Error('Missing Shopify creds. Use --vercel-env production or --env-file.');
}

function brief(value, max = 700) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

async function token() {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok || !json.access_token) throw new Error(`token failed HTTP ${res.status}: ${brief(json)}`);
  return json.access_token;
}

async function rest(pathname, opts = {}) {
  const access = await token();
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/${API_VERSION}${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}: ${brief(json)}`);
  return json;
}

async function liveTheme() {
  const json = await rest('/themes.json?fields=id,name,role');
  const theme = json.themes?.find((t) => t.role === 'main');
  if (!theme) throw new Error('No live theme');
  return theme;
}

async function main() {
  const args = parseArgs();
  await ensureEnv(args);
  const theme = args.theme ? { id: args.theme, name: 'provided' } : await liveTheme();
  if (args.command === 'theme') {
    console.log(JSON.stringify(theme, null, 2));
    return;
  }
  if (String(theme.id) === '167131775284' && args.command === 'put' && !args.allowLive) throw new Error('Refusing live theme PUT without --allow-live');
  if (args.command === 'get') {
    const json = await rest(`/themes/${theme.id}/assets.json?asset[key]=${encodeURIComponent(args.key)}`);
    const value = json.asset?.value ?? '';
    if (args.out) {
      await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
      await fs.writeFile(path.resolve(args.out), value);
    }
    console.log(`SHOPIFY_ASSET_GET key=${args.key} theme=${theme.id} bytes=${value.length}${args.out ? ` out=${path.resolve(args.out)}` : ''}`);
  } else if (args.command === 'put') {
    const value = await fs.readFile(path.resolve(args.file), 'utf8');
    const json = await rest(`/themes/${theme.id}/assets.json`, {
      method: 'PUT',
      body: JSON.stringify({ asset: { key: args.key, value } }),
      timeout: 90000,
    });
    console.log(`SHOPIFY_ASSET_PUT key=${args.key} theme=${theme.id} bytes=${value.length} updated=${json.asset?.updated_at || 'ok'}`);
  }
}

main().catch((e) => { console.error(`SHOPIFY_ASSET_ERROR: ${e.message}`); process.exit(2); });
