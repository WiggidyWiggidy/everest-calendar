#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const OUT = path.join(ROOT, 'artifacts/kryo-meta-direct-readiness/latest');

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
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

function loadEnv() {
  loadEnvFile(path.join(os.homedir(), '.zshenv'));
  loadEnvFile(path.join(ROOT, '.env.local'));
}

function token() {
  return process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || null;
}

function capiToken() {
  return process.env.META_CAPI_ACCESS_TOKEN || process.env.FACEBOOK_CONVERSIONS_API_TOKEN || null;
}

function pixelId() {
  return process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || null;
}

async function graphGet(pathname, accessToken) {
  if (!accessToken) return { ok: false, status: 0, blocker: 'missing_token' };
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pathname}`);
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url);
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, body: typeof body === 'string' ? body.slice(0, 1200) : body };
  } catch (error) {
    return { ok: false, status: 0, blocker: String(error?.message || error) };
  }
}

function scrubProbe(probe) {
  if (!probe || typeof probe !== 'object') return probe;
  return probe;
}

function push(checks, status, name, detail, note) {
  checks.push({ status, name, detail: scrubProbe(detail), note });
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const checks = [];
  const metaToken = token();
  const accountId = process.env.META_AD_ACCOUNT_ID || '';
  const pixel = pixelId();
  const ctoken = capiToken();
  const wabaId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || null;

  push(checks, process.env.OWNER_WHATSAPP_PHONE === '+447724709585' ? 'ok' : 'blocked', 'canonical_owner_whatsapp_phone', process.env.OWNER_WHATSAPP_PHONE || 'missing', 'Must be +447724709585.');
  push(checks, metaToken ? 'ok' : 'blocked', 'direct_meta_token_present', metaToken ? 'present' : 'missing', 'Use META_SYSTEM_USER_ACCESS_TOKEN preferred; META_ACCESS_TOKEN is legacy fallback.');

  const me = await graphGet('me?fields=id,name', metaToken);
  push(checks, me.ok ? 'ok' : 'blocked', 'direct_meta_token_valid', me, 'Current META_ACCESS_TOKEN fails because old Meta app was deleted; fresh system-user token fixes this.');

  if (accountId) {
    const account = await graphGet(`${accountId}?fields=id,name,account_status,currency`, metaToken);
    push(checks, account.ok ? 'ok' : 'blocked', 'direct_ad_account_read', account, 'Needed for direct Meta read/write fallback without Pipeboard.');
    const pixels = await graphGet(`${accountId}/adspixels?fields=id,name,last_fired_time,is_unavailable&limit=50`, metaToken);
    push(checks, pixels.ok ? 'ok' : 'blocked', 'direct_pixel_list', pixels, 'Can recover META_PIXEL_ID from here if direct token has ads_read/business permissions.');
  } else {
    push(checks, 'blocked', 'meta_ad_account_id', 'missing', 'Needed for direct Meta Graph fallback.');
  }

  push(checks, pixel ? 'ok' : 'blocked', 'meta_pixel_id_env', pixel ? 'present' : 'missing', 'Required for website WhatsApp signup CAPI Lead event.');
  if (pixel) {
    const pixelProbe = await graphGet(`${pixel}?fields=id,name,last_fired_time`, metaToken || ctoken);
    push(checks, pixelProbe.ok ? 'ok' : 'blocked', 'meta_pixel_read', pixelProbe, 'Verifies the configured pixel is readable.');
  }
  push(checks, ctoken ? 'ok' : 'blocked', 'meta_capi_token_env', ctoken ? 'present' : 'missing', 'Required for Meta Ads Manager to receive Lead events from the website.');

  push(checks, phoneNumberId ? 'ok' : 'blocked', 'meta_whatsapp_phone_number_id_env', phoneNumberId || 'missing', 'Required for WhatsApp Cloud API send/logging.');
  if (phoneNumberId) {
    const phoneProbe = await graphGet(`${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier`, metaToken);
    push(checks, phoneProbe.ok ? 'ok' : 'blocked', 'direct_whatsapp_phone_number_read', phoneProbe, 'Should show +44 7724 709585 / Everest Labs if connected correctly.');
  }
  push(checks, wabaId ? 'ok' : 'blocked', 'meta_waba_id_env', wabaId || 'missing', 'Required to list templates and subscribe webhooks.');
  if (wabaId) {
    const templates = await graphGet(`${wabaId}/message_templates?fields=name,status,category,language&limit=25`, metaToken);
    push(checks, templates.ok ? 'ok' : 'blocked', 'direct_waba_templates_read', templates, 'Needed for follow-up templates after the 24h service window.');
  }

  const blockers = checks.filter((c) => c.status === 'blocked').length;
  const status = blockers ? 'blocked' : 'ok';
  const report = [
    '# KRYO Direct Meta Graph Readiness',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Status: ${status.toUpperCase()}`,
    '',
    'Purpose: bypass Pipeboard quota by using Meta Graph API directly once fresh Meta credentials exist.',
    '',
    '## Checks',
  ];
  for (const c of checks) report.push(`- ${c.status.toUpperCase()} ${c.name}: ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}${c.note ? ` — ${c.note}` : ''}`);
  report.push('', '## Fastest non-Pipeboard unlock', '- Create/provide a fresh Meta system-user token with ads_read, ads_management, business_management, pages_show_list, pages_read_engagement, whatsapp_business_management, whatsapp_business_messaging as needed.', '- Add/provide `META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` for website signup -> Meta Ads Manager Lead events.', '- Add/provide `META_WHATSAPP_PHONE_NUMBER_ID` and `META_WHATSAPP_BUSINESS_ACCOUNT_ID` for WABA webhooks/templates.', '- Then rerun `npm run audit:kryo-meta-direct`, `npm run audit:kryo-whatsapp-tracking`, and `npm run audit:kryo-whatsapp-cloud`.');

  fs.writeFileSync(path.join(OUT, 'meta-direct-readiness.md'), report.join('\n'));
  fs.writeFileSync(path.join(OUT, 'meta-direct-readiness.json'), JSON.stringify({ generated_at: new Date().toISOString(), status, blockers, checks }, null, 2));
  console.log(JSON.stringify({ status, blockers, report: path.join(OUT, 'meta-direct-readiness.md'), mutation_performed: false }, null, 2));
  process.exitCode = blockers ? 2 : 0;
}

main().catch((error) => { console.error(error); process.exit(1); });
