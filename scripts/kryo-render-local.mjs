#!/usr/bin/env node
/**
 * Render a KRYO section + its page template to a standalone HTML file, locally.
 *
 * Exists because the storefront IP-rate-limits this machine (`local_rate_limited`, 169-byte
 * stub), which blocks live QC for hours at a time. A stub is not evidence, so the mobile UX
 * gate had nothing to measure. This renders the ACTUAL section Liquid against the ACTUAL
 * template JSON so the gate can measure real markup, real CSS and real JS.
 *
 * What it does NOT cover — state it whenever you report from it:
 *   - Shopify's header/footer/chat wrapper (the section strips those at runtime anyway)
 *   - CDN image transforms (placeholders render as the section's own placeholder block)
 *   - Anything the theme's global CSS does to our nodes
 * Live QC remains the authority. This is a pre-flight, not a substitute.
 *
 * Usage: node scripts/kryo-render-local.mjs <section.liquid> <template.json> <out.html> [assetsDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , sectionPath, templatePath, outPath, assetsDirArg] = process.argv;
if (!sectionPath || !templatePath || !outPath) {
  console.log('usage: kryo-render-local.mjs <section.liquid> <template.json> <out.html> [assetsDir]');
  process.exit(1);
}
const assetsDir = assetsDirArg || path.join(path.dirname(sectionPath), '..', 'assets');

const raw = fs.readFileSync(sectionPath, 'utf8');

// ---- schema: supplies defaults for every setting the template omits ----
const schemaSrc = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/.exec(raw);
if (!schemaSrc) throw new Error('no {% schema %}');
const schema = JSON.parse(schemaSrc[1]);
const defaults = (list) => Object.fromEntries(
  (list || []).filter((s) => s.id).map((s) => [s.id, s.default !== undefined ? s.default : ''])
);
const secDefaults = defaults(schema.settings);
const blockDefaults = Object.fromEntries((schema.blocks || []).map((b) => [b.type, defaults(b.settings)]));

const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const tplSection = Object.values(tpl.sections)[0];
const order = tplSection.block_order || Object.keys(tplSection.blocks || {});

const section = {
  settings: { ...secDefaults, ...(tplSection.settings || {}) },
  blocks: order.map((id) => {
    const b = tplSection.blocks[id];
    return {
      id, type: b.type,
      settings: { ...(blockDefaults[b.type] || {}), ...(b.settings || {}) },
      shopify_attributes: `data-shopify-editor-block='{"id":"${id}"}'`,
    };
  }),
};

// ---- the Liquid subset this section actually uses ----
// Optional: KRYO_IMG_MAP=/path/to/map.json  ->  { "shop-image-name": "./img/file.png" }
let IMG_MAP = {};
try { if (process.env.KRYO_IMG_MAP) IMG_MAP = JSON.parse(fs.readFileSync(process.env.KRYO_IMG_MAP, 'utf8')); } catch {}

const F = {
  escape: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  strip: (v) => String(v ?? '').trim(),
  default: (v, d) => (v === '' || v === null || v === undefined || v === false ? d : v),
  handleize: (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  split: (v, d) => String(v ?? '').split(d),
  size: (v) => (Array.isArray(v) ? v.length : String(v ?? '').length),
  asset_url: (v) => `./${path.basename(String(v))}`,
  stylesheet_tag: (v) => `<link rel="stylesheet" href="${v}">`,
  // `shopify://shop_images/name` cannot resolve offline. Map it to a real local file when one
  // is available (see IMG_MAP below) so the gate measures true image geometry rather than the
  // 0x0 box a broken <img> produces — which would silently pass the below-the-fold check.
  image_url: (v) => {
    const s = v ? String(v) : '';
    const m = /^shopify:\/\/shop_images\/(.+)$/.exec(s);
    if (!m) return s;
    // NO extensionless fallback. `shopify://shop_images/name` without a file extension does
    // not resolve on Shopify; matching it here hid 11 broken references on 2026-08-03.
    if (!/\.[a-z0-9]{2,5}$/i.test(m[1])) return '';
    const local = IMG_MAP[m[1]];
    if (!local) return '';
    return typeof local === 'string' ? local : local.url;
  },
  image_tag: (v, kw) => {
    const attr = Object.entries(kw || {})
      .filter(([k]) => k !== 'widths')
      .map(([k, x]) => `${k}="${F.escape(x)}"`).join(' ');
    return `<img src="${F.escape(v)}" ${attr}>`;
  },
  times: (v, n) => Number(v) * Number(n),
  plus: (v, n) => Number(v || 0) + Number(n),
  minus: (v, n) => Number(v || 0) - Number(n),
  append: (v, n) => String(v ?? '') + String(n ?? ''),
  truncate: (v, n, e) => { const s = String(v ?? ''); const len = Number(n) || 50;
    const ell = e === undefined ? '...' : String(e);
    return s.length <= len ? s : s.slice(0, Math.max(0, len - ell.length)) + ell; },
};

function resolve(expr, scope) {
  expr = expr.trim();
  if (expr === 'blank' || expr === 'empty') return '';
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  const q = /^'([^']*)'$|^"([^"]*)"$/.exec(expr);
  if (q) return q[1] !== undefined ? q[1] : q[2];
  let cur = scope;
  for (const part of expr.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    // A Shopify image_picker value is an image drop with .width/.height. Here it is a
    // string, so resolve intrinsic dimensions from the map — otherwise the local render
    // cannot verify that images reserve their space before loading.
    if (typeof cur === 'string' && (part === 'width' || part === 'height')) {
      const m = /^shopify:\/\/shop_images\/(.+)$/.exec(cur);
      if (!m) return undefined;
      const e = IMG_MAP[m[1]];
      return e && typeof e === 'object' ? e[part] : undefined;
    }
    cur = cur[part];
  }
  return cur;
}

/**
 * Split on `sep` only where it is OUTSIDE quotes.
 * Splitting naively made `split: ','` split on the quote character instead of the comma,
 * collapsing the 5 chapter names into 1 on 2026-08-02.
 */
