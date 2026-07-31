#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);
const PROD = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';

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
async function loadEnv() { await loadEnvFile(path.join(os.homedir(), '.zshenv')); await loadEnvFile(path.join(repoRoot, '.env.local')); }
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
function env() { return { base: (process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), key: process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '' }; }
async function curl(args, json = true) { const { stdout } = await execFileAsync('/usr/bin/curl', args, { maxBuffer: 8 * 1024 * 1024 }); return json ? JSON.parse(stdout || 'null') : stdout; }
async function restRows(table, params) { const { base, key } = env(); const url = new URL(`${base}/rest/v1/${table}`); for (const [k, v] of params) url.searchParams.append(k, v); return curl(['-sS', '--max-time', '25', '--retry', '3', '--retry-delay', '1', '--retry-all-errors', url.toString(), '-H', `apikey: ${key}`, '-H', `Authorization: Bearer ${key}`, '-H', 'Accept: application/json']); }
async function liveProbe(url, method = 'OPTIONS') {
  try {
    const out = await execFileAsync('/usr/bin/curl', ['-sS', '-L', '-o', '/dev/null', '-w', '%{http_code} %{url_effective}', '--max-time', '20', '-X', method, url], { maxBuffer: 2048 });
    const [codeRaw, effectiveUrl] = out.stdout.trim().split(/\s+/, 2);
    return { code: Number(codeRaw || 0), effective_url: effectiveUrl || null, redirected_to_login: /\/login\/?$/.test(effectiveUrl || '') };
  } catch {
    return { code: 0, effective_url: null, redirected_to_login: false };
  }
}
function contains(raw, needle) { return raw.includes(needle); }
async function liveThemeAsset(key) {
  if (!process.env.MARKETING_SYNC_SECRET) return { ok: false, blocker: 'MARKETING_SYNC_SECRET missing' };
  try {
    const url = `${PROD}/api/marketing/theme/asset?key=${encodeURIComponent(key)}`;
    const { stdout } = await execFileAsync('/usr/bin/curl', ['--http1.1', '-sS', '--max-time', '30', '--retry', '2', '--retry-all-errors', url, '-H', `x-sync-secret: ${process.env.MARKETING_SYNC_SECRET}`], { maxBuffer: 8 * 1024 * 1024 });
    const payload = JSON.parse(stdout || '{}');
    const value = payload.value || '';
    let parsedText = '';
    try {
      const parsed = JSON.parse(value);
      const strings = [];
      const walk = (node) => {
        if (typeof node === 'string') strings.push(node);
        else if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') Object.values(node).forEach(walk);
      };
      walk(parsed);
      parsedText = strings.join('\n');
    } catch {}
    return { ok: Boolean(value), theme_id: payload.theme_id, key: payload.key, bytes: value.length, value, parsedText };
  } catch (error) {
    return { ok: false, blocker: String(error?.message || error) };
  }
}
function hasEnv(names) { return names.some((name) => Boolean(process.env[name])); }

