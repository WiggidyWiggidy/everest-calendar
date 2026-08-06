#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const READ_URL = 'https://everest-calendar.vercel.app/api/marketing/theme/asset';
const WRITE_URL = 'https://everest-calendar.vercel.app/api/marketing/theme/deploy-asset';

function output(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
function loadSecret() { loadEnvFile(path.join(process.cwd(), '.env.local')); loadEnvFile(path.join(process.cwd(), '.env.production.local')); return process.env.MARKETING_SYNC_SECRET; }
function count(value, needle) { return value.split(needle).length - 1; }
function parseTemplate(value) { JSON.parse(value.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')); }
function rerunWithVercel() {
  const result = spawnSync('vercel', ['env', 'run', '-e', 'production', '--', 'node', 'scripts/kryo-theme-asset-replace.mjs', ...process.argv.slice(2)], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, VERCEL_ORG_ID: 'team_APTSoQ25dQx4XWTLo2B1jMhc', VERCEL_PROJECT_ID: 'prj_qR9zv74j4YKo8x55SlwpV9SvA8xy', KRYO_THEME_ENV_REEXEC: '1' } });
  if (result.status === 0 && result.stdout.trim()) process.stdout.write(result.stdout);
  else output({ status: 'ENVIRONMENT_UNAVAILABLE', error: 'MARKETING_SYNC_SECRET unavailable', detail: result.stderr.trim() || null });
}
async function readAsset(themeId, key, secret) {
  const url = new URL(READ_URL); url.searchParams.set('theme_id', themeId); url.searchParams.set('key', key);
  const response = await fetch(url, { headers: { 'x-sync-secret': secret } });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.value !== 'string') throw new Error(`READ_FAILED:${response.status}`);
  return data.value;
}

const themeId = arg('--theme-id'); const key = arg('--key'); const from = arg('--from'); const to = arg('--to'); const liveUrl = arg('--live-url');
if (!themeId || !key || from === undefined || to === undefined || !liveUrl) output({ status: 'INVALID_ARGUMENT', error: 'Required arguments: --theme-id --key --from --to --live-url' });
else if (!key.startsWith('templates/product.kryo-')) output({ status: 'REFUSED_KEY', key });
else if (!from || !to) output({ status: 'REFUSED_EMPTY_TEXT' });
else if (from === to) output({ status: 'REFUSED_IDENTICAL_TEXT' });
else {
  const secret = loadSecret();
  if (!secret) { if (process.env.KRYO_THEME_ENV_REEXEC === '1') output({ status: 'ENVIRONMENT_UNAVAILABLE', error: 'MARKETING_SYNC_SECRET unavailable' }); else rerunWithVercel(); }
  else try {
    const before = await readAsset(themeId, key, secret);
    if (count(before, from) !== 1) { output({ status: 'EXACT_FROM_COUNT_NOT_ONE', count: count(before, from) }); }
    else if (count(before, to) !== 0) { output({ status: 'TO_ALREADY_PRESENT', count: count(before, to) }); }
    else {
      const updated = before.replace(from, to); parseTemplate(updated);
      const deployed = await fetch(WRITE_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-secret': secret }, body: JSON.stringify({ theme_id: Number(themeId), key, value: updated }) });
      const deployData = await deployed.json().catch(() => null);
      if (!deployed.ok || !deployData?.success) output({ status: 'DEPLOY_FAILED', http_status: deployed.status, detail: deployData });
      else {
        const after = await readAsset(themeId, key, secret);
        if (count(after, from) !== 0 || count(after, to) !== 1) output({ status: 'REREAD_VERIFY_FAILED', old_count: count(after, from), new_count: count(after, to) });
        else {
          const publicUrl = new URL(liveUrl); publicUrl.searchParams.set('_kryo_verify', Date.now().toString());
          try {
            const storefront = await fetch(publicUrl, { cache: 'no-store' }); const html = await storefront.text();
            output({ status: storefront.ok && html.includes(to) ? 'LIVE_VERIFIED' : 'THEME_UPDATED_BUT_STOREFRONT_VERIFY_INCOMPLETE', theme_id: Number(themeId), key, storefront_http_status: storefront.status });
          } catch (error) { output({ status: 'THEME_UPDATED_BUT_STOREFRONT_VERIFY_INCOMPLETE', theme_id: Number(themeId), key, error: error instanceof Error ? error.message : String(error) }); }
        }
      }
    }
  } catch (error) { output({ status: 'READ_FAILED', error: error instanceof Error ? error.message : String(error) }); }
}
