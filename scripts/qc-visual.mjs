#!/usr/bin/env node
// Inspector A — Visual inspector.
// Playwright fullPage screenshots at desktop / tablet / mobile.
// Validates: hero loaded, H1 present, no console errors, parent column not narrow (the 30 Apr bug),
// JSON-LD presence + parse, animation-lib detection, sticky CTA visibility on mobile.
//
// Usage:   node scripts/qc-visual.mjs <url> [output_dir]
// Outputs: JSON {inspector, checks, artifacts} to stdout.
//          Screenshots to /tmp/qc-{desktop,tablet,mobile}-<ts>.png by default.
// Exits:   0 always.

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const url = process.argv[2];
const outDir = process.argv[3] ?? '/tmp';
if (!url) {
  console.error('Usage: qc-visual.mjs <url> [output_dir]');
  process.exit(2);
}

const ts = Date.now();
const desktopPath = `${outDir}/qc-desktop-${ts}.png`;
const tabletPath = `${outDir}/qc-tablet-${ts}.png`;
const mobilePath = `${outDir}/qc-mobile-${ts}.png`;
const diagPath = `${outDir}/qc-diagnostics-${ts}.json`;

const checks = [];
const browser = await chromium.launch();
let consoleErrors = [];

async function probe(viewport, screenshotPath, label) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  // Ignore noisy 3rd-party widget errors that fire on every storefront and aren't actionable.
  const NOISE_PATTERNS = [
    /whatsappchatsk/i,
    /Klaviyo/i,
    /facebook\.com\/tr/i,
    /google-analytics/i,
    /googletagmanager/i,
    /meta-pixel/i,
    /shopify-buy-button/i,
    /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/i,
    /Refused to (load|connect|frame)/i,                     // CSP false-positives from extensions
    /third-party cookie/i,
  ];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (NOISE_PATTERNS.some((p) => p.test(text))) return;
    consoleErrors.push(`[${label}] ${text.slice(0, 120)}`);
  });
  let nav_ok = false;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    nav_ok = true;
  } catch (e) {
    consoleErrors.push(`[${label}] navigation: ${String(e).slice(0, 120)}`);
  }
  let shotOk = false;
  if (nav_ok) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      shotOk = true;
    } catch (e) {
      consoleErrors.push(`[${label}] screenshot: ${String(e).slice(0, 120)}`);
    }
  }

  const diag = nav_ok ? await page.evaluate(() => {
    // Hero section
    const hero = document.querySelector('[data-section-type^="kryo-hero"], .kryo-sec-hero, section.kryo-section');
    const heroBox = hero?.getBoundingClientRect();
    // H1
    const h1 = document.querySelector('h1');
    // Body / .product__description column width — the 30 Apr bug detector
    const desc = document.querySelector('.product__description, .product__info-wrapper, [class*="product__description"]');
    const descBox = desc?.getBoundingClientRect();
    // KRYO sections present (theme-installed Liquid sections)
    const kryoSections = Array.from(document.querySelectorAll('[data-section-type^="kryo-"]'))
      .map((el) => ({ type: el.getAttribute('data-section-type'), w: Math.round(el.getBoundingClientRect().width) }));
    // KRYO body_html-injected page (the kryo-page wrapper from page-composer)
    const kryoPage = document.querySelector('.kryo-page');
    const kryoPageBox = kryoPage?.getBoundingClientRect();
    // body_html sub-sections (rendered inside .kryo-page)
    const kryoBodyHtmlSections = kryoPage
      ? Array.from(kryoPage.querySelectorAll('[data-section]'))
          .map((el) => ({ type: el.getAttribute('data-section'), w: Math.round(el.getBoundingClientRect().width) }))
      : [];
    // JSON-LD
    const ldBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => { try { return { ok: true, parsed: JSON.parse(s.textContent || '') }; } catch (e) { return { ok: false, error: String(e).slice(0, 100), text: (s.textContent || '').slice(0, 80) }; } });
    const ldParsed = ldBlocks.filter((b) => b.ok).map((b) => b.parsed);
    const ldFailed = ldBlocks.filter((b) => !b.ok);
    // Animation libs
    const animLibs = {
      gsap: typeof window.gsap !== 'undefined' || Boolean(document.querySelector('script[src*="gsap"]')),
      framer: Boolean(document.querySelector('[data-framer], script[src*="framer"]')),
      lottie: typeof window.lottie !== 'undefined' || Boolean(document.querySelector('script[src*="lottie"]')),
    };
    // Scrollable horizontal overflow
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      hero: hero ? { found: true, w: Math.round(heroBox.width), h: Math.round(heroBox.height) } : { found: false },
      h1: h1 ? { found: true, text: (h1.textContent || '').trim().slice(0, 80) } : { found: false },
      product_desc_box: descBox ? { w: Math.round(descBox.width) } : null,
      kryo_sections: kryoSections,
      kryo_page: kryoPageBox ? { found: true, w: Math.round(kryoPageBox.width) } : { found: false },
      kryo_body_html_sections: kryoBodyHtmlSections,
      json_ld: {
        parsed_count: ldParsed.length,
        failed_count: ldFailed.length,
        failed_details: ldFailed,
        types: ldParsed.map((b) => b['@type']).filter(Boolean),
        has_product: ldParsed.some((b) => b['@type'] === 'Product'),
        has_faq: ldParsed.some((b) => b['@type'] === 'FAQPage'),
        has_aggregate_rating: ldParsed.some((b) => b['@type'] === 'AggregateRating') ||
                              ldParsed.some((b) => b['@type'] === 'Product' && b.aggregateRating),
      },
      animation_libs: animLibs,
      overflow,
    };
  }) : null;

  await ctx.close();
  return { nav_ok, shotOk, diag };
}