async function main() {
  await loadEnv();
  const config = await readJson(path.join(repoRoot, 'config/kryo-whatsapp-tracking.json'));
  const sourceHealth = await readJson(path.join(repoRoot, 'artifacts/kryo-source-health/latest/source-health.json')) || {};
  const spine = await readJson(path.join(repoRoot, 'artifacts/kryo-measurement-spine/latest/measurement-spine-health.json')) || {};
  const spec = await readJson(path.join(repoRoot, 'artifacts/kryo-experiment-packets/latest/experiment-spec.json')) || {};
  const pixel = await fs.readFile(path.join(repoRoot, 'theme-assets/snippets/everest-attribution-pixel.liquid'), 'utf8').catch(() => '');
  const eventRoute = await fs.readFile(path.join(repoRoot, 'src/app/api/marketing/sync/storefront-event/route.ts'), 'utf8').catch(() => '');
  const leadRoute = await fs.readFile(path.join(repoRoot, 'src/app/api/marketing/kryo/leads/capture/route.ts'), 'utf8').catch(() => '');
  const liveTemplate = await liveThemeAsset('templates/product.kryo2_.json');

  const dbExperiment = spec.experiment_key ? await restRows('kryo_growth_experiments', [['experiment_key', `eq.${spec.experiment_key}`], ['select', 'id,experiment_key,status,landing_page_version,angle_id,hook_id'], ['limit', '1']]).catch(() => []) : [];
  const liveLeadProbe = await liveProbe(`${PROD}/api/marketing/kryo/leads/capture`, 'OPTIONS');
  const liveStorefrontProbe = await liveProbe(`${PROD}/api/marketing/sync/storefront-event`, 'OPTIONS');

  const checks = [];
  checks.push({ id: 'meta_whatsapp_asset_from_screenshot', status: config?.meta_ads_selected_whatsapp_asset_id === '907927035270302' ? 'ok' : 'blocked', evidence: config?.meta_ads_selected_whatsapp_asset_id || null, note: 'Local config matches screenshot asset ID. Pipeboard/Meta live asset read is currently quota-limited, so this is screenshot-verified not API-verified.' });
  checks.push({ id: 'website_whatsapp_number_matches_tom', status: config?.website_whatsapp_phone_e164 === '+447724709585' ? 'ok' : 'blocked', evidence: config?.website_whatsapp_phone_display || null, note: 'Canonical website WhatsApp number from Tom and live Shopify template read.' });
  checks.push({ id: 'live_kryo2_template_uses_canonical_whatsapp', status: liveTemplate.ok && (liveTemplate.parsedText || liveTemplate.value).includes('wa.me/447724709585') ? 'ok' : 'blocked', evidence: liveTemplate.ok ? { theme_id: liveTemplate.theme_id, key: liveTemplate.key, bytes: liveTemplate.bytes, has_wa_me_447724709585: (liveTemplate.parsedText || liveTemplate.value).includes('wa.me/447724709585') } : liveTemplate, note: 'Read-only Shopify live-theme asset check via marketing API.' });
  checks.push({ id: 'measurement_spine', status: spine.status === 'ok' ? 'ok' : 'blocked', evidence: spine.status || null });
  checks.push({ id: 'db_experiment_synced', status: Array.isArray(dbExperiment) && dbExperiment.length ? 'ok' : 'blocked', evidence: dbExperiment[0] || null });
  checks.push({ id: 'pixel_tracks_whatsapp_click', status: contains(pixel, 'whatsapp_click') && contains(pixel, 'wa\\.me|whatsapp') ? 'ok' : 'blocked', evidence: 'theme-assets/snippets/everest-attribution-pixel.liquid' });
  checks.push({ id: 'storefront_event_preserves_experiment_ids', status: ['utm_hook', 'experiment_id', 'experiment_key', 'landing_page_version'].every((n) => contains(eventRoute, n)) ? 'ok' : 'blocked', evidence: 'src/app/api/marketing/sync/storefront-event/route.ts' });
  checks.push({ id: 'lead_capture_route_exists', status: contains(leadRoute, 'kryo_leads') && contains(leadRoute, 'consent_to_follow_up') ? 'ok' : 'blocked', evidence: 'src/app/api/marketing/kryo/leads/capture/route.ts' });
  checks.push({ id: 'lead_capture_sends_meta_capi_lead', status: contains(leadRoute, "event_name: 'Lead'") && contains(leadRoute, "lead_type: 'whatsapp_signup'") && contains(leadRoute, '/events') ? 'ok' : 'blocked', evidence: 'src/app/api/marketing/kryo/leads/capture/route.ts', note: 'Code path sends Meta Conversions API Lead events for WhatsApp signups when env is configured.' });
  checks.push({ id: 'meta_capi_env_configured', status: hasEnv(['META_PIXEL_ID', 'NEXT_PUBLIC_META_PIXEL_ID']) && hasEnv(['META_CAPI_ACCESS_TOKEN', 'FACEBOOK_CONVERSIONS_API_TOKEN']) ? 'ok' : 'blocked', evidence: { pixel_env: hasEnv(['META_PIXEL_ID', 'NEXT_PUBLIC_META_PIXEL_ID']), capi_token_env: hasEnv(['META_CAPI_ACCESS_TOKEN', 'FACEBOOK_CONVERSIONS_API_TOKEN']) }, note: 'Required for Meta Ads Manager to receive website WhatsApp signup as a Lead event.' });
  checks.push({ id: 'live_lead_capture_route_deployed', status: liveLeadProbe.code >= 200 && liveLeadProbe.code < 300 && !liveLeadProbe.redirected_to_login ? 'ok' : 'blocked', evidence: { url: `${PROD}/api/marketing/kryo/leads/capture`, options_status: liveLeadProbe.code, effective_url: liveLeadProbe.effective_url }, note: liveLeadProbe.redirected_to_login ? 'Route redirects to login in production. Deploy middleware exemption and route before using first-party lead capture.' : null });
  checks.push({ id: 'live_storefront_event_route_deployed', status: liveStorefrontProbe.code >= 200 && liveStorefrontProbe.code < 300 && !liveStorefrontProbe.redirected_to_login ? 'ok' : 'blocked', evidence: { url: `${PROD}/api/marketing/sync/storefront-event`, options_status: liveStorefrontProbe.code, effective_url: liveStorefrontProbe.effective_url }, note: liveStorefrontProbe.redirected_to_login ? 'Route redirects to login in production. Deploy middleware exemption before relying on first-party event capture.' : null });
  checks.push({ id: 'paid_meta_current_costs', status: sourceHealth.metric_policy?.paid_atc_purchase_verdicts?.usable ? 'ok' : 'pending_delivery', evidence: sourceHealth.sources?.find?.((s) => s.id === 'pipeboard_meta') || null, note: 'Cost per WhatsApp lead can be calculated once spend rows resume for the new ads.' });

  const blockers = checks.filter((c) => c.status === 'blocked');
  const pending = checks.filter((c) => c.status === 'pending_delivery');
  const report = {
    generated_at: new Date().toISOString(),
    status: blockers.length ? 'blocked' : pending.length ? 'pending_delivery' : 'ok',
    mutation_performed: false,
    meta_native_tracking_answer: 'Meta should track native Click-to-WhatsApp messaging metrics if the new ads use the WhatsApp destination and selected Everest Labs asset ID 907927035270302 from the screenshot.',
    first_party_tracking_answer: 'First-party cost per WhatsApp signup uses kryo_leads joined to ad spend by utm_ad_id/meta_ad_id, experiment_id, experiment_key, angle_id, hook_id and landing_page_version. Meta Ads Manager signup visibility uses Conversions API event_name=Lead with lead_type=whatsapp_signup when META_PIXEL_ID and META_CAPI_ACCESS_TOKEN are configured.',
    required_ad_url_params: config?.policy?.required_ad_url_params || [],
    current_experiment: { experiment_id: spec.experiment_id || null, experiment_key: spec.experiment_key || null, landing_page_version: spec.treatment?.landing_page_version || spec.landing_page_version || null, angle_id: spec.angle_id || null, hook_id: spec.hook_id || null },
    checks,
    launch_rule: blockers.length ? 'Do not call WhatsApp signup tracking production-ready until blocked checks pass.' : 'Tracking checks pass except any pending delivery state; start ads and refresh Meta/Pipeboard after delivery begins.',
  };

  const outDir = path.join(repoRoot, 'artifacts/kryo-whatsapp-tracking-readiness/latest');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'whatsapp-tracking-readiness.json'), JSON.stringify(report, null, 2));
  const lines = ['# KRYO WhatsApp Tracking Readiness', '', `Generated: ${report.generated_at}`, `Status: ${report.status.toUpperCase()}`, 'Mutation performed: no', '', `Meta native: ${report.meta_native_tracking_answer}`, '', `First-party: ${report.first_party_tracking_answer}`, '', '## Checks'];
  for (const c of checks) lines.push(`- ${c.status.toUpperCase()} ${c.id}: ${typeof c.evidence === 'string' ? c.evidence : JSON.stringify(c.evidence)}${c.note ? `, ${c.note}` : ''}`);
  lines.push('', '## Required ad URL params');
  for (const p of report.required_ad_url_params) lines.push(`- ${p}`);
  lines.push('', `Launch rule: ${report.launch_rule}`);
  await fs.writeFile(path.join(outDir, 'whatsapp-tracking-readiness.md'), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ status: report.status, blockers: blockers.length, pending: pending.length, report: path.join(outDir, 'whatsapp-tracking-readiness.md'), mutation_performed: false }, null, 2));
  if (blockers.length) process.exitCode = 2;
}
main().catch((err) => { console.error(err); process.exit(1); });
