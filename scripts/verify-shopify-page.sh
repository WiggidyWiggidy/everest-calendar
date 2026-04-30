#!/usr/bin/env bash
# verify-shopify-page.sh — Playwright-based QC for live Shopify product/page URLs.
# Outputs:
#   /tmp/qc-desktop-<ts>.png       fullPage at 1280x1800
#   /tmp/qc-mobile-<ts>.png        fullPage at 375x812
#   /tmp/qc-diagnostics-<ts>.json  layout + schema + cart-drawer probe
#
# Usage: scripts/verify-shopify-page.sh <url>
# Requires: Playwright installed in /tmp/pw/ (auto-bootstraps if missing).

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <url>" >&2
  exit 1
fi

URL="$1"
TS=$(date +%s)
PW_DIR=/tmp/pw

# Bootstrap Playwright if missing
if [ ! -d "$PW_DIR/node_modules/playwright" ]; then
  mkdir -p "$PW_DIR"
  cd "$PW_DIR"
  npm install --silent playwright@1.48.0 >&2
  npx playwright install chromium >&2
fi

# Write the QC script if not present
cat > "$PW_DIR/qc.mjs" <<'EOF'
import { chromium } from 'playwright';

const url = process.argv[2];
const desktopOut = process.argv[3];
const mobileOut = process.argv[4];
const diagnosticsOut = process.argv[5];
const fs = await import('node:fs/promises');

const browser = await chromium.launch();

async function inspect(viewport, screenshotPath) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[console.error] ${msg.text()}`);
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const diag = await page.evaluate(() => {
    const out = {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      title: document.title,
      url: window.location.href,
    };

    // Hero section
    const hero = document.querySelector('[data-section-type="kryo-hero-video"], .kryo-sec-hero, section.kryo-section');
    if (hero) {
      const r = hero.getBoundingClientRect();
      const cs = getComputedStyle(hero);
      out.hero = {
        found: true,
        width: Math.round(r.width),
        height: Math.round(r.height),
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        fontFamily: cs.fontFamily,
        parent: hero.parentElement?.className?.slice(0, 80) ?? null,
      };
    } else {
      out.hero = { found: false };
    }

    // H1
    const h1 = document.querySelector('h1, .kryo-sec-hero__headline');
    if (h1) {
      const cs = getComputedStyle(h1);
      out.h1 = {
        text: h1.textContent?.trim().slice(0, 100),
        fontSize: cs.fontSize,
        letterSpacing: cs.letterSpacing,
        fontWeight: cs.fontWeight,
        color: cs.color,
      };
    }

    // Cart drawer presence
    const drawer = document.querySelector('cart-drawer, .cart-drawer, .drawer__inner, [data-cart-drawer]');
    out.cart_drawer_in_dom = Boolean(drawer);

    // Buy form / product-form
    const productForm = document.querySelector('product-form, form[action*="/cart/add"]');
    out.buy_form_present = Boolean(productForm);

    // JSON-LD schemas
    const ldBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => { try { return JSON.parse(s.textContent || ''); } catch { return null; } })
      .filter(Boolean);
    out.json_ld = {
      count: ldBlocks.length,
      types: ldBlocks.map((b) => b['@type']).filter(Boolean),
      has_product: ldBlocks.some((b) => b['@type'] === 'Product'),
      has_faq: ldBlocks.some((b) => b['@type'] === 'FAQPage'),
      has_aggregate_rating: ldBlocks.some((b) => b['@type'] === 'Product' && b.aggregateRating) ||
                            ldBlocks.some((b) => b['@type'] === 'AggregateRating'),
    };

    // Sections present (data-section-type)
    out.sections = Array.from(document.querySelectorAll('[data-section-type]')).map((el) => ({
      type: el.getAttribute('data-section-type'),
      width: Math.round(el.getBoundingClientRect().width),
    }));

    // Animation library detection
    out.animation_libs = {
      gsap: typeof window.gsap !== 'undefined' || Boolean(document.querySelector('script[src*="gsap"]')),
      framer: Boolean(document.querySelector('[data-framer], script[src*="framer"]')),
      lottie: typeof window.lottie !== 'undefined' || Boolean(document.querySelector('script[src*="lottie"]')),
      aos: typeof window.AOS !== 'undefined' || Boolean(document.querySelector('[data-aos]')),
    };

    // Performance
    if (performance.getEntriesByType) {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) out.perf_navigation = { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) };
    }

    return out;
  });

  await ctx.close();
  return diag;
}

const desktop = await inspect({ width: 1280, height: 1800 }, desktopOut);
const mobile = await inspect({ width: 375, height: 812 }, mobileOut);

// Optional: cart drawer click test on desktop
let cartDrawerTest = { skipped: true };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  const buy = await page.$('product-form button[type="submit"], button[name="add"], form[action*="/cart/add"] button[type="submit"]');
  if (buy) {
    const before = await page.evaluate(() => ({
      drawerOpen: Boolean(document.querySelector('cart-drawer.is-empty.active, cart-drawer:not(.is-empty), .cart-drawer.active, .drawer.active')),
    }));
    await buy.click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({
      drawerOpen: Boolean(document.querySelector('cart-drawer.active, .cart-drawer.active, .drawer.active, cart-drawer[open], cart-notification[open]')),
      drawerBox: (() => {
        const d = document.querySelector('cart-drawer, .cart-drawer, .drawer');
        if (!d) return null;
        const r = d.getBoundingClientRect();
        return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
      })(),
    }));
    cartDrawerTest = { tested: true, before, after };
  } else {
    cartDrawerTest = { skipped: true, reason: 'no buy button found' };
  }
  await ctx.close();
} catch (e) {
  cartDrawerTest = { error: String(e) };
}

const out = { url, desktop, mobile, cart_drawer_test: cartDrawerTest, ts: new Date().toISOString() };
await fs.writeFile(diagnosticsOut, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await browser.close();
EOF

DESKTOP_OUT="/tmp/qc-desktop-${TS}.png"
MOBILE_OUT="/tmp/qc-mobile-${TS}.png"
DIAG_OUT="/tmp/qc-diagnostics-${TS}.json"

cd "$PW_DIR"
node ./qc.mjs "$URL" "$DESKTOP_OUT" "$MOBILE_OUT" "$DIAG_OUT"

echo ""
echo "=== ARTIFACTS ==="
echo "Desktop:     $DESKTOP_OUT"
echo "Mobile:      $MOBILE_OUT"
echo "Diagnostics: $DIAG_OUT"