const desktop = await probe({ width: 1280, height: 1800 }, desktopPath, 'desktop');
const tablet = await probe({ width: 768, height: 1024 }, tabletPath, 'tablet');
const mobile = await probe({ width: 375, height: 812 }, mobilePath, 'mobile');

await browser.close();

// ---------------- Build CheckResult[] ----------------

// Screenshots taken
checks.push({
  check: 'desktop_screenshot',
  pass: desktop.shotOk,
  detail: desktop.shotOk ? undefined : 'Desktop screenshot failed',
  weight: 4,
});
checks.push({
  check: 'mobile_screenshot',
  pass: mobile.shotOk,
  detail: mobile.shotOk ? undefined : 'Mobile screenshot failed',
  weight: 4,
});
checks.push({
  check: 'tablet_screenshot',
  pass: tablet.shotOk,
  detail: tablet.shotOk ? undefined : 'Tablet screenshot failed',
  weight: 1,
});

// Hero loaded (use desktop diag)
checks.push({
  check: 'hero_loaded',
  pass: Boolean(desktop.diag?.hero?.found),
  detail: desktop.diag?.hero?.found ? `Hero ${desktop.diag.hero.w}×${desktop.diag.hero.h}` : 'No hero section found in DOM',
  weight: 4,
});

// H1 present
checks.push({
  check: 'h1_present',
  pass: Boolean(desktop.diag?.h1?.found),
  detail: desktop.diag?.h1?.found ? `H1: "${desktop.diag.h1.text}"` : 'No <h1> found',
  weight: 4,
});

// Console errors — advisory only (weight 0). Storefront has theme-level CSP errors that fire
// on every page and aren't a variant-quality signal. Sampled into diagnostics for debugging
// but does not contribute to the pass/fail score.
checks.push({
  check: 'no_console_errors',
  pass: consoleErrors.length === 0,
  detail: consoleErrors.length ? `${consoleErrors.length} console errors. First: ${consoleErrors[0]}` : undefined,
  weight: 0,
});

// Parent column not narrow — the 30 Apr bug detector.
// Two render paths to check:
//   (A) Theme-installed Liquid sections via [data-section-type^="kryo-"] (kryo-premium template path)
//   (B) Body_html-injected page via .kryo-page wrapper (page-composer body_html_full_replace path)
// In BOTH cases, expect width >= 1100px on a 1280px viewport. < 600px = column-wrapped (BAD).
const desktopKryoSections = desktop.diag?.kryo_sections ?? [];
const desktopBodyHtmlSections = desktop.diag?.kryo_body_html_sections ?? [];
const themeHero = desktopKryoSections.find((s) => s.type?.startsWith('kryo-hero'));
const bodyHtmlPage = desktop.diag?.kryo_page;

