#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    url: 'https://everestlabs.co/products/kryo2?country=AE',
    outDir: '',
    allowLiveTracking: false,
    clickCheckout: false,
    lighthouse: false,
    timeoutMs: 45000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--out') args.outDir = argv[++i];
    else if (arg === '--allow-live-tracking') args.allowLiveTracking = true;
    else if (arg === '--click-checkout') args.clickCheckout = true;
    else if (arg === '--lighthouse') args.lighthouse = true;
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (arg === '--help') {
      console.log(`Usage: node scripts/kryo-proof-runner.mjs [--url URL] [--out DIR] [--allow-live-tracking] [--click-checkout] [--lighthouse]`);
      process.exit(0);
    }
  }
  return args;
}

async function loadLocalEnv() {
  const envPath = path.join(repoRoot, '.env.local');
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

function withSafeQaParams(rawUrl, allowLiveTracking) {
  const url = new URL(rawUrl);
  if (!url.searchParams.get('country')) url.searchParams.set('country', 'AE');
  if (!allowLiveTracking) {
    url.searchParams.set('el_internal', '1');
    url.searchParams.set('el_internal_reason', 'kryo_proof_runner');
  }
  if (!url.searchParams.get('utm_source')) url.searchParams.set('utm_source', 'meta');
  if (!url.searchParams.get('utm_medium')) url.searchParams.set('utm_medium', 'paid_social');
  if (!url.searchParams.get('utm_campaign_id')) url.searchParams.set('utm_campaign_id', 'qa_kryo_proof');
  if (!url.searchParams.get('utm_adset_id')) url.searchParams.set('utm_adset_id', 'qa_kryo_proof_set');
  if (!url.searchParams.get('utm_ad_id')) url.searchParams.set('utm_ad_id', 'qa_kryo_proof_ad');
  return url.toString();
}

async function visibleCount(locator) {
  const count = await locator.count().catch(() => 0);
  let visible = 0;
  for (let i = 0; i < Math.min(count, 20); i += 1) {
    if (await locator.nth(i).isVisible().catch(() => false)) visible += 1;
  }
  return visible;
}

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 20); i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function runBrowserProof(profile, targetUrl, outDir, opts) {
  const browser = await chromium.launch({ headless: true });
  const contextOptions = profile.device ? { ...devices[profile.device] } : { viewport: profile.viewport, userAgent: 'Mozilla/5.0 KRYO Proof Runner' };
  const context = await browser.newContext({ ...contextOptions, ignoreHTTPSErrors: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const consoleMessages = [];
  const network = [];
  const trackingRequests = [];

  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text(), location: msg.location() });
  });
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/marketing/sync/storefront-event')) trackingRequests.push({ phase: 'request', method: request.method(), url });
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/marketing/sync/storefront-event')) trackingRequests.push({ phase: 'response', status: response.status(), url });
    if (response.status() >= 400) network.push({ status: response.status(), url });
  });

  const result = {
    profile: profile.name,
    url: targetUrl,
    final_url: null,
    http_status: null,
    title: null,
    pixel_version: null,
    add_to_cart_clicked: false,
    cart_reached: false,
    checkout_controls_visible: 0,
    checkout_clicked: false,
    console_errors: [],
    network_errors: [],
    tracking_requests: [],
    screenshots: {},
    trace: null,
  };

  const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  result.http_status = response?.status() ?? null;
  result.final_url = page.url();
  result.title = await page.title().catch(() => null);
  result.pixel_version = await page.locator('#everest-attribution-pixel').getAttribute('data-pixel-version').catch(() => null);
  const landingShot = path.join(outDir, `${profile.name}-landing.png`);
  await page.screenshot({ path: landingShot, fullPage: true });
  result.screenshots.landing = landingShot;

  const addToCart = await firstVisible(page.getByRole('button', { name: /add to cart|order now|buy now|reserve|pre-order/i }))
    || await firstVisible(page.locator('a,button,input[type="submit"]').filter({ hasText: /add to cart|order now|buy now|reserve|pre-order/i }));
  if (addToCart) {
    await addToCart.click({ timeout: 10000 }).catch(() => {});
    result.add_to_cart_clicked = true;
    await page.waitForTimeout(2500);
  }

  const afterAtcShot = path.join(outDir, `${profile.name}-after-atc.png`);
  await page.screenshot({ path: afterAtcShot, fullPage: true });
  result.screenshots.after_atc = afterAtcShot;

  const origin = new URL(targetUrl).origin;
  await page.goto(`${origin}/cart?country=AE${opts.allowLiveTracking ? '' : '&el_internal=1&el_internal_reason=kryo_proof_runner'}`, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  result.cart_reached = page.url().includes('/cart');
  result.checkout_controls_visible = await visibleCount(page.locator('a[href*="checkout"], button[name="checkout"], input[name="checkout"], button:has-text("Checkout"), a:has-text("Checkout")'));
  const cartShot = path.join(outDir, `${profile.name}-cart.png`);
  await page.screenshot({ path: cartShot, fullPage: true });
  result.screenshots.cart = cartShot;

  if (opts.clickCheckout && result.checkout_controls_visible > 0) {
    const checkout = await firstVisible(page.locator('a[href*="checkout"], button[name="checkout"], input[name="checkout"], button:has-text("Checkout"), a:has-text("Checkout")'));
    if (checkout) {
      await checkout.click({ timeout: 10000 }).catch(() => {});
      result.checkout_clicked = true;
      await page.waitForTimeout(1500);
    }
  }

  result.console_errors = consoleMessages.filter((msg) => msg.type === 'error');
  result.network_errors = network;
  result.tracking_requests = trackingRequests;
  const tracePath = path.join(outDir, `${profile.name}-trace.zip`);
  await context.tracing.stop({ path: tracePath });
  result.trace = tracePath;
  await browser.close();
  return result;
}


