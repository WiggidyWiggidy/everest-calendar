// Verify the installed META_ACCESS_TOKEN via debug_token + me/adaccounts.
// Reads only env. Never prints tokens — only metadata.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = resolve(__dirname, '..', '.env.local');
const GRAPH_VERSION = 'v19.0';
const EXPECTED_APP_ID = '2512926899199973';
const MIN_DAYS = 50;

const STATUS_NAMES = {
  1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED',
  7: 'PENDING_RISK_REVIEW', 8: 'PENDING_SETTLEMENT',
  9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE', 101: 'CLOSED',
  201: 'ANY_ACTIVE', 202: 'ANY_CLOSED',
};

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

const env = parseEnv(await readFile(ENV_PATH, 'utf8'));
const APP_ID = env.get('META_APP_ID');
const APP_SECRET = env.get('META_APP_SECRET');
const TOKEN = env.get('META_ACCESS_TOKEN');

if (!APP_ID || !APP_SECRET || !TOKEN) {
  console.error('FAIL: missing one of META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN');
  process.exit(1);
}

const APP_ACCESS = `${APP_ID}|${APP_SECRET}`;

// ---- debug_token ----
{
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token`);
  url.searchParams.set('input_token', TOKEN);
  url.searchParams.set('access_token', APP_ACCESS);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json.data) {
    console.error(`FAIL: debug_token (HTTP ${res.status})`);
    console.error(JSON.stringify(json.error ?? json, null, 2));
    process.exit(1);
  }
  const d = json.data;
  const exp = d.expires_at ? new Date(d.expires_at * 1000) : null;
  const dexp = d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000) : null;
  const days = exp ? Math.round((exp.getTime() - Date.now()) / 86400000) : null;

  console.log('debug_token:');
  console.log(`  is_valid:  ${d.is_valid}`);
  console.log(`  type:      ${d.type}`);
  console.log(`  app_id:    ${d.app_id}`);
  console.log(`  expires_at: ${exp ? exp.toISOString() : 'never'}${days !== null ? ` (~${days} days from now)` : ''}`);
  console.log(`  data_access_expires_at: ${dexp ? dexp.toISOString() : 'n/a'}`);
  console.log(`  scopes:    ${JSON.stringify(d.scopes ?? [])}`);
  if (d.granular_scopes) {
    console.log(`  granular_scopes: ${JSON.stringify(d.granular_scopes)}`);
  }

  if (!d.is_valid) { console.error('FAIL: token is_valid=false'); process.exit(1); }
  if (String(d.app_id) !== EXPECTED_APP_ID) {
    console.error(`FAIL: app_id mismatch (got ${d.app_id}, expected ${EXPECTED_APP_ID})`);
    process.exit(1);
  }
  if (days !== null && days < MIN_DAYS) {
    console.error(`FAIL: only ${days} days until expiry, expected >= ${MIN_DAYS}`);
    process.exit(1);
  }
}

// ---- me/adaccounts ----
{
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts`);
  url.searchParams.set('fields', 'id,name,account_status');
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json.data) {
    console.error(`FAIL: me/adaccounts (HTTP ${res.status})`);
    console.error(JSON.stringify(json.error ?? json, null, 2));
    process.exit(1);
  }
  console.log('');
  console.log(`me/adaccounts (${json.data.length} returned):`);
  if (json.data.length === 0) {
    console.error('FAIL: zero ad accounts — token likely lacks ads_management/ads_read');
    process.exit(1);
  }
  for (const row of json.data) {
    const name = STATUS_NAMES[row.account_status] ?? '?';
    console.log(`  ${row.id} | ${row.name} | ${row.account_status} (${name})`);
  }
}

console.log('');
console.log('OK: token verified end-to-end');