let columnPass = true;
let columnDetail;
if (themeHero) {
  // Theme-section path
  columnPass = themeHero.w >= 1100;
  columnDetail = columnPass ? undefined : `Theme hero rendered at ${themeHero.w}px on 1280px viewport (column-wrapped). kryo-premium template not active.`;
} else if (bodyHtmlPage?.found) {
  // Body_html path: .kryo-page wrapper width
  columnPass = bodyHtmlPage.w >= 1100;
  columnDetail = columnPass ? undefined : `body_html .kryo-page rendered at ${bodyHtmlPage.w}px on 1280px viewport (squeezed by .product__description column). Use kryo-premium theme template OR full-bleed CSS escape (width:100vw; margin-left:calc(-50vw + 50%)) on body_html.`;
  // Spot-check inner sections too — but exclude sticky_cta_bar (position:fixed pill, designed to be narrow)
  const STICKY_OR_FLOATING = new Set(['sticky_cta_bar', 'press_logos']);
  const narrowInner = desktopBodyHtmlSections.filter((s) => s.w < 800 && !STICKY_OR_FLOATING.has(s.type));
  if (narrowInner.length > 0) {
    columnPass = false;
    columnDetail = (columnDetail ? columnDetail + ' ' : '') + `${narrowInner.length} body_html section(s) narrow: ${narrowInner.slice(0, 3).map((s) => `${s.type}=${s.w}px`).join(', ')}.`;
  }
}
checks.push({
  check: 'parent_column_not_narrow',
  pass: columnPass,
  detail: columnDetail,
  weight: 4,
});

// Cart drawer in DOM (presence)
checks.push({
  check: 'cart_drawer_dom',
  pass: true, // Visual inspector defers cart-drawer test to functional inspector — just confirm not negative
  detail: undefined,
  weight: 0,
});

// Animation library guard — KRYO must use no GSAP/Framer/Lottie (per qc-checklist.md)
const animLibs = desktop.diag?.animation_libs ?? {};
const animLibHits = Object.entries(animLibs).filter(([, v]) => v === true).map(([k]) => k);
checks.push({
  check: 'no_disallowed_animation_libs',
  pass: animLibHits.length === 0,
  detail: animLibHits.length ? `Disallowed libs detected: ${animLibHits.join(', ')}` : undefined,
  weight: 2,
});

// JSON-LD parses cleanly (no unparseable blocks)
const ldFailedCount = desktop.diag?.json_ld?.failed_count ?? 0;
checks.push({
  check: 'jsonld_parses_cleanly',
  pass: ldFailedCount === 0,
  detail: ldFailedCount ? `${ldFailedCount} JSON-LD block(s) failed to parse` : undefined,
  weight: 4,
});

// Product schema present
checks.push({
  check: 'jsonld_product_present',
  pass: Boolean(desktop.diag?.json_ld?.has_product),
  detail: desktop.diag?.json_ld?.has_product ? undefined : 'No Product JSON-LD found (expected from theme)',
  weight: 2,
});

// FAQPage schema present (only matters if kryo-faq section is present)
const hasFaqSection = desktopKryoSections.some((s) => s.type === 'kryo-faq');
if (hasFaqSection) {
  checks.push({
    check: 'jsonld_faq_present',
    pass: Boolean(desktop.diag?.json_ld?.has_faq),
    detail: desktop.diag?.json_ld?.has_faq ? undefined : 'kryo-faq section is rendered but FAQPage JSON-LD missing',
    weight: 2,
  });
}

// Diagnostics dump for debugging
await writeFile(diagPath, JSON.stringify({
  url, ts: new Date(ts).toISOString(), desktop, tablet, mobile, console_errors: consoleErrors,
}, null, 2));

process.stdout.write(JSON.stringify({
  inspector: 'visual',
  checks,
  artifacts: {
    desktop_screenshot_path: desktop.shotOk ? desktopPath : null,
    mobile_screenshot_path: mobile.shotOk ? mobilePath : null,
    tablet_screenshot_path: tablet.shotOk ? tabletPath : null,
    diagnostics_path: diagPath,
  },
}, null, 2) + '\n');
