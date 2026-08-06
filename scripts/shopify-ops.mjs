#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const READ_URL = 'https://everest-calendar.vercel.app/api/marketing/theme/asset';
const WRITE_URL = 'https://everest-calendar.vercel.app/api/marketing/theme/deploy-asset';
const TOP_LEVEL_FIELDS = new Set(['operation_type', 'surface', 'target', 'change', 'verification', 'rollback', 'forbidden', 'approval_required', 'historical_research', 'tools']);

function output(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function readJson(file) { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
function count(value, needle) { return value.split(needle).length - 1; }
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
function secret() {
  loadEnvFile(path.join(ROOT, '.env.local'));
  loadEnvFile(path.join(ROOT, '.env.production.local'));
  return process.env.MARKETING_SYNC_SECRET;
}
function loadManifest(file, policy, surfaces) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = [];
  for (const key of ['operation_type', 'surface', 'target', 'change', 'verification', 'rollback', 'forbidden', 'approval_required']) if (!(key in manifest)) errors.push(`missing:${key}`);
  for (const key of Object.keys(manifest)) if (!TOP_LEVEL_FIELDS.has(key)) errors.push(`unexpected:${key}`);
  if (typeof manifest.operation_type !== 'string' || !policy.allowed_operation_types.includes(manifest.operation_type)) errors.push('invalid:operation_type');
  if (typeof manifest.surface !== 'string') errors.push('invalid:surface');
  for (const key of ['target', 'change', 'verification', 'rollback']) if (!manifest[key] || Array.isArray(manifest[key]) || typeof manifest[key] !== 'object') errors.push(`invalid:${key}`);
  if (!Array.isArray(manifest.forbidden) || !manifest.forbidden.every((value) => typeof value === 'string')) errors.push('invalid:forbidden');
  if (typeof manifest.approval_required !== 'boolean') errors.push('invalid:approval_required');
  if (manifest.tools?.some((tool) => policy.forbidden_tools.includes(tool))) errors.push('forbidden_tool_requested');
  const protectedSurface = policy.protected_surfaces.some((item) => item.toLowerCase() === manifest.surface.toLowerCase());
  if (protectedSurface && !(manifest.approval_required === true && manifest.change.explicit_protected_permission === true)) errors.push('protected_surface_requires_explicit_permission');
  const handle = manifest.target.handle ?? manifest.target.product_handle;
  if (typeof handle === 'string' && surfaces.historical_handles.includes(handle) && manifest.historical_research !== true) errors.push('historical_handle_refused');
  if (manifest.operation_type === 'theme_asset_replace') {
    if (typeof manifest.target.key !== 'string' || typeof manifest.change.from !== 'string' || typeof manifest.change.to !== 'string' || !manifest.change.from || !manifest.change.to || manifest.change.from === manifest.change.to) errors.push('invalid:theme_asset_replace');
  }
  if (manifest.operation_type === 'theme_asset_json_patch') {
    if (typeof manifest.target.key !== 'string' || !Array.isArray(manifest.change.patches) || manifest.change.patches.length === 0) errors.push('invalid:theme_asset_json_patch');
  }
  return { manifest, errors };
}
function requireThemeKey(key) {
  return typeof key === 'string' && key.startsWith('templates/product.kryo-');
}
function parseThemeJson(value) { return JSON.parse(value.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')); }
function setPointer(document, pointer, value) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new Error('invalid_json_pointer');
  const parts = pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent = document;
  for (const part of parts.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(parent, part) || !parent[part] || typeof parent[part] !== 'object') throw new Error(`missing_json_pointer:${pointer}`);
    parent = parent[part];
  }
  const last = parts.at(-1);
  if (!Object.prototype.hasOwnProperty.call(parent, last)) throw new Error(`missing_json_pointer:${pointer}`);
  parent[last] = value;
}
async function readAsset(themeId, key, syncSecret) {
  const url = new URL(READ_URL); url.searchParams.set('theme_id', String(themeId)); url.searchParams.set('key', key);
  const response = await fetch(url, { headers: { 'x-sync-secret': syncSecret } });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.value !== 'string') throw new Error(`read_failed:${response.status}`);
  return data.value;
}
async function deploy(themeId, key, value, syncSecret) {
  const response = await fetch(WRITE_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-secret': syncSecret }, body: JSON.stringify({ theme_id: Number(themeId), key, value }) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(`deploy_failed:${response.status}`);
}
function themeId(manifest, surfaces) { return manifest.target.theme_id ?? surfaces.live_theme_id; }
async function applyTheme(manifest, surfaces, syncSecret, rollback = false) {
  const key = manifest.target.key;
  if (!requireThemeKey(key)) return output({ status: 'REFUSED_THEME_KEY', key });
  const id = themeId(manifest, surfaces);
  if (!Number.isFinite(Number(id))) return output({ status: 'INVALID_THEME_ID' });
  let updated;
  if (rollback) {
    if (typeof manifest.rollback?.value !== 'string' || !manifest.rollback.value) return output({ status: 'ROLLBACK_BLOCKED', error: 'rollback.value required' });
    updated = manifest.rollback.value;
  } else {
    const current = await readAsset(id, key, syncSecret);
    if (manifest.operation_type === 'theme_asset_replace') {
      if (count(current, manifest.change.from) !== 1) return output({ status: 'EXACT_FROM_COUNT_NOT_ONE', count: count(current, manifest.change.from) });
      if (count(current, manifest.change.to) !== 0) return output({ status: 'TO_ALREADY_PRESENT', count: count(current, manifest.change.to) });
      updated = current.replace(manifest.change.from, manifest.change.to);
    } else {
      const json = parseThemeJson(current);
      for (const patch of manifest.change.patches) setPointer(json, patch.path, patch.value);
      updated = `${current.match(/^\s*\/\*[\s\S]*?\*\/\s*/)?.[0] ?? ''}${JSON.stringify(json, null, 2)}\n`;
    }
  }
  if (manifest.operation_type === 'theme_asset_json_patch') parseThemeJson(updated);
  await deploy(id, key, updated, syncSecret);
  const reread = await readAsset(id, key, syncSecret);
  if (reread !== updated) return output({ status: 'VERIFY_FAILED', theme_id: Number(id), key });
  output({ status: rollback ? 'ROLLBACK_VERIFIED' : 'APPLY_VERIFIED', theme_id: Number(id), key });
}

async function main() {
  const [command, manifestPath, ...flags] = process.argv.slice(2);
  if (!['plan', 'validate', 'apply', 'rollback'].includes(command) || !manifestPath) return output({ status: 'INVALID_ARGUMENT', usage: 'shopify-ops <plan|validate|apply|rollback> <manifest> [--approved]' });
  const policy = readJson('config/shopify-ops-policy.json');
  const surfaces = readJson('config/shopify-surfaces.json');
  const { manifest, errors } = loadManifest(manifestPath, policy, surfaces);
  if (errors.length) return output({ status: 'MANIFEST_INVALID', errors });
  const implemented = policy.implemented_operation_types.includes(manifest.operation_type);
  if (command === 'validate') return output({ status: 'MANIFEST_VALID', operation_type: manifest.operation_type, implemented });
  if (command === 'plan') return output({ status: implemented ? 'PLAN_READY' : 'OPERATION_NOT_IMPLEMENTED', operation_type: manifest.operation_type, surface: manifest.surface, target: manifest.target, verification: manifest.verification, rollback_present: Boolean(manifest.rollback?.value), api_surfaces: implemented ? policy.allowed_api_surfaces.theme_assets : [] });
  if (!implemented) return output({ status: 'OPERATION_NOT_IMPLEMENTED', operation_type: manifest.operation_type });
  if (!flags.includes('--approved')) return output({ status: 'APPROVAL_REQUIRED' });
  const syncSecret = secret();
  if (!syncSecret) return output({ status: 'ENVIRONMENT_UNAVAILABLE', error: 'MARKETING_SYNC_SECRET unavailable' });
  await applyTheme(manifest, surfaces, syncSecret, command === 'rollback');
}
main().catch((error) => output({ status: 'OPERATION_FAILED', error: error instanceof Error ? error.message : String(error) }));
