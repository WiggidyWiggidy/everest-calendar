#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repo = '/Users/happy/Desktop/Claude Project/everest-calendar';
const envPath = path.join(repo, '.env.local');
const prod = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const secret = process.env.MARKETING_SYNC_SECRET;
if (!secret) {
  console.error('MARKETING_SYNC_SECRET missing');
  process.exit(1);
}

async function call(mode, extra = {}) {
  const res = await fetch(`${prod}/api/marketing/ops/run-analytics-cycle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': secret,
      'x-runner-source': 'launchd',
    },
    body: JSON.stringify({ mode, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ mode, ok: res.ok, status: res.status, body: json }, null, 2));
  if (!res.ok) throw new Error(`${mode} failed: ${res.status}`);
}

await call('sentinel');
await call('hot');
