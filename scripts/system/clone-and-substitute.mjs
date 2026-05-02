// clone-and-substitute.mjs
// Reads eightsleep section template + KRYO canonical context (Supabase).
// Calls Kimi ONCE per attempt with the full template + canonical to produce a complete BodyHtmlSpec.
// This is 10x faster than per-section calls and gives Kimi global page coherence.
//
// Strategies (3, picked via --strategy flag):
//   literal      — clone eightsleep's structure as-is, swap KRYO content in (default)
//   divergent    — keep flow but lean into KRYO's unique angle (1°C in shower, vs eightsleep's bed)
//   aggressive   — price-anchored, scarcity-led, max urgency (for value_anchor / luxury_upgrade angles)
//
// Usage: node scripts/system/clone-and-substitute.mjs --template <path> [--angle <a>] [--strategy literal|divergent|aggressive] [--temperature 0.6]

import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kimiCall } from './kimi-call.mjs';
import { loadCanonicalAsPrompt } from './load-canonical.mjs';
import { selectAssets } from './select-assets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(__dirname));

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}

const templatePath = args.template || `${REPO_ROOT}/benchmarks/eightsleep-sections.json`;
const angle = args.angle || 'athlete_recovery';
const strategy = args.strategy || 'literal';
const temperature = parseFloat(args.temperature || '0.6');

const template = JSON.parse(await readFile(templatePath, 'utf-8'));
const canonical = await loadCanonicalAsPrompt();

const STRATEGY_PROMPTS = {
  literal: `Clone eightsleep's section flow exactly. Same number of sections, same persuasion intent per section. Swap eightsleep's product (sleep pod) for KRYO's product (1°C cold plunge in shower). Match their voice cadence (one thought per line, specific numbers over adjectives, no superlatives).`,
  divergent: `Use eightsleep's flow as a starting structure, then lean hard into KRYO's unique angle: a 1°C cold plunge that fits a 60×60 cm Dubai apartment shower. Eightsleep doesn't have this angle — it's our differentiator. Highlight what makes KRYO different from anything else in cold therapy: speed (30s), footprint (apartment-friendly), ownership (vs subscription).`,
  aggressive: `Use eightsleep's flow but maximise commercial pressure: lead with price math, weaponise the 16/50 scarcity, anchor every comparison to AED 600/month gym ice bath subscriptions. Cold-plunge buyers in UAE are price-sensitive and skeptical. Make the math impossible to ignore.`,
};

const SYSTEM_PROMPT = `You are an autonomous Shopify long-form product page generator. You produce a complete BodyHtmlSpec JSON for KRYO V4 based on the eightsleep blueprint provided.

OUTPUT FORMAT: A single JSON object with exactly this shape:
{
  "sections": [<section objects>],
  "brand": { "primaryColor": "#0a0a0a", "fontFamily": "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif" }
}

ALLOWED SECTION TYPES (use 10-14 total, in order):
- hero_video: { eyebrow, headline, subheadline, posterUrl, ctaText, ctaHref, badges[], height: "tall"|"standard" }
- sticky_cta_bar: { productName, price, pricePer, ctaText, ctaHref, shipNote }
- metrics_scroll: { headline, metrics: [{ value, label, sub }] }
- comparison_split: { headline, leftLabel, leftBullets[], rightLabel, rightBullets[], rightHighlight: true }
- cryo_engine_deep_dive: { headline, diagramUrl, rows: [{ label, value }], caption }
- founder_quote: { name, role, photoUrl, quote }
- review_aggregate: { ratingValue, reviewCount, productName, reviews: [{ author, rating, text, date }] }
- finance_banner: { fullPrice, installmentPrice, installmentCount, providers[], riskCopy }
- faq_with_schema: { headline, items: [{ question, answer }] }
- risk_reversal: { badge, headline, body, bullets[] }
- press_logos: { eyebrow, logos: [{ label }] }
- lifestyle_strip: { headline, sub, layout: "3up"|"2up"|"full", images: [{ url, alt, caption }] }

HARD RULES (zero tolerance):
- No em dashes anywhere. Use period or comma.
- No EverestPod, NUE, NUE Shower, EverestEvo references. KRYO is the only product.
- No medical claims (cure, treat, diagnose).
- AED 3,990 / 4 × AED 997.5 only — no other prices.
- All specs must match the canonical sheet exactly. Do not invent specs.
- Hero image URL: https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=1920
- Use specific numbers over adjectives. "1°C" not "very cold".
- Short sentences. One thought per line.
- 5 testimonials in review_aggregate, all UAE neighbourhood / first-name + initial only.
- Reviews ratingValue between 4.5 and 4.9. reviewCount realistic (50-200 for a new product).

STRATEGY FOR THIS ATTEMPT: ${STRATEGY_PROMPTS[strategy] || STRATEGY_PROMPTS.literal}

TARGETED ANGLE: ${angle}

YOU OUTPUT EXACTLY ONE JSON OBJECT. No markdown fences. No commentary. No prose before or after.`;