function splitTop(s, sep) {
  const out = []; let buf = '', q = null;
  for (const c of s) {
    if (q) { buf += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; buf += c; continue; }
    if (c === sep) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);
  return out;
}
const splitPipes = (s) => splitTop(s, '|');

function applyFilters(parts, value, scope) {
  for (const p of parts) {
    const m = /^\s*([a-z_]+)\s*(?::([\s\S]*))?$/.exec(p);
    if (!m) continue;
    const [, name, argSrc] = m;
    if (!F[name]) continue;
    if (argSrc && /^[\s\S]*?[a-z_]+\s*:/.test(argSrc) && name === 'image_tag') {
      const kw = {};
      // keyword args: name: value, name: value
      let rest = argSrc, guard = 0;
      while (rest.trim() && guard++ < 20) {
        const km = /^\s*([a-z_]+)\s*:\s*/.exec(rest);
        if (!km) break;
        rest = rest.slice(km[0].length);
        let val = '', qc = null, i = 0;
        for (; i < rest.length; i++) {
          const c = rest[i];
          if (qc) { val += c; if (c === qc) qc = null; continue; }
          if (c === "'" || c === '"') { qc = c; val += c; continue; }
          if (c === ',') break;
          val += c;
        }
        rest = rest.slice(i + 1);
        kw[km[1]] = applyFilters(splitPipes(val).slice(1), resolve(splitPipes(val)[0], scope), scope);
      }
      value = F.image_tag(value, kw);
      continue;
    }
    const args = argSrc ? splitTop(argSrc, ',').map((a) => resolve(a, scope)) : [];
    value = F[name](value, ...args);
  }
  return value;
}

function evalExpr(src, scope) {
  const parts = splitPipes(src);
  return applyFilters(parts.slice(1), resolve(parts[0], scope), scope);
}

function truthy(src, scope) {
  src = src.trim();
  // `a and b` / `a or b`
  const bool = /^(.+?)\s+(and|or)\s+(.+)$/.exec(src);
  if (bool) {
    const l = truthy(bool[1], scope), r = truthy(bool[3], scope);
    return bool[2] === 'and' ? l && r : l || r;
  }
  // Numeric comparisons matter: `{% if quick_count > 0 %}` silently evaluated to false
  // without them, so an entire rendered block went missing while real Liquid was fine.
  const num = /^(.+?)\s*(>=|<=|>|<)\s*(.+)$/.exec(src);
  if (num) {
    const l = Number(evalExpr(num[1], scope)) || 0;
    const r = Number(evalExpr(num[3], scope)) || 0;
    return num[2] === '>' ? l > r : num[2] === '<' ? l < r : num[2] === '>=' ? l >= r : l <= r;
  }
  const cmp = /^(.+?)\s*(==|!=)\s*(.+)$/.exec(src);
  if (cmp) {
    const l = evalExpr(cmp[1], scope);
    const r = evalExpr(cmp[3], scope);
    const eq = (l === r) || (r === '' && (l === undefined || l === null || l === ''))
                          || (l === '' && (r === undefined || r === null || r === ''));
    return cmp[2] === '==' ? eq : !eq;
  }
  const v = evalExpr(src, scope);
  return !(v === undefined || v === null || v === false || v === '');
}

// ---- tokenise ----
const TOKEN = /\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g;
function tokenize(src) {
  const toks = []; let last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) toks.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] !== undefined) toks.push({ t: 'out', v: m[1].trim() });
    else toks.push({ t: 'tag', v: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < src.length) toks.push({ t: 'text', v: src.slice(last) });
  return toks;
}

const OPENERS = ['if', 'unless', 'case', 'for', 'style', 'comment', 'schema', 'capture', 'tablerow', 'form', 'paginate'];
const isEnd = (w) => w.startsWith('end');

/** Locate a block's separator tags and its matching end tag, respecting nesting. */
function branches(toks, start, sepWords, endWords) {
  const seps = [];
  let depth = 0;
  for (let k = start; k < toks.length; k++) {
    if (toks[k].t !== 'tag') continue;
    const w = toks[k].v.split(/\s+/)[0];
    if (OPENERS.includes(w)) { depth++; continue; }
    if (isEnd(w)) {
      if (depth === 0 && endWords.includes(w)) return { seps, end: k };
      depth--; continue;
    }
    if (depth === 0 && sepWords.includes(w)) seps.push({ at: k, word: w });
  }
  return { seps, end: toks.length };
}

