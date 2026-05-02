#!/usr/bin/env node
// qc-benchmark.mjs
// Compares a target page (URL or file://) against a captured benchmark profile.
// Uses the SAME extractor as capture-eightsleep-benchmark.mjs for apples-to-apples comparison.
// Outputs a structured gap report with weighted score and refinement actions.
//
// Usage:   node scripts/qc-benchmark.mjs <target-url-or-file> [benchmark-profile-json]
//          (default benchmark: benchmarks/www-eightsleep-com-product-pod-cover-profile.json)
//
// Exit codes: 0 always (verdict in JSON output). Read stdout for the gap report.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

const target = process.argv[2];
const benchmarkPath = process.argv[3] || `${REPO_ROOT}/benchmarks/www-eightsleep-com-product-pod-cover-profile.json`;
if (!target) {
  console.error('Usage: qc-benchmark.mjs <target-url-or-file> [benchmark-profile-json]');
  process.exit(2);
}

const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf-8'));

// Same extractor as capture-eightsleep-benchmark.mjs — kept as a single string here so the two
// scripts stay in lockstep without an import.
async function extractProfile(page) {
  return page.evaluate(() => {
    const PRESS_PUBLICATIONS = [
      'forbes', 'wsj', 'wall street journal', 'wired', 'the verge', 'techcrunch',
      'gq', 'nyt', 'new york times', 'business insider', 'cnbc', 'bloomberg',
      'fast company', 'mens health', "men's health", 'gear patrol', 'engadget',
      'cnet', 'fortune', 'esquire', 'vogue', 'bbc', 'guardian', 'rolling stone',
    ];
    const h2Count = document.querySelectorAll('h2').length;
    const h3Count = document.querySelectorAll('h3').length;
    const sectionEls = document.querySelectorAll('section, [class*="section"], [class*="Section"]').length;
    const sectionCount = Math.max(h2Count, Math.floor(sectionEls / 2));
    const bodyText = document.body.innerText || '';
    const totalTextLength = bodyText.split(/\s+/).filter(Boolean).length;
    const allButtons = Array.from(document.querySelectorAll('button, a[role="button"], a.button, a[class*="cta"], a[class*="CTA"]'));
    const ctaPatterns = /\b(buy|shop|reserve|order|add to cart|get yours|claim|start)\b/i;
    const ctaCount = allButtons.filter((el) => ctaPatterns.test(el.textContent || '')).length;
    const docHeight = document.documentElement.scrollHeight;
    const ctaDensity = docHeight > 0 ? (ctaCount / (docHeight / 1000)) : 0;
    const imgCount = document.querySelectorAll('img').length;
    const sourceCount = document.querySelectorAll('source').length;
    const videos = Array.from(document.querySelectorAll('video'));
    const videosPresent = videos.length > 0;
    const autoplayVideos = videos.filter((v) => v.autoplay).length;
    const quoteIndicators = Array.from(document.querySelectorAll('blockquote, [class*="testimonial"], [class*="Testimonial"], [class*="review"], [class*="Review"]'));
    const seenY = new Set();
    const testimonialsCount = quoteIndicators.filter((el) => {
      const y = Math.round(el.getBoundingClientRect().top / 40) * 40;
      if (seenY.has(y)) return false;
      seenY.add(y);
      return true;
    }).length;
    const lowerBody = bodyText.toLowerCase();
    const pressLogosCount = PRESS_PUBLICATIONS.filter((pub) => lowerBody.includes(pub)).length;
    let ratingValue = null;
    const ratingMatch = bodyText.match(/(\d\.\d)\s*(?:\/\s*5|stars?|out of)/i);
    if (ratingMatch) ratingValue = parseFloat(ratingMatch[1]);
    let reviewCount = null;
    const reviewMatch = bodyText.match(/\b(\d{2,5}(?:,\d{3})*)\s*(?:reviews?|ratings?|customers?)/i);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
    const socialProofIntensity = Math.min(10, Math.round(
      (testimonialsCount * 0.5) +
      (pressLogosCount * 1.0) +
      (ratingValue ? 2 : 0) +
      (reviewCount && reviewCount > 100 ? 2 : 0) +
      (videosPresent ? 1 : 0)
    ));
    const fontSizes = new Set();
    for (const tag of ['h1', 'h2', 'h3', 'p']) {
      document.querySelectorAll(tag).forEach((el) => {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs >= 14) fontSizes.add(Math.round(fs));
      });
    }
    const fontSizeProgression = Array.from(fontSizes).sort((a, b) => b - a).slice(0, 8);
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map((p) => (p.textContent || '').trim().split(/\s+/).filter(Boolean).length)
      .filter((n) => n >= 3);
    paragraphs.sort((a, b) => a - b);
    const median = paragraphs.length > 0 ? paragraphs[Math.floor(paragraphs.length / 2)] : 0;
    const p90 = paragraphs.length > 0 ? paragraphs[Math.floor(paragraphs.length * 0.9)] : 0;
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
      url: window.location.href, captured_at: new Date().toISOString(),
      section_count: sectionCount, h2_count: h2Count, h3_count: h3Count, section_els_count: sectionEls,
      total_text_length: totalTextLength, cta_count: ctaCount, cta_density: parseFloat(ctaDensity.toFixed(2)),
      images_count: imgCount + sourceCount, videos_count: videos.length, videos_present: videosPresent,
      autoplay_videos: autoplayVideos, testimonials_count: testimonialsCount, press_logos_count: pressLogosCount,
      rating_value: ratingValue, review_count: reviewCount, social_proof_intensity: socialProofIntensity,
      font_size_progression: fontSizeProgression, copy_chunks_median_words: median, copy_chunks_p90_words: p90,
      has_faq_schema: hasFaqSchema, has_review_schema: hasReviewSchema, vertical_scroll_height: docHeight,
      title: document.title,
    };
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
const page = await ctx.newPage();
await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1000);
const ours = await extractProfile(page);
await ctx.close();
await browser.close();

