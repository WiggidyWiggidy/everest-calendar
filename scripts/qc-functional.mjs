#!/usr/bin/env node
// Inspector B — Functional inspector.
// Runs Playwright against a live Shopify URL: link-checks, image 200-checks, ATC flow,
// cart drawer, mobile responsiveness, tap-target sizing, LCP.
//
// Usage:   node scripts/qc-functional.mjs <url>
// Outputs: JSON CheckResult[] to stdout (one object per check).
// Exits:   0 always (pass/fail is encoded in the JSON, not the exit code).

import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) {
  console.error('Usage: qc-functional.mjs <url>');
  process.exit(2);
}

const checks = [];
const browser = await chromium.launch();

try {
  // ---------------- Desktop pass: link + image checks + ATC + drawer + LCP ----------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();

  let consoleErrors = 0;
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors++; });

  const navStart = Date.now();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  const lcp = Date.now() - navStart;

  // Mobile LCP gate (using desktop nav as proxy — true Lighthouse LCP would need a separate run)
  checks.push({
    check: 'lcp_under_3s_mobile',
    pass: lcp < 3000,
    detail: `Page settled in ${lcp}ms (cap: 3000ms)`,
    weight: 2,
  });

  // Collect all internal links + image URLs in one DOM pass
  const { links, images } = await page.evaluate(() => {
    const origin = window.location.origin;
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.href)
      .filter((h) =>
        h.startsWith(origin) &&
        !h.startsWith('javascript:') &&
        !h.startsWith('mailto:') &&
        !h.includes('#') &&
        !h.endsWith('/cart') &&
        !h.endsWith('/account/login'),
      );
    const images = [
      ...Array.from(document.querySelectorAll('img[src]')).map((i) => i.currentSrc || i.src),
      ...Array.from(document.querySelectorAll('source[srcset]')).flatMap((s) =>
        (s.srcset || '').split(',').map((part) => part.trim().split(' ')[0]).filter(Boolean),
      ),
    ].filter((u) => u && (u.startsWith('http') || u.startsWith('//')));
    return { links: [...new Set(links)], images: [...new Set(images)] };
  });

  // Cap to first 25 links + 30 images so we don't melt on huge pages.
  const linksToCheck = links.slice(0, 25);
  const imagesToCheck = images.slice(0, 30).map((u) => (u.startsWith('//') ? `https:${u}` : u));

  // HEAD-check links in parallel
  const linkResults = await Promise.all(
    linksToCheck.map(async (u) => {
      try {
        const r = await fetch(u, { method: 'HEAD', redirect: 'follow' });
        return { u, ok: r.ok || r.status < 400, status: r.status };
      } catch (e) {
        return { u, ok: false, status: 0, err: String(e) };
      }
    }),
  );
  const badLinks = linkResults.filter((r) => !r.ok);
  checks.push({
    check: 'all_links_2xx',
    pass: badLinks.length === 0,
    detail: badLinks.length ? `${badLinks.length}/${linkResults.length} broken: ${badLinks.slice(0, 3).map((b) => `${b.status} ${b.u.slice(-40)}`).join(', ')}` : `Checked ${linkResults.length} internal links`,
    weight: 3,
  });

  // HEAD-check images in parallel
  const imageResults = await Promise.all(
    imagesToCheck.map(async (u) => {
      try {
        const r = await fetch(u, { method: 'HEAD', redirect: 'follow' });
        return { u, ok: r.ok, status: r.status };
      } catch (e) {
        return { u, ok: false, status: 0, err: String(e) };
      }
    }),
  );
  const badImages = imageResults.filter((r) => !r.ok);
  checks.push({
    check: 'all_images_2xx',
    pass: badImages.length === 0,
    detail: badImages.length ? `${badImages.length}/${imageResults.length} broken: ${badImages.slice(0, 3).map((b) => `${b.status} ${b.u.slice(-40)}`).join(', ')}` : `Checked ${imageResults.length} images`,
    weight: 4,
  });

  // ATC button clickable (does NOT click — just confirms it exists + is visible + enabled)
  const atcStatus = await page.evaluate(() => {
    const sel = 'product-form button[type="submit"], button[name="add"], form[action*="/cart/add"] button[type="submit"]';
    const btn = document.querySelector(sel);
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    const enabled = !btn.disabled;
    return { found: true, visible, enabled, w: Math.round(rect.width), h: Math.round(rect.height) };
  });
  checks.push({
    check: 'add_to_cart_clickable',
    pass: Boolean(atcStatus.found && atcStatus.visible && atcStatus.enabled),
    detail: !atcStatus.found ? 'No ATC button found on page' : !atcStatus.visible ? 'ATC button has zero size' : !atcStatus.enabled ? 'ATC button is disabled' : `${atcStatus.w}×${atcStatus.h}`,
    weight: 4,
  });

  // Try clicking ATC and verify cart drawer reacts
  let drawerOpened = false;
  try {
    const buy = await page.$('product-form button[type="submit"], button[name="add"], form[action*="/cart/add"] button[type="submit"]');
    if (buy) {
      await buy.click({ timeout: 5000 });
      await page.waitForTimeout(1200);
      drawerOpened = await page.evaluate(() => {
        const sel = 'cart-drawer.active, cart-drawer[open], cart-notification[open], .cart-drawer.active, .drawer.active, cart-drawer:not([hidden]):not(.is-empty)';
        const d = document.querySelector(sel);
        if (!d) return false;
        const r = d.getBoundingClientRect();
        return r.width > 100 && r.height > 100;
      });
    }
  } catch { drawerOpened = false; }
  checks.push({
    check: 'cart_drawer_opens',
    pass: drawerOpened,
    detail: drawerOpened ? undefined : 'ATC clicked but no visible cart drawer / notification appeared within 1.2s',
    weight: 3,
  });

  await ctx.close();

  // ---------------- Mobile pass: horizontal scroll + tap-target audit ----------------
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mpage = await mctx.newPage();
  await mpage.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

  const mobileLayout = await mpage.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    // Tap-target audit: any anchor or button visibly < 44px on either axis
    const interactive = Array.from(document.querySelectorAll('a, button, [role="button"], summary, input[type="submit"]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, tag: el.tagName, visible: r.width > 0 && r.height > 0 };
      })
      .filter((e) => e.visible);
    const tooSmall = interactive.filter((e) => e.w < 44 || e.h < 44);
    return {
      overflow,
      total_interactive: interactive.length,
      too_small: tooSmall.length,
      sample_too_small: tooSmall.slice(0, 5).map((e) => `${e.tag}:${Math.round(e.w)}×${Math.round(e.h)}`),
    };
  });

  checks.push({
    check: 'mobile_no_horizontal_scroll',
    pass: mobileLayout.overflow <= 1, // 1px tolerance for sub-pixel rounding
    detail: mobileLayout.overflow > 1 ? `Horizontal overflow: ${mobileLayout.overflow}px at 375px viewport` : undefined,
    weight: 4,
  });

  // Tap targets — allow up to 10% to be sub-44px (small icons in nav are common and acceptable)
  const tapTargetFailRate = mobileLayout.total_interactive > 0
    ? mobileLayout.too_small / mobileLayout.total_interactive
    : 0;
  checks.push({
    check: 'tap_targets_min_44px',
    pass: tapTargetFailRate <= 0.10,
    detail: tapTargetFailRate > 0.10
      ? `${mobileLayout.too_small}/${mobileLayout.total_interactive} interactive elements <44px on either axis (sample: ${mobileLayout.sample_too_small.join(', ')})`
      : `${mobileLayout.too_small}/${mobileLayout.total_interactive} sub-44px (within 10% tolerance)`,
    weight: 2,
  });

  await mctx.close();
} finally {
  await browser.close();
}

// Output: JSON array of CheckResult, one per check.
process.stdout.write(JSON.stringify({ inspector: 'functional', checks }, null, 2) + '\n');
