// Exchange short-lived Meta user token for a long-lived (~60 day) one.
// Reads META_APP_ID, META_APP_SECRET, META_SHORT_LIVED_TOKEN from .env.local.
// On success: writes META_ACCESS_TOKEN, removes META_SHORT_LIVED_TOKEN.
// Never logs token values — only lengths.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = resolve(__dirname, '..', '.env.local');
const GRAPH_VERSION = 'v19.0';
const MIN_EXPIRES_IN = 5_000_000;

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map.set(m[1], v);
  }
  return map;
}

function mask(v) {
  if (!v) return '<empty>';
  return `<${v.length} chars>`;
}

const text = await readFile(ENV_PATH, 'utf8');
const env = parseEnv(text);

const APP_ID = env.get('META_APP_ID');
const APP_SECRET = env.get('META_APP_SECRET');
const SHORT = env.get('META_SHORT_LIVED_TOKEN');

if (!APP_ID) { console.error('FAIL: META_APP_ID missing in .env.local'); process.exit(1); }
if (!APP_SECRET) { console.error('FAIL: META_APP_SECRET missing in .env.local'); process.exit(1); }
if (!SHORT) { console.error('FAIL: META_SHORT_LIVED_TOKEN missing in .env.local'); process.exit(1); }

console.log(`Inputs: APP_ID=${APP_ID}, APP_SECRET=${mask(APP_SECRET)}, SHORT=${mask(SHORT)}`);

const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
url.searchParams.set('grant_type', 'fb_exchange_token');
url.searchParams.set('client_id', APP_ID);
url.searchParams.set('client_secret', APP_SECRET);
url.searchParams.set('fb_exchange_token', SHORT);

const res = await fetch(url, { method: 'GET' });
const json = await res.json();

if (!res.ok || !json.access_token) {
  console.error(`FAIL: exchange request failed (HTTP ${res.status})`);
  console.error(JSON.stringify(json.error ?? json, null, 2));
  process.exit(1);
}

const NEW_TOKEN = json.access_token;
const expiresIn = Number(json.expires_in ?? 0);
const tokenType = json.token_type ?? '?';

console.log(`Exchange OK: new_token=${mask(NEW_TOKEN)}, token_type=${tokenType}, expires_in=${expiresIn}s (~${Math.round(expiresIn / 86400)} days)`);

if (expiresIn < MIN_EXPIRES_IN) {
  console.error(`FAIL: expires_in (${expiresIn}) < ${MIN_EXPIRES_IN} — not long-lived. Aborting WITHOUT writing.`);
  process.exit(1);
}

// Rewrite .env.local: replace META_ACCESS_TOKEN, drop META_SHORT_LIVED_TOKEN
const lines = text.split(/\r?\n/);
const out = [];
let replacedAccess = false;
for (const line of lines) {
  if (/^META_ACCESS_TOKEN=/.test(line)) {
    out.push(`META_ACCESS_TOKEN=${NEW_TOKEN}`);
    replacedAccess = true;
  } else if (/^META_SHORT_LIVED_TOKEN=/.test(line)) {
    // drop
  } else {
    out.push(line);
  }
}
if (!replacedAccess) out.push(`META_ACCESS_TOKEN=${NEW_TOKEN}`);

const tmpPath = ENV_PATH + '.tmp';
await writeFile(tmpPath, out.join('\n'), { encoding: 'utf8', mode: 0o600 });
await rename(tmpPath, ENV_PATH);

console.log(`OK: META_ACCESS_TOKEN updated (length=${NEW_TOKEN.length}), META_SHORT_LIVED_TOKEN removed`);