// ───────────── Comparison rules ─────────────
// Each rule scored 0-100. Weights sum is normalised — final score is weighted average.
// `severity` flags drive `fix_action` chosen by refine-spec.mjs.
const rules = [
  {
    field: 'section_count',
    ours: ours.section_count, benchmark: benchmark.section_count, weight: 10,
    ok: (o, b) => o >= b * 0.83, // within 17% of benchmark = OK (10 vs 12)
    severity_when_fail: (o, b) => o < b * 0.6 ? 'high' : 'medium',
    fix_action: 'add_supporting_section',
  },
  {
    field: 'total_text_length',
    ours: ours.total_text_length, benchmark: benchmark.total_text_length, weight: 8,
    ok: (o, b) => o >= b * 0.75,
    severity_when_fail: () => 'medium',
    fix_action: 'extend_copy',
  },
  {
    field: 'videos_present',
    ours: ours.videos_present, benchmark: benchmark.videos_present, weight: 12,
    ok: (o, b) => !b || o, // if benchmark has video, we need it too
    severity_when_fail: () => 'high',
    fix_action: 'promote_hero_to_video',
  },
  {
    field: 'images_count',
    ours: ours.images_count, benchmark: benchmark.images_count, weight: 10,
    ok: (o, b) => o >= Math.max(20, b * 0.15), // expect ≥15% of benchmark image count
    severity_when_fail: (o, b) => o < b * 0.05 ? 'high' : 'medium',
    fix_action: 'add_lifestyle_imagery',
  },
  {
    field: 'press_logos_count',
    ours: ours.press_logos_count, benchmark: benchmark.press_logos_count, weight: 10,
    ok: (o, b) => o >= Math.min(b, 3), // need at least min(benchmark, 3)
    severity_when_fail: () => 'medium',
    fix_action: 'add_press_logos_section',
  },
  {
    field: 'review_count',
    ours: ours.review_count, benchmark: benchmark.review_count, weight: 6,
    ok: (o) => o !== null && o >= 50,
    severity_when_fail: () => 'low',
    fix_action: 'extend_review_aggregate',
  },
  {
    field: 'cta_count',
    ours: ours.cta_count, benchmark: benchmark.cta_count, weight: 8,
    ok: (o) => o >= 2, // at least 2 CTAs in body (not counting header/footer)
    severity_when_fail: () => 'medium',
    fix_action: 'add_inline_ctas',
  },
  {
    field: 'has_faq_schema',
    ours: ours.has_faq_schema, benchmark: true, weight: 6,
    ok: (o) => o === true,
    severity_when_fail: () => 'medium',
    fix_action: 'ensure_faq_section',
  },
  {
    field: 'social_proof_intensity',
    ours: ours.social_proof_intensity, benchmark: benchmark.social_proof_intensity, weight: 10,
    ok: (o, b) => o >= b * 0.7,
    severity_when_fail: () => 'medium',
    fix_action: 'extend_social_proof',
  },
  {
    field: 'vertical_scroll_height',
    ours: ours.vertical_scroll_height, benchmark: benchmark.vertical_scroll_height, weight: 6,
    ok: (o, b) => o >= b * 0.5,
    severity_when_fail: () => 'low',
    fix_action: 'add_supporting_section',
  },
  {
    field: 'copy_chunks_median_words',
    ours: ours.copy_chunks_median_words, benchmark: benchmark.copy_chunks_median_words, weight: 4,
    ok: (o, b) => o <= b * 2.0, // our paragraphs shouldn't be more than 2x benchmark median
    severity_when_fail: () => 'low',
    fix_action: 'tighten_copy',
  },
];

const totalWeight = rules.reduce((s, r) => s + r.weight, 0);
let scoreSum = 0;
const gaps = [];
const passes = [];

for (const r of rules) {
  const ok = r.ok(r.ours, r.benchmark);
  if (ok) {
    scoreSum += r.weight;
    passes.push({ field: r.field, ours: r.ours, benchmark: r.benchmark });
  } else {
    gaps.push({
      field: r.field,
      ours: r.ours,
      benchmark: r.benchmark,
      severity: r.severity_when_fail(r.ours, r.benchmark),
      fix_action: r.fix_action,
      weight: r.weight,
    });
  }
}

const benchmarkScore = Math.round((scoreSum / totalWeight) * 100);

// Sort gaps: high severity first, then by weight desc
const SEV_ORDER = { high: 0, medium: 1, low: 2 };
gaps.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.weight - a.weight);

const verdict = {
  benchmark_score: benchmarkScore,
  pass_threshold: 85,
  pass: benchmarkScore >= 85,
  benchmark_url: benchmark.url,
  ours_url: ours.url,
  gaps,
  passes,
  ours_profile: ours,
  benchmark_profile: benchmark,
};

process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
