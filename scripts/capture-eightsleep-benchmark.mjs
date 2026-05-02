#!/usr/bin/env node
// capture-eightsleep-benchmark.mjs
// Headless Playwright fetch of eightsleep.com's flagship product page (Pod 4 Ultra by default).
// Extracts a structural + qualitative profile: section_count, social proof intensity, CTA density,
// video presence, copy chunking, etc. Saves to benchmarks/eightsleep-pod4-profile.json.
//
// Usage:   node scripts/capture-eightsleep-benchmark.mjs [url]
//          (defaults to https://www.eightsleep.com/product/pod-cover/ or pod-4-ultra)
// Outputs: benchmarks/<inferred-name>-profile.json + diagnostics PNG screenshots

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

const url = process.argv[2] || 'https://www.eightsleep.com/product/pod-cover/';
const profileName = url
  .replace(/^https?:\/\//, '')
  .replace(/[^a-z0-9-]/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60);

const OUT_DIR = `${REPO_ROOT}/benchmarks`;
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1800 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

console.log(`[capture] Fetching ${url} ...`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000); // let lazy content settle

const screenshotPath = `${OUT_DIR}/${profileName}.png`;
await page.screenshot({ path: screenshotPath, fullPage: true });
console.log(`[capture] Saved screenshot: ${screenshotPath}`);

const profile = await page.evaluate(() => {
  const PRESS_PUBLICATIONS = [
    'forbes', 'wsj', 'wall street journal', 'wired', 'the verge', 'techcrunch',
    'gq', 'nyt', 'new york times', 'business insider', 'cnbc', 'bloomberg',
    'fast company', 'mens health', "men's health", 'gear patrol', 'engadget',
    'cnet', 'fortune', 'esquire', 'vogue', 'bbc', 'guardian', 'rolling stone',
  ];

  // section_count via H2/H3 + structural cues
  const h2Count = document.querySelectorAll('h2').length;
  const h3Count = document.querySelectorAll('h3').length;
  const sectionEls = document.querySelectorAll('section, [class*="section"], [class*="Section"]').length;
  const sectionCount = Math.max(h2Count, Math.floor(sectionEls / 2));

  // total text length
  const bodyText = document.body.innerText || '';
  const totalTextLength = bodyText.split(/\s+/).filter(Boolean).length;

  // CTAs: buttons + anchors with buy-ish text
  const allButtons = Array.from(document.querySelectorAll('button, a[role="button"], a.button, a[class*="cta"], a[class*="CTA"]'));
  const ctaPatterns = /\b(buy|shop|reserve|order|add to cart|get yours|claim|start)\b/i;
  const ctaCount = allButtons.filter((el) => ctaPatterns.test(el.textContent || '')).length;
  const docHeight = document.documentElement.scrollHeight;
  const ctaDensity = docHeight > 0 ? (ctaCount / (docHeight / 1000)) : 0;

  // Images / videos
  const imgCount = document.querySelectorAll('img').length;
  const sourceCount = document.querySelectorAll('source').length;
  const videos = Array.from(document.querySelectorAll('video'));
  const videosPresent = videos.length > 0;
  const autoplayVideos = videos.filter((v) => v.autoplay).length;

  // Testimonials: heuristic = elements with quote-like patterns
  const quoteIndicators = Array.from(document.querySelectorAll('blockquote, [class*="testimonial"], [class*="Testimonial"], [class*="review"], [class*="Review"]'));
  // De-dup by approximate Y position
  const seenY = new Set();
  const testimonialsCount = quoteIndicators.filter((el) => {
    const y = Math.round(el.getBoundingClientRect().top / 40) * 40;
    if (seenY.has(y)) return false;
    seenY.add(y);
    return true;
  }).length;

  // Press logos heuristic: find img.alt or text matching press publications
  const lowerBody = bodyText.toLowerCase();
  const pressLogosCount = PRESS_PUBLICATIONS.filter((pub) => lowerBody.includes(pub)).length;

  // Star rating
  let ratingValue = null;
  const ratingMatch = bodyText.match(/(\d\.\d)\s*(?:\/\s*5|stars?|out of)/i);
  if (ratingMatch) ratingValue = parseFloat(ratingMatch[1]);

  // Review count
  let reviewCount = null;
  const reviewMatch = bodyText.match(/\b(\d{2,5}(?:,\d{3})*)\s*(?:reviews?|ratings?|customers?)/i);
  if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

  // Social proof intensity score (composite, 0-10)
  const socialProofIntensity = Math.min(10, Math.round(
    (testimonialsCount * 0.5) +
    (pressLogosCount * 1.0) +
    (ratingValue ? 2 : 0) +
    (reviewCount && reviewCount > 100 ? 2 : 0) +
    (videosPresent ? 1 : 0)
  ));

  // Font size progression — distinct H1/H2/H3/large body sizes
  const fontSizes = new Set();
  for (const tag of ['h1', 'h2', 'h3', 'p']) {
    document.querySelectorAll(tag).forEach((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs >= 14) fontSizes.add(Math.round(fs));
    });
  }
  const fontSizeProgression = Array.from(fontSizes).sort((a, b) => b - a).slice(0, 8);

  // Copy chunk distribution (paragraph word counts)
  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map((p) => (p.textContent || '').trim().split(/\s+/).filter(Boolean).length)
    .filter((n) => n >= 3);
  paragraphs.sort((a, b) => a - b);
  const median = paragraphs.length > 0 ? paragraphs[Math.floor(paragraphs.length / 2)] : 0;
  const p90 = paragraphs.length > 0 ? paragraphs[Math.floor(paragraphs.length * 0.9)] : 0;

  // FAQ schema present?
  const ldBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => { try { return JSON.parse(s.textContent || ''); } catch { return null; } })
    .filter(Boolean);
  const hasFaqSchema = ldBlocks.some((b) =>
    b['@type'] === 'FAQPage' ||
    (Array.isArray(b['@graph']) && b['@graph'].some((g) => g['@type'] === 'FAQPage'))
  );
  const hasReviewSchema = ldBlocks.some((b) =>
    b['@type'] === 'Product' && (b.aggregateRating || b.review)
  );

  return {
    url: window.location.href,
    captured_at: new Date().toISOString(),
    section_count: sectionCount,
    h2_count: h2Count,
    h3_count: h3Count,
    section_els_count: sectionEls,
    total_text_length: totalTextLength,
    cta_count: ctaCount,
    cta_density: parseFloat(ctaDensity.toFixed(2)),
    images_count: imgCount + sourceCount,
    videos_count: videos.length,
    videos_present: videosPresent,
    autoplay_videos: autoplayVideos,
    testimonials_count: testimonialsCount,
    press_logos_count: pressLogosCount,
    rating_value: ratingValue,
    review_count: reviewCount,
    social_proof_intensity: socialProofIntensity,
    font_size_progression: fontSizeProgression,
    copy_chunks_median_words: median,
    copy_chunks_p90_words: p90,
    has_faq_schema: hasFaqSchema,
    has_review_schema: hasReviewSchema,
    vertical_scroll_height: docHeight,
    title: document.title,
  };
});

await ctx.close();
await browser.close();

const outPath = `${OUT_DIR}/${profileName}-profile.json`;
await writeFile(outPath, JSON.stringify(profile, null, 2));
console.log(`[capture] Saved profile: ${outPath}`);
console.log('');
console.log(JSON.stringify(profile, null, 2));