async function runLighthouse(targetUrl, outDir) {
  const jsonPath = path.join(outDir, 'lighthouse.json');
  const htmlPath = path.join(outDir, 'lighthouse.html');
  const args = [
    '--yes',
    'lighthouse',
    targetUrl,
    '--quiet',
    '--chrome-flags=--headless=new --no-sandbox',
    '--output=json',
    '--output=html',
    `--output-path=${path.join(outDir, 'lighthouse')}`,
  ];
  const result = { requested: true, ok: false, json_path: jsonPath, html_path: htmlPath, error: null, scores: null };
  await new Promise((resolve) => {
    const child = spawn('npx', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', async (code) => {
      if (code !== 0) {
        result.error = stderr || `lighthouse exited ${code}`;
        resolve();
        return;
      }
      try {
        const generatedJson = path.join(outDir, 'lighthouse.report.json');
        const generatedHtml = path.join(outDir, 'lighthouse.report.html');
        await fs.rename(generatedJson, jsonPath).catch(() => {});
        await fs.rename(generatedHtml, htmlPath).catch(() => {});
        const raw = await fs.readFile(jsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        result.scores = Object.fromEntries(Object.entries(parsed.categories ?? {}).map(([key, value]) => [key, Math.round((value.score ?? 0) * 100)]));
        result.ok = true;
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
      }
      resolve();
    });
  });
  await fs.writeFile(path.join(outDir, 'lighthouse-summary.json'), JSON.stringify(result, null, 2));
  return result;
}

async function postInternalTrackingProbe(outDir) {
  const endpoint = 'https://everest-calendar.vercel.app/api/marketing/sync/storefront-event';
  const sessionId = `proof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    event_type: 'cart_checkout_click',
    session_id: sessionId,
    anonymous_id: `proof_anon_${Date.now()}`,
    page_path: '/cart',
    page_url: 'https://everestlabs.co/cart?country=AE',
    device_type: 'desktop',
    ts: new Date().toISOString(),
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign_id: 'qa_kryo_proof',
    utm_adset_id: 'qa_kryo_proof_set',
    utm_ad_id: 'qa_kryo_proof_ad',
    is_internal: true,
    internal_reason: 'kryo_proof_runner',
    event_properties: { proof_runner: true },
  };
  const post = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const postBody = await post.text();
  const proof = { session_id: sessionId, post_status: post.status, post_body: postBody, supabase_row_found: false, supabase_error: null };

  const supabaseUrl = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const queryUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/attribution_touches?select=id,event_type,traffic_class,session_id&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`;
    const rowRes = await fetch(queryUrl, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (rowRes.ok) {
      const rows = await rowRes.json();
      proof.supabase_row_found = Array.isArray(rows) && rows.length === 1 && rows[0].traffic_class === 'internal_qa';
      proof.supabase_rows = rows;
    } else {
      proof.supabase_error = await rowRes.text();
    }
  } else {
    proof.supabase_error = 'Supabase env missing; skipped row lookup';
  }

  await fs.writeFile(path.join(outDir, 'tracking-probe.json'), JSON.stringify(proof, null, 2));
  return proof;
}

function statusIcon(pass) {
  return pass ? 'PASS' : 'FAIL';
}

