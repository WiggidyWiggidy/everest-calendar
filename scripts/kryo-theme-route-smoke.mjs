#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const API_URL = 'https://everest-calendar.vercel.app/api/marketing/theme/asset';
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
function rerunWithVercel() {
  const result = spawnSync('vercel', ['env', 'run', '-e', 'production', '--', 'node', 'scripts/kryo-theme-route-smoke.mjs', ...process.argv.slice(2)], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, VERCEL_ORG_ID: 'team_APTSoQ25dQx4XWTLo2B1jMhc', VERCEL_PROJECT_ID: 'prj_qR9zv74j4YKo8x55SlwpV9SvA8xy', KRYO_THEME_ENV_REEXEC: '1' } });
  if (result.status === 0 && result.stdout.trim()) process.stdout.write(result.stdout);
  else output({ status: 'READ_SMOKE_FAILED', error: 'MARKETING_SYNC_SECRET unavailable', detail: result.stderr.trim() || null });
}
const themeId = arg('--theme-id'); const key = arg('--key'); const expected = arg('--expect');
if (!themeId || !key || !expected) output({ status: 'READ_SMOKE_FAILED', error: 'Required arguments: --theme-id --key --expect' });
else {
  const secret = loadSecret();
  if (!secret) { if (process.env.KRYO_THEME_ENV_REEXEC === '1') output({ status: 'READ_SMOKE_FAILED', error: 'MARKETING_SYNC_SECRET unavailable' }); else rerunWithVercel(); }
  else try {
    const url = new URL(API_URL); url.searchParams.set('theme_id', themeId); url.searchParams.set('key', key);
    const response = await fetch(url, { headers: { 'x-sync-secret': secret } }); const data = await response.json().catch(() => null); const value = data?.value;
    const count = typeof value === 'string' ? value.split(expected).length - 1 : 0;
    output({ status: response.ok && typeof value === 'string' && value.length > 0 && count >= 1 ? 'READ_SMOKE_PASS' : 'READ_SMOKE_FAILED', theme_id: themeId, key, count, http_status: response.status });
  } catch (error) { output({ status: 'READ_SMOKE_FAILED', error: error instanceof Error ? error.message : String(error) }); }
}
