#!/usr/bin/env node
/**
 * kryo-slot-edit — safe, addressable landing-page edits.
 *
 * WHY THIS EXISTS
 * Editing a Shopify page by rewriting liquid is unreviewable and unrevertable. This tool edits
 * ONE setting at ONE address in the template JSON, so a change is a diff of a single string.
 * Every known page defect on KRYO turned out to be exactly that — a single setting.
 *
 * ADDRESS = template-suffix / section-id / block-id / setting-key
 *
 * SAFETY (non-negotiable, per .claude/rules/production-permissions.md)
 *   - `map` and `get` are read-only.
 *   - `set` requires --confirm AND writes a timestamped backup first.
 *   - `set` refuses to touch a LIVE template unless --allow-live is also passed.
 *   - Every write prints the exact before/after and the rollback command.
 *   - The agent NEVER passes --allow-live on its own. Tom approves live edits.
 *
 * USAGE
 *   node scripts/kryo-slot-edit.mjs map    --template kryo2_
 *   node scripts/kryo-slot-edit.mjs get    --template kryo2_ --section blocks_dijJNt --block ai_gen_block_5x --key cta_text
 *   node scripts/kryo-slot-edit.mjs set    --template kryo2_ --section ... --block ... --key cta_text \
 *                                          --value "Add to cart — Standard | 12L" --confirm [--allow-live]
 *   node scripts/kryo-slot-edit.mjs restore --file <backup.json> --template kryo2_ --confirm --allow-live
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const API = '2024-10';
const a = process.argv.slice(2);
const cmd = a[0];
const arg = (k, d = null) => { const i = a.indexOf(`--${k}`); return i === -1 ? d : a[i + 1]; };
const has = (k) => a.includes(`--${k}`);
const BACKUP_DIR = path.join(process.cwd(), 'theme-assets', 'backups');

function loadEnvFile(f) {
  try { for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  } } catch {}
}
function ensureEnv() {
  loadEnvFile(path.join(os.homedir(), '.zshenv')); loadEnvFile('.env.local');
  if (!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)) {
    const tmp = path.join(os.tmpdir(), `everest-vercel-${Date.now()}.env`);
    const r = spawnSync('vercel', ['env', 'pull', tmp, '--environment', 'production', '--yes'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`vercel env pull failed: ${r.stderr || r.stdout}`);
    loadEnvFile(tmp);
  }
}
const shop = () => (process.env.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
async function token() {
  const r = await fetch(`https://${shop()}/admin/oauth/access_token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`token failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}
async function mainThemeId(tok) {
  const r = await fetch(`https://${shop()}/admin/api/${API}/themes.json`, { headers: { 'X-Shopify-Access-Token': tok } });
  const j = await r.json();
  const live = (j.themes || []).find(t => t.role === 'main');
  if (!live) throw new Error('no main theme found');
  return live.id;
}
async function getAsset(tok, themeId, key) {
  const r = await fetch(`https://${shop()}/admin/api/${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { headers: { 'X-Shopify-Access-Token': tok } });
  const j = await r.json(); if (!j.asset) throw new Error(`asset not found: ${key}`);
  return j.asset.value;
}
async function putAsset(tok, themeId, key, value) {
  const r = await fetch(`https://${shop()}/admin/api/${API}/themes/${themeId}/assets.json`, { method: 'PUT',
    headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }) });
  const t = await r.text(); if (!r.ok) throw new Error(`PUT ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t).asset;
}
const isTexty = (v) => typeof v === 'string' && v.trim().length > 2 && !/^(shopify:\/\/|#|https?:\/\/)/.test(v) && !/^[\d.]+$/.test(v);

function walk(doc) {
  const out = [];
  for (const [sid, s] of Object.entries(doc.sections || {})) {
    for (const [k, v] of Object.entries(s.settings || {})) if (isTexty(v)) out.push({ section: sid, block: null, type: s.type, key: k, value: v });
    for (const [bid, b] of Object.entries(s.blocks || {})) {
      for (const [k, v] of Object.entries(b.settings || {})) if (isTexty(v)) out.push({ section: sid, block: bid, type: b.type, key: k, value: v });
    }
  }
  return out;
}

(async () => {
  ensureEnv();
  const tpl = arg('template'); if (!tpl && cmd !== 'restore') { console.log('--template required'); process.exit(1); }
  const assetKey = `templates/product.${tpl}.json`;
  const tok = await token();
  const themeId = arg('theme') || await mainThemeId(tok);

  if (cmd === 'map' || cmd === 'get') {
    const doc = JSON.parse(await getAsset(tok, themeId, assetKey));
    let slots = walk(doc);
    const f = { section: arg('section'), block: arg('block'), key: arg('key') };
    if (f.section) slots = slots.filter(s => s.section === f.section);
    if (f.block)   slots = slots.filter(s => s.block === f.block);
    if (f.key)     slots = slots.filter(s => s.key === f.key);
    if (arg('grep')) { const re = new RegExp(arg('grep'), 'i'); slots = slots.filter(s => re.test(s.value) || re.test(s.key)); }
    console.log(JSON.stringify({ theme: themeId, template: tpl, count: slots.length,
      slots: slots.map(s => ({ ...s, value: s.value.length > 160 ? s.value.slice(0, 160) + '…' : s.value })) }, null, 1));
    return;
  }

  if (cmd === 'set') {
    const [section, block, key, value] = [arg('section'), arg('block'), arg('key'), arg('value')];
    if (!section || !key || value === null) { console.log('--section --key --value required (--block optional)'); process.exit(1); }
    const raw = await getAsset(tok, themeId, assetKey);
    const doc = JSON.parse(raw);
    const target = block ? doc.sections?.[section]?.blocks?.[block]?.settings : doc.sections?.[section]?.settings;
    if (!target) { console.log(`✗ address not found: ${section}${block ? '/' + block : ''}`); process.exit(1); }
    if (!(key in target)) { console.log(`✗ setting "${key}" not present. Available: ${Object.keys(target).join(', ')}`); process.exit(1); }

    const before = target[key];
    console.log(`\n  ADDRESS  ${tpl} / ${section}${block ? ' / ' + block : ''} / ${key}`);
    console.log(`  BEFORE   ${JSON.stringify(before).slice(0, 200)}`);
    console.log(`  AFTER    ${JSON.stringify(value).slice(0, 200)}\n`);
    if (before === value) { console.log('  no change — value identical. Nothing written.'); return; }

    if (!has('confirm')) { console.log('  DRY RUN — pass --confirm to write.\n'); return; }
    if (!has('allow-live')) { console.log('  ✗ REFUSED: this writes to the LIVE theme. --allow-live is required and is Tom\'s decision.\n'); process.exit(1); }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bfile = path.join(BACKUP_DIR, `product.${tpl}.${stamp}.json`);
    fs.writeFileSync(bfile, raw);
    console.log(`  backup   ${bfile}`);

    target[key] = value;
    await putAsset(tok, themeId, assetKey, JSON.stringify(doc, null, 2));

    const verify = JSON.parse(await getAsset(tok, themeId, assetKey));
    const now = block ? verify.sections[section].blocks[block].settings[key] : verify.sections[section].settings[key];
    console.log(now === value ? '  ✓ WRITTEN and verified by re-read' : `  ✗ VERIFY FAILED — server has: ${JSON.stringify(now).slice(0,120)}`);
    console.log(`\n  ROLLBACK:\n    node scripts/kryo-slot-edit.mjs restore --file ${bfile} --template ${tpl} --confirm --allow-live\n`);
    console.log('  NEXT: hand to live-ux-tester to verify on the live storefront at mobile + desktop.\n');
    return;
  }

  if (cmd === 'restore') {
    const file = arg('file'); const t = arg('template');
    if (!file || !t) { console.log('--file and --template required'); process.exit(1); }
    if (!has('confirm') || !has('allow-live')) { console.log('restore needs --confirm --allow-live'); process.exit(1); }
    await putAsset(tok, themeId, `templates/product.${t}.json`, fs.readFileSync(file, 'utf8'));
    console.log(`✓ restored ${t} from ${file}`);
    return;
  }

  console.log('commands: map | get | set | restore');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
