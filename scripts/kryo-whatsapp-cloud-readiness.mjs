#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const PROD = process.env.PROD || 'https://everest-calendar.vercel.app';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const OUT = path.join(ROOT, 'artifacts/kryo-whatsapp-cloud-readiness/latest');


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

async function restProbe(table) {
  const base = (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) return { ok: false, status: 0, body: 'missing supabase env' };
  try {
    const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
  } catch (error) {
    return { ok: false, status: 0, body: String(error?.message || error) };
  }
}

function hasEnv(names) {
  return names.some((name) => Boolean(process.env[name]));
}

async function graphGet(pathname, token) {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pathname}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 2000) };
  } catch (error) {
    return { ok: false, status: 0, body: String(error?.message || error) };
  }
}

async function routeProbe() {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN || '__missing__';
  const url = `${PROD}/api/webhooks/meta-whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=kryo_probe`;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), body: text.slice(0, 200) };
  } catch (error) {
    return { status: 0, error: String(error?.message || error) };
  }
}

function push(checks, status, name, detail, note) {
  checks.push({ status, name, detail, note });
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const checks = [];
  const webhookRouteExists = fs.existsSync(path.join(ROOT, 'src/app/api/webhooks/meta-whatsapp/route.ts'));
  const sendRouteExists = fs.existsSync(path.join(ROOT, 'src/app/api/marketing/kryo/whatsapp/send-template/route.ts'));
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_CLOUD_API_TOKEN || null;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || null;
  const wabaId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;

  push(checks, webhookRouteExists ? 'ok' : 'blocked', 'local_webhook_route_exists', 'src/app/api/webhooks/meta-whatsapp/route.ts', 'Logs inbound WhatsApp messages/statuses to Supabase.');
  push(checks, sendRouteExists ? 'ok' : 'blocked', 'local_send_template_route_exists', 'src/app/api/marketing/kryo/whatsapp/send-template/route.ts', 'Authenticated backend route for approved template follow-up.');
  const conversationsProbe = await restProbe('kryo_whatsapp_conversations');
  push(checks, conversationsProbe.ok ? 'ok' : 'blocked', 'db_conversations_table', conversationsProbe, 'Live Supabase table for conversation logging.');
  const messagesProbe = await restProbe('kryo_whatsapp_messages');
  push(checks, messagesProbe.ok ? 'ok' : 'blocked', 'db_messages_table', messagesProbe, 'Live Supabase table for message logging.');

  push(checks, hasEnv(['META_APP_SECRET']) ? 'ok' : 'blocked', 'meta_app_secret', 'META_APP_SECRET', 'Required to verify x-hub-signature-256 on WhatsApp webhooks.');
  push(checks, hasEnv(['META_WEBHOOK_VERIFY_TOKEN']) ? 'ok' : 'blocked', 'webhook_verify_token', 'META_WEBHOOK_VERIFY_TOKEN', 'Required for Meta webhook challenge verification.');
  push(checks, token ? 'ok' : 'blocked', 'whatsapp_cloud_api_token', token ? 'present' : 'missing', 'Use a dedicated WhatsApp Cloud API/system-user token, not the deprecated direct Meta ad token.');
  push(checks, phoneNumberId ? 'ok' : 'blocked', 'whatsapp_phone_number_id', phoneNumberId || 'missing', 'Required for /messages sends and phone quality checks.');
  push(checks, wabaId ? 'ok' : 'blocked', 'whatsapp_business_account_id', wabaId || 'missing', 'Required to list message templates and subscribe WABA webhooks.');

  const route = await routeProbe();
  push(checks, route.status === 200 && route.body === 'kryo_probe' ? 'ok' : 'blocked', 'live_meta_whatsapp_webhook_route', route, 'Production must answer Meta webhook challenge before WABA subscription.');

  if (token && phoneNumberId) {
    const phoneProbe = await graphGet(`${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier`, token);
    push(checks, phoneProbe.ok ? 'ok' : 'blocked', 'graph_phone_number_probe', phoneProbe, 'Verifies phone number is readable by the Cloud API token.');
  } else {
    push(checks, 'blocked', 'graph_phone_number_probe', 'skipped', 'Missing token or phone_number_id.');
  }

  if (token && wabaId) {
    const templateProbe = await graphGet(`${wabaId}/message_templates?fields=name,status,category,language&limit=50`, token);
    push(checks, templateProbe.ok ? 'ok' : 'blocked', 'graph_template_probe', templateProbe, 'Verifies approved templates can be listed for later outbound messages.');
  } else {
    push(checks, 'blocked', 'graph_template_probe', 'skipped', 'Missing token or WABA ID.');
  }

  const blockers = checks.filter((c) => c.status === 'blocked').length;
  const status = blockers ? 'blocked' : 'ok';
  const report = [`# KRYO WhatsApp Cloud API Readiness`, '', `Generated: ${new Date().toISOString()}`, `Status: ${status.toUpperCase()}`, '', '## Checks'];
  for (const c of checks) report.push(`- ${c.status.toUpperCase()} ${c.name}: ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}${c.note ? ` — ${c.note}` : ''}`);
  report.push('', '## Required before “message them later” is ready', '- Dedicated WhatsApp Cloud API access token.', '- WhatsApp phone_number_id matching the Meta Ads WhatsApp asset selected for ads.', '- WhatsApp Business Account ID.', '- Production webhook route deployed and subscribed to WABA messages/statuses.', '- Approved outbound message templates for post-24h follow-up.', '- Website lead capture consent preserved in kryo_leads.consent_to_follow_up.');
  fs.writeFileSync(path.join(OUT, 'whatsapp-cloud-readiness.md'), report.join('\n'));
  fs.writeFileSync(path.join(OUT, 'whatsapp-cloud-readiness.json'), JSON.stringify({ generated_at: new Date().toISOString(), status, blockers, checks }, null, 2));
  console.log(JSON.stringify({ status, blockers, report: path.join(OUT, 'whatsapp-cloud-readiness.md'), mutation_performed: false }, null, 2));
  process.exitCode = blockers ? 2 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