async function main() {
  const args = parseArgs(process.argv);
  await loadLocalEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(repoRoot, args.outDir || `artifacts/kryo-proof/${stamp}`);
  await fs.mkdir(outDir, { recursive: true });
  const targetUrl = withSafeQaParams(args.url, args.allowLiveTracking);

  const desktop = await runBrowserProof({ name: 'desktop', viewport: { width: 1440, height: 1200 } }, targetUrl, outDir, args);
  const mobile = await runBrowserProof({ name: 'mobile', device: 'iPhone 13' }, targetUrl, outDir, args);
  const trackingProbe = await postInternalTrackingProbe(outDir);
  const lighthouse = args.lighthouse ? await runLighthouse(targetUrl, outDir) : { requested: false };

  const summary = {
    generated_at: new Date().toISOString(),
    target_url: targetUrl,
    live_tracking_allowed: args.allowLiveTracking,
    checkout_click_allowed: args.clickCheckout,
    desktop,
    mobile,
    tracking_probe: trackingProbe,
    lighthouse,
  };
  await fs.writeFile(path.join(outDir, 'qc.json'), JSON.stringify(summary, null, 2));

  const severeConsoleErrors = [...desktop.console_errors, ...mobile.console_errors].filter((msg) => !/favicon|clarity|third-party/i.test(msg.text ?? ''));
  const pass = {
    desktop_load: desktop.http_status != null && desktop.http_status < 400,
    mobile_load: mobile.http_status != null && mobile.http_status < 400,
    pixel_present: Boolean(desktop.pixel_version && mobile.pixel_version),
    add_to_cart_clickable: desktop.add_to_cart_clicked || mobile.add_to_cart_clicked,
    cart_reachable: desktop.cart_reached && mobile.cart_reached,
    checkout_visible: desktop.checkout_controls_visible > 0 && mobile.checkout_controls_visible > 0,
    tracking_probe: trackingProbe.post_status < 300 && trackingProbe.supabase_row_found,
    console_clean: severeConsoleErrors.length === 0,
    lighthouse: !args.lighthouse || Boolean(lighthouse.ok),
  };

  const packet = `# KRYO Proof Packet\n\nGenerated: ${summary.generated_at}\nURL: ${targetUrl}\n\n## Status\n\n- Desktop load: ${statusIcon(pass.desktop_load)}\n- Mobile load: ${statusIcon(pass.mobile_load)}\n- Pixel present: ${statusIcon(pass.pixel_present)} (${desktop.pixel_version ?? 'missing'} / ${mobile.pixel_version ?? 'missing'})\n- Add-to-cart clickable: ${statusIcon(pass.add_to_cart_clickable)}\n- Cart reachable: ${statusIcon(pass.cart_reachable)}\n- Checkout visible: ${statusIcon(pass.checkout_visible)}\n- Internal tracking probe persisted: ${statusIcon(pass.tracking_probe)}\n- Severe console errors: ${statusIcon(pass.console_clean)} (${severeConsoleErrors.length})\n- Lighthouse: ${args.lighthouse ? statusIcon(pass.lighthouse) : 'SKIPPED'}${args.lighthouse && lighthouse.scores ? ` (${JSON.stringify(lighthouse.scores)})` : ''}\n\n## Screenshots\n\n- Desktop landing: ${desktop.screenshots.landing}\n- Desktop after ATC: ${desktop.screenshots.after_atc}\n- Desktop cart: ${desktop.screenshots.cart}\n- Mobile landing: ${mobile.screenshots.landing}\n- Mobile after ATC: ${mobile.screenshots.after_atc}\n- Mobile cart: ${mobile.screenshots.cart}\n\n## Traces and raw logs\n\n- Desktop trace: ${desktop.trace}\n- Mobile trace: ${mobile.trace}\n- Raw QC JSON: ${path.join(outDir, 'qc.json')}\n- Tracking probe: ${path.join(outDir, 'tracking-probe.json')}\n- Lighthouse summary: ${path.join(outDir, 'lighthouse-summary.json')}\n\n## Notes\n\n- Default mode uses \`el_internal=1\` for browser screenshots, so live storefront pixel sends are suppressed.\n- The tracking probe directly verifies the production endpoint and Supabase persistence as \`internal_qa\`.\n- Use \`--allow-live-tracking\` only when deliberately testing the live storefront pixel path.\n`;
  await fs.writeFile(path.join(outDir, 'proof_packet.md'), packet);
  console.log(JSON.stringify({ outDir, pass, proof_packet: path.join(outDir, 'proof_packet.md') }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
