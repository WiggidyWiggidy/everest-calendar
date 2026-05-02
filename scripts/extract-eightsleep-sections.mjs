#!/usr/bin/env node
// extract-eightsleep-sections.mjs
// Playwright fetches eightsleep.com flagship page and extracts section-by-section structure:
// heading text, sub-copy, image positions, CTA placements, layout signals.
// Output: benchmarks/eightsleep-sections.json — used as the literal blueprint for KRYO clone-and-substitute.
//
// Usage: node scripts/extract-eightsleep-sections.mjs [url]

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

const url = process.argv[2] || 'https://www.eightsleep.com/product/pod-cover/';
const OUT_DIR = `${REPO_ROOT}/benchmarks`;
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1800 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(5000); // let initial content settle without waiting for full networkidle

// Auto-scroll to lazy-load everything
await page.evaluate(async () => {
  const distance = 500;
  const delay = 200;
  while (window.scrollY + window.innerHeight < document.documentElement.scrollHeight) {
    window.scrollBy(0, distance);
    await new Promise((r) => setTimeout(r, delay));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1000);

console.log(`[extract] Fetched ${url}, extracting section-by-section ...`);

const sections = await page.evaluate(() => {
  // Walk the DOM in document order. Each H1/H2 starts a new section. Capture everything
  // between consecutive H2s as a section block.
  const headings = Array.from(document.querySelectorAll('h1, h2'));
  const out = [];

  function getNextHeadingY(currentEl) {
    const next = currentEl.nextElementSibling;
    if (!next) return Infinity;
    return next.getBoundingClientRect().top + window.scrollY;
  }

  function collectBetween(startY, endY) {
    const result = { paragraphs: [], images: [], videos: [], ctas: [], h3s: [] };
    const all = document.querySelectorAll('p, img, video, h3, button, a[role="button"], a.button, a[class*="cta" i]');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const y = r.top + window.scrollY;
      if (y < startY || y >= endY) continue;
      if (el.tagName === 'P') {
        const t = (el.textContent || '').trim();
        if (t.length > 0 && t.length < 500) result.paragraphs.push(t);
      } else if (el.tagName === 'IMG') {
        const src = el.currentSrc || el.src;
        const alt = el.alt || '';
        if (src && r.width > 100) result.images.push({ src, alt, width: Math.round(r.width), height: Math.round(r.height) });
      } else if (el.tagName === 'VIDEO') {
        const sources = Array.from(el.querySelectorAll('source')).map((s) => s.src);
        result.videos.push({ src: el.src || sources[0] || '', autoplay: el.autoplay, sources });
      } else if (el.tagName === 'H3') {
        const t = (el.textContent || '').trim();
        if (t.length > 0) result.h3s.push(t);
      } else {
        const t = (el.textContent || '').trim();
        if (t.length > 0 && t.length < 80 && /\b(buy|shop|reserve|order|add to cart|get yours|claim|start|learn|explore|discover)\b/i.test(t)) {
          result.ctas.push(t);
        }
      }
    }
    return result;
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const text = (h.textContent || '').trim();
    if (text.length === 0 || text.length > 300) continue;
    const startY = h.getBoundingClientRect().top + window.scrollY;
    const endY = i < headings.length - 1
      ? headings[i + 1].getBoundingClientRect().top + window.scrollY
      : document.documentElement.scrollHeight;
    const between = collectBetween(startY, endY);
    out.push({
      index: out.length,
      heading_level: h.tagName.toLowerCase(),
      heading: text,
      y_position: Math.round(startY),
      height: Math.round(endY - startY),
      paragraphs: between.paragraphs.slice(0, 8),
      h3s: between.h3s.slice(0, 12),
      images: between.images.slice(0, 8),
      videos: between.videos.slice(0, 4),
      ctas: between.ctas.slice(0, 4),
    });
  }

  return out;
});

await ctx.close();
await browser.close();

// Output filename derived from URL slug so we can capture multiple eightsleep pages without overwriting.
// pod-cover/ → eightsleep-pod-cover-sections.json. pod-4-ultra/ → eightsleep-pod-4-ultra-sections.json.
const slug = url.replace(/\/$/, '').split('/').pop() || 'unknown';
const outPath = `${OUT_DIR}/eightsleep-${slug}-sections.json`;
await writeFile(outPath, JSON.stringify({ url, captured_at: new Date().toISOString(), section_count: sections.length, sections }, null, 2));
// Also write a stable symlink-style "eightsleep-sections.json" pointing to the highest-section-count blueprint
// (so swarm-loop's default path Just Works).
const { existsSync } = await import('node:fs');
const stablePath = `${OUT_DIR}/eightsleep-sections.json`;
if (!existsSync(stablePath) || sections.length >= 8) {
  await writeFile(stablePath, JSON.stringify({ url, captured_at: new Date().toISOString(), section_count: sections.length, sections }, null, 2));
}
console.log(`[extract] Saved ${sections.length} sections to ${outPath}`);
console.log('');
console.log('Section index:');
for (const s of sections) {
  console.log(`  [${s.index.toString().padStart(2)}] ${s.heading_level} ${s.heading.slice(0, 70)}  (${s.paragraphs.length}p, ${s.images.length}i, ${s.videos.length}v, ${s.ctas.length}cta)`);
}