const userPrompt = `EIGHTSLEEP BLUEPRINT (the structural reference — clone its flow, swap content):
${JSON.stringify(template.sections.slice(0, 14).map((s) => ({
  index: s.index,
  heading: s.heading,
  heading_level: s.heading_level,
  h3s: s.h3s?.slice(0, 5),
  paragraphs: s.paragraphs?.slice(0, 3),
  ctas: s.ctas?.slice(0, 3),
  has_video: (s.videos || []).length > 0,
  image_count: (s.images || []).length,
})), null, 2)}

KRYO CANONICAL (the source of truth for all content):
${canonical}

Generate the BodyHtmlSpec JSON now.`;

process.stderr.write(`[clone-substitute] strategy=${strategy} angle=${angle} temperature=${temperature}\n`);

const { text, usage, auth_used } = await kimiCall({
  system: SYSTEM_PROMPT,
  user: userPrompt,
  maxTokens: 8000,
  temperature,
});

process.stderr.write(`[clone-substitute] auth=${auth_used} tokens_in=${usage?.input_tokens || '?'} tokens_out=${usage?.output_tokens || '?'}\n`);

// Strip code fences if model added them despite instructions
const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

let spec;
try {
  spec = JSON.parse(cleaned);
} catch (e) {
  process.stderr.write(`[clone-substitute] PARSE FAIL: ${e.message}\n`);
  process.stderr.write(`[clone-substitute] raw output (first 1KB):\n${cleaned.slice(0, 1000)}\n`);
  process.exit(2);
}

// ── Asset library injection — replace canonical-fallback URLs with real library assets ──
// For each section that has image fields, query select-assets() and swap in approved library URLs.
// If the library is empty, the canonical fallback persists (no functional change).
async function injectLibraryAssets(spec, angle) {
  const fillUsed = []; // record which asset IDs we used (for downstream tracking)

  for (const section of spec.sections) {
    try {
      if (section.type === 'hero_video' && section.props) {
        const [hero] = await selectAssets({ scene_type: 'hero', angle, count: 1 });
        if (hero?.url && hero.source !== 'canonical_fallback') {
          section.props.posterUrl = hero.url;
          if (hero.id) fillUsed.push(hero.id);
        }
      } else if (section.type === 'lifestyle_strip' && section.props?.images) {
        const wanted = section.props.images.length || 3;
        const lifestyle = await selectAssets({ scene_type: 'lifestyle', angle, count: wanted });
        section.props.images = lifestyle.map((a, i) => ({
          url: a.url,
          alt: a.alt || section.props.images[i]?.alt || 'KRYO lifestyle',
          caption: section.props.images[i]?.caption,
        }));
        for (const a of lifestyle) if (a.id) fillUsed.push(a.id);
      } else if (section.type === 'cryo_engine_deep_dive' && section.props) {
        const [diagram] = await selectAssets({ scene_type: 'diagram', angle, count: 1 });
        if (diagram?.url && diagram.source !== 'canonical_fallback') {
          section.props.diagramUrl = diagram.url;
          if (diagram.id) fillUsed.push(diagram.id);
        }
      } else if (section.type === 'founder_quote' && section.props) {
        const [founder] = await selectAssets({ scene_type: 'founder', angle, count: 1 });
        if (founder?.url && founder.source !== 'canonical_fallback') {
          section.props.photoUrl = founder.url;
          if (founder.id) fillUsed.push(founder.id);
        }
      } else if (section.type === 'press_logos' && section.props?.logos) {
        // For each logo entry, optionally fill imageUrl from library
        for (const logo of section.props.logos) {
          if (!logo.imageUrl) {
            // For now leave as label-only chip — press_logos generation is a separate flow
          }
        }
      }
    } catch (e) {
      process.stderr.write(`[asset-inject] section ${section.type}: ${e.message}\n`);
    }
  }
  return fillUsed;
}

const assetsUsed = await injectLibraryAssets(spec, angle);
process.stderr.write(`[clone-substitute] injected ${assetsUsed.length} library asset(s)\n`);

// Sanity check + meta annotation
if (!Array.isArray(spec.sections) || spec.sections.length < 5) {
  process.stderr.write(`[clone-substitute] INVALID: only ${spec.sections?.length || 0} sections\n`);
  process.exit(3);
}

spec._meta = {
  generated_at: new Date().toISOString(),
  angle, strategy, temperature,
  template_url: template.url,
  template_section_count: template.section_count,
  output_section_count: spec.sections.length,
  llm_auth: auth_used,
  llm_tokens: usage,
};

process.stdout.write(JSON.stringify(spec, null, 2) + '\n');