let ROOT = null;
function render(toks, scope, from = 0, stopAt = null, until = null) {
  let out = '', i = from;
  while (i < toks.length && (until === null || i < until)) {
    const tk = toks[i];
    if (tk.t === 'text') { out += tk.v; i++; continue; }
    if (tk.t === 'out') { const v = evalExpr(tk.v, scope); out += v === undefined || v === null ? '' : String(v); i++; continue; }

    const tag = tk.v;
    const word = tag.split(/\s+/)[0];
    if (stopAt && stopAt.includes(word)) return { out, i };

    if (word === 'comment') { i = skipTo(toks, i + 1, 'comment'); continue; }
    if (word === 'schema') { i = skipTo(toks, i + 1, 'schema'); continue; }
    if (word === 'style') {
      const r = render(toks, scope, i + 1, ['endstyle']);
      out += `<style>${r.out}</style>`; i = r.i + 1; continue;
    }
    if (word === 'assign') {
      const m = /^assign\s+([a-z_0-9]+)\s*=\s*([\s\S]+)$/.exec(tag);
      // Liquid assigns into the template's global scope, so a counter inside a {% for %}
      // accumulates. Writing to the loop's child scope reset it every iteration and made
      // every numbered badge render as its initial value.
      if (m) ROOT[m[1]] = evalExpr(m[2], scope);
      i++; continue;
    }
    // Branches are LOCATED first and only the taken one is rendered. Rendering an untaken
    // branch and discarding its output would still run its {% assign %} side effects —
    // that bug made every step report data-locked="1" on 2026-08-02.
    if (word === 'if' || word === 'unless') {
      const { seps, end } = branches(toks, i + 1, ['elsif', 'else'], ['endif', 'endunless']);
      let cond = truthy(tag.slice(word.length), scope);
      if (word === 'unless') cond = !cond;
      let chosen = cond ? { from: i + 1, to: seps.length ? seps[0].at : end } : null;
      for (let s = 0; s < seps.length && !chosen; s++) {
        const sep = seps[s];
        const to = s + 1 < seps.length ? seps[s + 1].at : end;
        const w = sep.word;
        if (w === 'else' || truthy(toks[sep.at].v.slice(5), scope)) chosen = { from: sep.at + 1, to };
      }
      if (chosen) out += render(toks, scope, chosen.from, null, chosen.to).out;
      i = end + 1; continue;
    }
    if (word === 'case') {
      const subject = evalExpr(tag.slice(4), scope);
      const { seps, end } = branches(toks, i + 1, ['when', 'else'], ['endcase']);
      let chosen = null;
      for (let s = 0; s < seps.length && !chosen; s++) {
        const sep = seps[s];
        const to = s + 1 < seps.length ? seps[s + 1].at : end;
        const isElse = sep.word === 'else';
        if (isElse || String(evalExpr(toks[sep.at].v.slice(4), scope)) === String(subject))
          chosen = { from: sep.at + 1, to };
      }
      if (chosen) out += render(toks, scope, chosen.from, null, chosen.to).out;
      i = end + 1; continue;
    }
    if (word === 'for') {
      const m = /^for\s+([a-z_0-9]+)\s+in\s+([\s\S]+)$/.exec(tag);
      let list = [];
      if (m) {
        const range = /^\((.+?)\.\.(.+?)\)$/.exec(m[2].trim());
        if (range) {
          const a = Number(evalExpr(range[1], scope)), b2 = Number(evalExpr(range[2], scope));
          for (let v = a; v <= b2; v++) list.push(v);
        } else list = evalExpr(m[2], scope);
      }
      const arr = Array.isArray(list) ? list : [];
      const { end } = branches(toks, i + 1, [], ['endfor']);
      arr.forEach((item, n) => {
        const child = Object.create(scope);
        child[m[1]] = item;
        child.forloop = { index: n + 1, index0: n, first: n === 0, last: n === arr.length - 1, length: arr.length };
        out += render(toks, child, i + 1, null, end).out;
      });
      i = end + 1; continue;
    }
    i++; // unknown tag: ignore
  }
  return { out, i };
}

function skipTo(toks, i, endWord) {
  while (i < toks.length && !(toks[i].t === 'tag' && toks[i].v.startsWith('end' + endWord))) i++;
  return i + 1;
}

const scope = { section, settings: {} };
ROOT = scope;
const body = render(tokenize(raw), scope).out;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const cssTarget = path.join(path.dirname(outPath), 'kryo-owner.css');
fs.copyFileSync(path.join(assetsDir, 'kryo-owner.css'), cssTarget);

fs.writeFileSync(outPath, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KRYO Setup — local render</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif}</style>
</head><body><div id="shopify-section-kryo">${body}</div></body></html>
`);
console.log(`rendered ${outPath}  (${body.length} bytes, ${section.blocks.length} blocks)`);
