#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const API_VERSION = '2024-10';

export function parseArgs(argv = process.argv) {
  const args = {
    handle: 'kryo2_',
    manifest: path.join(repoRoot, 'config/qc-shopify-pages.json'),
    out: '',
    publicOnly: false,
    sourceOnly: false,
    timeoutMs: 45000,
    settleMs: 900,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--handle') args.handle = argv[++i];
    else if (arg === '--manifest') args.manifest = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--public-only') args.publicOnly = true;
    else if (arg === '--source-only') args.sourceOnly = true;
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (arg === '--settle-ms') args.settleMs = Number(argv[++i]);
    else if (arg === '--help') {
      console.log(`Usage: npm run qc:shopify-page -- --handle kryo2_ [--out artifacts/...]

Read-only public render gate for Shopify product pages.
Rejects preview/query URLs, fetches active template source, checks canonical desktop/mobile renders, blank gaps, hidden states, console errors, failed JS/CSS, product form, and Add to Cart presence.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.publicOnly && args.sourceOnly) throw new Error('--public-only and --source-only cannot be combined');
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

function briefJson(value, max = 600) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}


function hasDirectShopifyCreds() {
  return Boolean(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

function marketingBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
}

async function marketingGet(route) {
  await loadEnv();
  if (!process.env.MARKETING_SYNC_SECRET) throw new Error('MARKETING_SYNC_SECRET missing for marketing API fallback');
  const res = await fetch(`${marketingBaseUrl()}${route}`, {
    headers: { 'x-sync-secret': process.env.MARKETING_SYNC_SECRET },
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Marketing API ${route} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

async function shopifyToken() {
  await loadEnv();
  const store = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!store || !clientId || !clientSecret) throw new Error('Missing SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET');
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok || !data.access_token) throw new Error(`Shopify token failed ${res.status}: ${briefJson(data)}`);
  return { store, token: data.access_token };
}

async function shopifyRest(pathname, opts = {}) {
  const { store, token } = await shopifyToken();
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 45000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Shopify REST ${pathname} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

export function validateCanonicalUrl(urlText) {
  const url = new URL(urlText);
  const forbidden = [];
  if (url.search) forbidden.push('query string');
  if (url.hash) forbidden.push('hash');
  const text = `${url.search}${url.hash}`.toLowerCase();
  for (const bad of ['view=', 'preview_theme_id=', '_ab=', '_fd=', 'pb=']) {
    if (text.includes(bad)) forbidden.push(bad.replace('=', ''));
  }
  if (forbidden.length) throw new Error(`Non-canonical storefront URL rejected: ${urlText} (${[...new Set(forbidden)].join(', ')})`);
  return url.toString();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulText(text) {
  if (!text || text.length < 4 || text.length > 140) return false;
  if (/^(#|rgb\(|rgba\(|[\d.]+px|true|false|null|left|right|center|top|bottom|link|solid|outline|uppercase|lowercase|capitalize|none|auto)$/i.test(text)) return false;
  if (/^(https?:|shopify:\/\/|gid:\/\/|\/)/i.test(text)) return false;
  if (/^[\d\s.,:%$€£/-]+$/.test(text)) return false;
  return /[A-Za-z]/.test(text);
}

function settingTextCandidates(value, keyPath = []) {
  const out = [];
  const key = keyPath[keyPath.length - 1] || '';
  if (typeof value === 'string') {
    const text = stripHtml(value);
    if (/color|alignment|align|weight|font|transform|spacing|size|url|image|width|height|opacity|layout|style|position|border|radius|padding|margin|gap|link|icon|shadow|gradient|background/i.test(key)) return out;
    if (isUsefulText(text)) {
      const keyScore = /heading|title|subheading|eyebrow|question|quote|body|copy/i.test(key) ? 10 : /button|label|cta/i.test(key) ? 3 : 0;
      const lengthScore = text.length <= 70 ? 4 : 1;
      out.push({ text, key: keyPath.join('.'), score: keyScore + lengthScore });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, idx) => out.push(...settingTextCandidates(item, [...keyPath, String(idx)])));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) out.push(...settingTextCandidates(v, [...keyPath, k]));
  }
  return out;
}

export function deriveMarkersFromTemplate(templateJson, pageConfig = {}) {
  const sectionId = pageConfig.sectionId;
  const section = sectionId ? templateJson.sections?.[sectionId] : Object.values(templateJson.sections || {}).find((s) => s?.type === '_blocks' && s.blocks);
  if (!section?.blocks) return [];
  const order = Array.isArray(section.block_order) ? section.block_order : Object.keys(section.blocks);
  const markers = [];
  for (const blockId of order) {
    const block = section.blocks[blockId];
    if (!block || block.disabled) continue;
    const candidates = settingTextCandidates(block.settings || {})
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length);
    if (!candidates.length) continue;
    const chosen = candidates[0];
    markers.push({ id: `template_${markers.length + 1}`, blockId, text: chosen.text, source: 'template', key: chosen.key });
  }
  if (markers.length <= 3) return markers;
  const mid = Math.floor(markers.length / 2);
  const picked = [markers[0], markers[mid], markers[markers.length - 1]];
  return picked.map((m, i) => ({ ...m, id: ['template_first', 'template_middle', 'template_last'][i] }));
}

export function mergeMarkers(manifestMarkers = [], derivedMarkers = []) {
  const seen = new Set();
  const out = [];
  for (const marker of [...manifestMarkers, ...derivedMarkers]) {
    const text = stripHtml(marker.text);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...marker, text });
  }
  return out;
}

export function computeEmptyGaps(intervals, docHeight, headerPx = 0) {
  const normalized = intervals
    .filter((i) => Number.isFinite(i.top) && Number.isFinite(i.bottom) && i.bottom > i.top)
    .map((i) => ({ top: Math.max(headerPx, Math.round(i.top)), bottom: Math.min(Math.round(docHeight), Math.round(i.bottom)) }))
    .filter((i) => i.bottom > i.top)
    .sort((a, b) => a.top - b.top);
  const merged = [];
  for (const interval of normalized) {
    const last = merged[merged.length - 1];
    if (!last || interval.top > last.bottom + 24) merged.push({ ...interval });
    else last.bottom = Math.max(last.bottom, interval.bottom);
  }
  const gaps = [];
  let cursor = headerPx;
  for (const interval of merged) {
    if (interval.top > cursor) gaps.push({ top: cursor, bottom: interval.top, height: interval.top - cursor });
    cursor = Math.max(cursor, interval.bottom);
  }
  if (docHeight > cursor) gaps.push({ top: cursor, bottom: docHeight, height: docHeight - cursor });
  return gaps.sort((a, b) => b.height - a.height);
}

async function fetchActiveTemplate(handle) {
  await loadEnv();
  if (hasDirectShopifyCreds()) {
    const products = await shopifyRest(`/products.json?handle=${encodeURIComponent(handle)}&fields=id,handle,title,template_suffix,variants`);
    const product = products.products?.[0];
    if (!product) throw new Error(`Shopify product not found for handle ${handle}`);
    const themes = await shopifyRest('/themes.json?fields=id,name,role');
    const liveTheme = themes.themes?.find((theme) => theme.role === 'main');
    if (!liveTheme) throw new Error('Live Shopify theme not found');
    const templateKey = product.template_suffix ? `templates/product.${product.template_suffix}.json` : 'templates/product.json';
    const asset = await shopifyRest(`/themes/${liveTheme.id}/assets.json?asset[key]=${encodeURIComponent(templateKey)}`);
    const value = asset.asset?.value || '';
    if (!value) throw new Error(`Template asset empty: ${templateKey}`);
    let templateJson;
    try { templateJson = JSON.parse(value); } catch (err) { throw new Error(`Template JSON invalid: ${err.message}`); }
    return { product, liveTheme, templateKey, templateText: value, templateJson, sourceMethod: 'direct_shopify_admin' };
  }

  const product = await marketingGet(`/api/marketing/shopify/get-product?handle=${encodeURIComponent(handle)}`);
  const themeInfo = await marketingGet('/api/marketing/theme/info');
  const templateKey = product.template_filename || (product.template_suffix ? `templates/product.${product.template_suffix}.json` : 'templates/product.json');
  const asset = await marketingGet(`/api/marketing/theme/asset?key=${encodeURIComponent(templateKey)}`);
  const value = asset.value || '';
  if (!value) throw new Error(`Template asset empty from marketing API: ${templateKey}`);
  let templateJson;
  try { templateJson = JSON.parse(value); } catch (err) { throw new Error(`Template JSON invalid: ${err.message}`); }
  return {
    product,
    liveTheme: themeInfo.live_theme,
    templateKey,
    templateText: value,
    templateJson,
    sourceMethod: 'marketing_api_read_only',
  };
}

async function readManifest(filePath, handle) {
  const raw = await fs.readFile(filePath, 'utf8');
  const manifest = JSON.parse(raw);
  const pageConfig = manifest.pages?.[handle];
  if (!pageConfig) throw new Error(`No page config for handle ${handle} in ${filePath}`);
  return pageConfig;
}

function publicEvaluate(input) {
  const { markers, selectors } = input;
  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
  };
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const findTextElement = (text) => {
    const needle = normalize(text).toLowerCase();
    const all = Array.from(document.body.querySelectorAll('body *'));
    let best = null;
    for (const el of all) {
      if (!visible(el)) continue;
      const own = normalize(el.textContent);
      if (!own || !own.toLowerCase().includes(needle)) continue;
      const rect = el.getBoundingClientRect();
      if (!best || own.length < best.textLength) best = { tag: el.tagName.toLowerCase(), id: el.id || null, className: String(el.className || '').slice(0, 120), top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height), textLength: own.length };
    }
    return best;
  };
  const markerResults = markers.map((marker) => {
    const element = findTextElement(marker.text);
    return { ...marker, presentInBodyText: normalize(document.body.innerText).includes(marker.text), visible: Boolean(element), element };
  });
  const findVisibleSelector = (items) => {
    for (const selector of items) {
      try {
        const found = Array.from(document.querySelectorAll(selector)).find(visible);
        if (found) {
          const rect = found.getBoundingClientRect();
          return { selector, tag: found.tagName.toLowerCase(), text: normalize(found.textContent).slice(0, 120), top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height) };
        }
      } catch {}
    }
    return null;
  };
  const intervals = [];
  const hiddenLarge = [];
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  let viewportTextChars = 0;
  let viewportMediaCount = 0;
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const absTop = rect.top + window.scrollY;
    const absBottom = absTop + rect.height;
    const style = getComputedStyle(el);
    const text = normalize(el.innerText || (el.getAttribute('alt') || '')).slice(0, 500);
    const hasMedia = ['IMG', 'VIDEO', 'PICTURE', 'SVG', 'CANVAS', 'IFRAME'].includes(el.tagName) || style.backgroundImage !== 'none';
    const hasAction = ['A', 'BUTTON', 'FORM'].includes(el.tagName) || el.tagName.includes('-');
    const isHidden = style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.05;
    const meaningful = text.length > 0 || hasMedia || hasAction;
    if (isHidden && rect.width > window.innerWidth * 0.5 && rect.height > 80 && meaningful) {
      hiddenLarge.push({ tag: el.tagName.toLowerCase(), id: el.id || null, className: String(el.className || '').slice(0, 120), top: Math.round(absTop), height: Math.round(rect.height), display: style.display, visibility: style.visibility, opacity: style.opacity, text: text.slice(0, 80) });
    }
    if (!isHidden && meaningful) {
      intervals.push({ top: absTop, bottom: absBottom });
      if (absBottom >= viewportTop && absTop <= viewportBottom) {
        viewportTextChars += text.length;
        if (hasMedia) viewportMediaCount += 1;
      }
    }
  }
  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight, scrollY: Math.round(window.scrollY) },
    documentHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    bodyTextLength: normalize(document.body.innerText).length,
    markerResults,
    productForm: findVisibleSelector(selectors.productFormSelectors || []),
    addToCart: findVisibleSelector(selectors.addToCartSelectors || []),
    hiddenLarge: hiddenLarge.slice(0, 25),
    intervals: intervals.map((i) => ({ top: Math.round(i.top), bottom: Math.round(i.bottom) })),
    viewportSignal: { textChars: viewportTextChars, mediaCount: viewportMediaCount },
  };
}


async function fetchCanonicalDocument(url, userAgent) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(30000),
      });
      const body = await res.text();
      return {
        status: res.status,
        ok: res.ok,
        finalUrl: res.url,
        body,
        attempts: attempt,
        headers: {
          'content-type': res.headers.get('content-type') || 'text/html; charset=utf-8',
        },
      };
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  return {
    status: 0,
    ok: false,
    finalUrl: url,
    body: '',
    attempts: 3,
    error: lastError?.message || String(lastError),
    headers: { 'content-type': 'text/html; charset=utf-8' },
  };
}

async function inspectViewport(page, scrollY, markers, selectors) {
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.waitForTimeout(350);
  return page.evaluate(publicEvaluate, { markers, selectors });
}

async function inspectRender(browser, name, device, pageConfig, markers, outDir, args) {
  const { isMobile = false, ...viewport } = device;
  const userAgent = name === 'mobile'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const context = await browser.newContext({
    viewport,
    isMobile,
    userAgent,
    locale: 'en-US',
    extraHTTPHeaders: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
    },
    ignoreHTTPSErrors: false,
    bypassCSP: false,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedAssets = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ type: msg.type(), text: msg.text().slice(0, 500), location: msg.location() });
  });
  page.on('pageerror', (err) => pageErrors.push({ message: err.message, stack: String(err.stack || '').slice(0, 1200) }));
  page.on('requestfailed', (req) => {
    if (['script', 'stylesheet'].includes(req.resourceType())) failedAssets.push({ url: req.url(), resourceType: req.resourceType(), failure: req.failure()?.errorText || 'unknown' });
  });
  page.on('response', (res) => {
    if (['script', 'stylesheet'].includes(res.request().resourceType()) && res.status() >= 400) failedAssets.push({ url: res.url(), resourceType: res.request().resourceType(), status: res.status() });
  });

  const mainDocument = await fetchCanonicalDocument(pageConfig.canonicalUrl, userAgent);
  let fulfilledMainDocument = false;
  if (mainDocument.ok && mainDocument.finalUrl === pageConfig.canonicalUrl) {
    await page.route(pageConfig.canonicalUrl, async (route) => {
      if (!fulfilledMainDocument) {
        fulfilledMainDocument = true;
        await route.fulfill({ status: mainDocument.status, headers: mainDocument.headers, body: mainDocument.body });
      } else {
        await route.continue();
      }
    });
  }
  const response = await page.goto(pageConfig.canonicalUrl, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
  await page.waitForLoadState('load', { timeout: args.timeoutMs }).catch(() => null);
  await page.waitForTimeout(args.settleMs);
  const first = await page.evaluate(publicEvaluate, { markers, selectors: pageConfig });
  const docHeight = first.documentHeight;
  const checkpoints = [...new Set([0, Math.round(docHeight * 0.25), Math.round(docHeight * 0.5), Math.round(docHeight * 0.75), Math.max(0, docHeight - viewport.height)])]
    .filter((y) => y >= 0 && y <= docHeight);
  const checkpointReports = [];
  for (const y of checkpoints) checkpointReports.push(await inspectViewport(page, y, markers, pageConfig));

  const screenshotPoints = [0, Math.round(docHeight * 0.5), Math.max(0, docHeight - viewport.height)];
  const screenshots = [];
  for (let i = 0; i < screenshotPoints.length; i += 1) {
    const y = screenshotPoints[i];
    await page.evaluate((targetY) => window.scrollTo(0, targetY), y);
    await page.waitForTimeout(250);
    const screenshotPath = path.join(outDir, `${name}-${i === 0 ? 'top' : i === 1 ? 'middle' : 'bottom'}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    screenshots.push(screenshotPath);
  }

  const intervals = checkpointReports.flatMap((r) => r.intervals || []);
  const gaps = computeEmptyGaps(intervals, docHeight, 0);
  const maxEmptyGapPx = pageConfig.maxEmptyGapPx?.[name] ?? (name === 'mobile' ? 1900 : 1500);
  const blankCheckpoints = checkpointReports
    .filter((r) => r.viewport.scrollY > viewport.height * 0.75 && r.viewportSignal.textChars < 30 && r.viewportSignal.mediaCount === 0)
    .map((r) => ({ scrollY: r.viewport.scrollY, signal: r.viewportSignal }));

  const markerResults = checkpointReports.reduce((acc, report) => {
    for (const marker of report.markerResults || []) {
      const existing = acc.get(marker.id);
      if (!existing || marker.visible) acc.set(marker.id, marker);
    }
    return acc;
  }, new Map());
  const missingMarkers = [...markerResults.values()].filter((m) => !m.visible).map((m) => ({ id: m.id, text: m.text, source: m.source, blockId: m.blockId || null }));
  const productForm = checkpointReports.find((r) => r.productForm)?.productForm || null;
  const addToCart = checkpointReports.find((r) => r.addToCart)?.addToCart || null;
  const hiddenLarge = checkpointReports.flatMap((r) => r.hiddenLarge || []).slice(0, 40);
  const consoleWarningAllowlist = pageConfig.consoleWarningAllowlist || [];
  const fatalConsoleErrors = consoleErrors.filter((error) => {
    const text = `${error.text || ''} ${error.location?.url || ''}`;
    if (consoleWarningAllowlist.some((pattern) => text.includes(pattern))) return false;
    if (/\b(Uncaught|TypeError|ReferenceError|SyntaxError|Liquid error|Section Rendering API)\b/i.test(text)) return true;
    return !/^Failed to load resource:/i.test(error.text || '');
  });
  const consoleWarnings = consoleErrors.filter((error) => !fatalConsoleErrors.includes(error));
  const failures = [];
  if (!mainDocument.ok) failures.push({ code: 'public_document_fetch_failed', message: `Canonical document fetch HTTP ${mainDocument.status}` });
  if (mainDocument.finalUrl !== pageConfig.canonicalUrl) failures.push({ code: 'canonical_fetch_redirect_or_variant', message: `Canonical fetch loaded ${mainDocument.finalUrl} instead of ${pageConfig.canonicalUrl}` });
  if (!response || !response.ok()) failures.push({ code: 'public_http_failed', message: `HTTP ${response?.status() || 'no response'}` });
  if (new URL(page.url()).href !== pageConfig.canonicalUrl) failures.push({ code: 'canonical_redirect_or_variant', message: `Loaded ${page.url()} instead of ${pageConfig.canonicalUrl}` });
  if (missingMarkers.length) failures.push({ code: 'required_marker_missing', message: `${missingMarkers.length} required marker(s) not visible`, evidence: missingMarkers });
  if (!productForm) failures.push({ code: 'product_form_missing', message: 'No visible product form found' });
  if (!addToCart) failures.push({ code: 'add_to_cart_missing', message: 'No visible Add to Cart button found' });
  if (gaps[0]?.height > maxEmptyGapPx) failures.push({ code: 'large_empty_gap', message: `Largest content gap ${gaps[0].height}px exceeds ${maxEmptyGapPx}px`, evidence: gaps[0] });
  if (blankCheckpoints.length) failures.push({ code: 'blank_viewport_after_scroll', message: `${blankCheckpoints.length} blank checkpoint(s) after scroll`, evidence: blankCheckpoints });
  if (pageErrors.length) failures.push({ code: 'page_error', message: `${pageErrors.length} page error(s)`, evidence: pageErrors.slice(0, 5) });
  if (fatalConsoleErrors.length) failures.push({ code: 'fatal_console_error', message: `${fatalConsoleErrors.length} fatal console error(s)`, evidence: fatalConsoleErrors.slice(0, 5) });
  if (failedAssets.length) failures.push({ code: 'failed_js_css_request', message: `${failedAssets.length} failed JS/CSS request(s)`, evidence: failedAssets.slice(0, 8) });

  await context.close();
  return {
    name,
    viewport,
    status: failures.length ? 'FAIL' : 'PASS',
    httpStatus: response?.status() || null,
    finalUrl: page.url(),
    mainDocument,
    documentHeight: docHeight,
    markers: [...markerResults.values()].map(({ intervals: _i, ...marker }) => marker),
    productForm,
    addToCart,
    largestEmptyGap: gaps[0] || null,
    blankCheckpoints,
    hiddenLarge,
    consoleErrors,
    consoleWarnings,
    fatalConsoleErrors,
    pageErrors,
    failedAssets,
    screenshots,
    failures,
  };
}

export async function runQc(args = parseArgs()) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.out || `artifacts/shopify-page-qc/${stamp}-${args.handle}`);
  await fs.mkdir(outDir, { recursive: true });

  const pageConfig = await readManifest(args.manifest, args.handle);
  pageConfig.canonicalUrl = validateCanonicalUrl(pageConfig.canonicalUrl);

  let source = null;
  let derivedMarkers = [];
  if (!args.publicOnly) {
    source = await fetchActiveTemplate(args.handle);
    const backupPath = path.join(outDir, source.templateKey.replace(/[^a-z0-9_.-]+/gi, '_'));
    await fs.writeFile(backupPath, source.templateText);
    source.backupPath = backupPath;
    derivedMarkers = deriveMarkersFromTemplate(source.templateJson, pageConfig);
  }

  const markers = mergeMarkers(pageConfig.requiredMarkers || [], derivedMarkers);
  const report = {
    generatedAt: new Date().toISOString(),
    mutationPerformed: false,
    handle: args.handle,
    canonicalUrl: pageConfig.canonicalUrl,
    status: 'PASS',
    source: source ? {
      productId: source.product.id,
      productHandle: source.product.handle,
      productTitle: source.product.title,
      templateSuffix: source.product.template_suffix || null,
      templateKey: source.templateKey,
      liveThemeId: source.liveTheme.id,
      liveThemeName: source.liveTheme.name,
      sectionId: pageConfig.sectionId,
      sectionBlockCount: source.templateJson.sections?.[pageConfig.sectionId]?.blocks ? Object.keys(source.templateJson.sections[pageConfig.sectionId].blocks).length : null,
      sectionBlockOrderCount: source.templateJson.sections?.[pageConfig.sectionId]?.block_order?.length ?? null,
      backupPath: source.backupPath,
      sourceMethod: source.sourceMethod,
    } : { skipped: true },
    markers,
    renders: [],
    failures: [],
    screenshots: [],
  };

  if (!args.sourceOnly) {
    const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
    try {
      report.renders.push(await inspectRender(browser, 'desktop', { width: 1440, height: 1000 }, pageConfig, markers, outDir, args));
      report.renders.push(await inspectRender(browser, 'mobile', { width: 390, height: 844, isMobile: true }, pageConfig, markers, outDir, args));
    } finally {
      await browser.close();
    }
    report.screenshots = report.renders.flatMap((r) => r.screenshots);
    for (const render of report.renders) {
      for (const failure of render.failures) report.failures.push({ viewport: render.name, ...failure });
    }
  }

  report.status = report.failures.length ? 'FAIL' : 'PASS';
  const jsonPath = path.join(outDir, 'shopify-page-qc.json');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.mkdir(path.join(repoRoot, 'artifacts/shopify-page-qc/latest'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'artifacts/shopify-page-qc/latest/shopify-page-qc.json'), JSON.stringify(report, null, 2));

  const md = [];
  md.push('# Shopify page QC');
  md.push('');
  md.push(`Status: ${report.status}`);
  md.push(`Handle: ${report.handle}`);
  md.push(`Canonical URL: ${report.canonicalUrl}`);
  md.push(`Mutation performed: ${report.mutationPerformed ? 'yes' : 'no'}`);
  if (report.source && !report.source.skipped) {
    md.push(`Template: ${report.source.templateKey}`);
    md.push(`blocks_dijJNt blocks/order: ${report.source.sectionBlockCount}/${report.source.sectionBlockOrderCount}`);
    md.push(`Read-only source backup: ${report.source.backupPath}`);
  }
  md.push('');
  md.push('## Render results');
  for (const render of report.renders) {
    md.push(`- ${render.name}: ${render.status}; height ${render.documentHeight}px; largest gap ${render.largestEmptyGap?.height ?? 0}px; fatal console errors ${render.fatalConsoleErrors?.length ?? render.consoleErrors.length}; console warnings ${render.consoleWarnings?.length ?? 0}; page errors ${render.pageErrors.length}; failed JS/CSS ${render.failedAssets.length}`);
  }
  if (report.failures.length) {
    md.push('');
    md.push('## Failures');
    for (const failure of report.failures) md.push(`- ${failure.viewport}: ${failure.code} — ${failure.message}`);
  }
  md.push('');
  md.push(`JSON: ${jsonPath}`);
  await fs.writeFile(path.join(outDir, 'shopify-page-qc.md'), `${md.join('\n')}\n`);

  console.log(`SHOPIFY_PAGE_QC ${report.status}`);
  console.log(`handle=${report.handle}`);
  console.log(`canonical=${report.canonicalUrl}`);
  if (report.source && !report.source.skipped) console.log(`template=${report.source.templateKey} blocks=${report.source.sectionBlockCount} order=${report.source.sectionBlockOrderCount}`);
  for (const render of report.renders) console.log(`${render.name}: ${render.status} height=${render.documentHeight} largestGap=${render.largestEmptyGap?.height ?? 0} fatalConsoleErrors=${render.fatalConsoleErrors?.length ?? render.consoleErrors.length} consoleWarnings=${render.consoleWarnings?.length ?? 0} pageErrors=${render.pageErrors.length} failedJsCss=${render.failedAssets.length}`);
  if (report.failures.length) {
    console.log('failures:');
    for (const failure of report.failures.slice(0, 8)) console.log(`- ${failure.viewport}: ${failure.code}: ${failure.message}`);
  }
  console.log(`report=${jsonPath}`);
  return { report, jsonPath, outDir };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runQc().then(({ report }) => {
    process.exit(report.status === 'PASS' ? 0 : 1);
  }).catch((err) => {
    console.error(`SHOPIFY_PAGE_QC ERROR: ${err.message}`);
    process.exit(2);
  });
}
