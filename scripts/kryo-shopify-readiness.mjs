#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const PROD = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
const PUBLIC_STORE = 'https://everestlabs.co';

function parseArgs(argv) {
  const args = { handle: 'kryo2_', outDir: '', noPublicRender: false, failOnBlockers: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--handle') args.handle = argv[++i];
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--no-public-render') args.noPublicRender = true;
    else if (arg === '--fail-on-blockers') args.failOnBlockers = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/kryo-shopify-readiness.mjs [--handle kryo2_] [--out DIR] [--no-public-render] [--fail-on-blockers]');
      process.exit(0);
    }
  }
  return args;
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

async function fetchText(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

function marketingHeaders() {
  if (!process.env.MARKETING_SYNC_SECRET) throw new Error('MARKETING_SYNC_SECRET missing');
  return { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET };
}

async function marketingGet(route) {
  const res = await fetchText(`${PROD}${route}`, { headers: marketingHeaders() }, 25000);
  if (!res.ok) throw new Error(`${route} failed HTTP ${res.status}: ${res.text.slice(0, 400)}`);
  return JSON.parse(res.text);
}

function addFinding(list, severity, code, message, evidence = null) {
  list.push({ severity, code, message, evidence });
}

function extractNumericIds(templateText) {
  return [...new Set((templateText.match(/\b49\d{12}\b/g) || []))].sort();
}

async function main() {
  const args = parseArgs(process.argv);
  await loadEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-shopify-readiness/${stamp}-${args.handle}`);
  await fs.mkdir(outDir, { recursive: true });
  const findings = [];

  const whoami = await marketingGet('/api/marketing/shopify/whoami');
  const themeInfo = await marketingGet('/api/marketing/theme/info');
  const product = await marketingGet(`/api/marketing/shopify/get-product?handle=${encodeURIComponent(args.handle)}`);
  const templateKey = product.template_filename || `templates/product.${product.template_suffix}.json`;
  const asset = await marketingGet(`/api/marketing/theme/asset?key=${encodeURIComponent(templateKey)}`);
  const templateText = asset.value || '';
  const templateJsonPath = path.join(outDir, `${args.handle}-${templateKey.replace(/[^a-z0-9_.-]+/gi, '_')}.json`);
  await fs.writeFile(templateJsonPath, templateText);

  const requiredScopes = ['read_products', 'write_products', 'read_publications', 'write_publications', 'read_themes', 'write_themes', 'write_theme_code'];
  const scopes = new Set(whoami.current_scopes || []);
  const missingScopes = requiredScopes.filter((scope) => !scopes.has(scope));
  if (missingScopes.length) addFinding(findings, 'blocker', 'missing_shopify_scopes', `Missing Shopify scopes: ${missingScopes.join(', ')}`);
  else addFinding(findings, 'ok', 'shopify_scopes_ok', 'Required Shopify product/publication/theme scopes are present.');

  if (!themeInfo.live_theme?.id || !themeInfo.asset_endpoint_reachable) addFinding(findings, 'blocker', 'theme_asset_unavailable', 'Live theme or asset endpoint unavailable.', themeInfo);
  else addFinding(findings, 'ok', 'theme_asset_ok', `Live theme ${themeInfo.live_theme.id} ${themeInfo.live_theme.name}; asset endpoint ${themeInfo.asset_endpoint_status}.`);

  const productVariantIds = (product.variants || []).map((v) => String(v.id));
  const templateVariantIds = extractNumericIds(templateText);
  const foreignVariantIds = templateVariantIds.filter((id) => !productVariantIds.includes(id));
  const missingOwnVariantIds = productVariantIds.filter((id) => !templateVariantIds.includes(id));
  if (foreignVariantIds.length) addFinding(findings, 'blocker', 'foreign_variant_ids_in_template', `Template contains variant IDs not owned by ${args.handle}: ${foreignVariantIds.join(', ')}`, { productVariantIds, templateVariantIds });
  if (missingOwnVariantIds.length) addFinding(findings, 'warning', 'own_variant_id_not_referenced', `Product variant ID(s) not referenced in template links: ${missingOwnVariantIds.join(', ')}`, { productVariantIds, templateVariantIds });
  if (!foreignVariantIds.length) addFinding(findings, 'ok', 'variant_id_check_ok', 'No foreign Shopify variant IDs detected in template links.', { productVariantIds, templateVariantIds });

  let parsedTemplate = null;
  try { parsedTemplate = JSON.parse(templateText); addFinding(findings, 'ok', 'template_json_valid', 'Template JSON parses successfully.'); }
  catch (err) { addFinding(findings, 'blocker', 'template_json_invalid', err instanceof Error ? err.message : String(err)); }

  const publicRender = { skipped: args.noPublicRender };
  if (!args.noPublicRender) {
    const url = `${PUBLIC_STORE}/products/${encodeURIComponent(args.handle)}?country=AE&kryo_readiness=${encodeURIComponent(stamp)}`;
    try {
      const res = await fetchText(url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } }, 25000);
      publicRender.url = url;
      publicRender.status = res.status;
      publicRender.bytes = res.text.length;
      publicRender.final_url = res.url;
      publicRender.contains_title = /<title/i.test(res.text);
      publicRender.contains_add_to_cart = /Add to Cart/i.test(res.text);
      publicRender.contains_template_strings = {
        august_30: res.text.includes('August 30') || res.text.includes('AUGUST 30'),
        whatsapp: res.text.includes('wa.me'),
      };
      await fs.writeFile(path.join(outDir, 'public-render.html'), res.text);
      if (!res.ok) addFinding(findings, 'blocker', 'public_render_failed', `Public render failed HTTP ${res.status}; live completion claims are blocked until render QC passes.`, publicRender);
      else addFinding(findings, 'ok', 'public_render_ok', `Public render loaded HTTP ${res.status}, ${res.text.length} bytes.`, publicRender);
    } catch (err) {
      publicRender.error = err instanceof Error ? err.message : String(err);
      addFinding(findings, 'blocker', 'public_render_error', `Public render check failed: ${publicRender.error}`, publicRender);
    }
  }

  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const report = {
    generated_at: new Date().toISOString(),
    handle: args.handle,
    mutation_performed: false,
    status: blockers.length ? 'blocked' : warnings.length ? 'caution' : 'ok',
    product: { id: product.id, handle: product.handle, title: product.title, template_suffix: product.template_suffix, template_filename: templateKey, variants: product.variants },
    live_theme: themeInfo.live_theme,
    shopify_scopes: whoami.current_scopes || [],
    template_backup_path: templateJsonPath,
    template_size: templateText.length,
    template_variant_ids: templateVariantIds,
    public_render: publicRender,
    findings,
    next_rules: [
      'Do not mutate Shopify until Tom approves a named patch.',
      'Before any future patch, use this backup and produce a dry-run diff.',
      'After any future patch, re-run readback and public render QC.',
    ],
  };
  const jsonPath = path.join(outDir, 'shopify-readiness.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.mkdir(path.join(repoRoot, 'artifacts/kryo-shopify-readiness/latest'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'artifacts/kryo-shopify-readiness/latest/shopify-readiness.json'), JSON.stringify(report, null, 2));

  const lines = [];
  lines.push('# KRYO Shopify Readiness');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Handle: ${args.handle}`);
  lines.push(`Status: ${report.status.toUpperCase()}`);
  lines.push(`Mutation performed: ${report.mutation_performed ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Product/template');
  lines.push(`- Product: ${product.id} / ${product.handle}`);
  lines.push(`- Template: ${templateKey}`);
  lines.push(`- Backup: ${templateJsonPath}`);
  lines.push(`- Live theme: ${themeInfo.live_theme?.id ?? 'n/a'} ${themeInfo.live_theme?.name ?? ''}`.trim());
  lines.push('');
  lines.push('## Findings');
  for (const f of findings) lines.push(`- ${f.severity.toUpperCase()} — ${f.code}: ${f.message}`);
  lines.push('');
  lines.push(`Raw JSON: ${jsonPath}`);
  const mdPath = path.join(outDir, 'shopify-readiness.md');
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(repoRoot, 'artifacts/kryo-shopify-readiness/latest/shopify-readiness.md'), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ status: report.status, blockers: blockers.length, warnings: warnings.length, mutation_performed: false, report: mdPath, json: jsonPath }, null, 2));
  if (args.failOnBlockers && blockers.length) process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
