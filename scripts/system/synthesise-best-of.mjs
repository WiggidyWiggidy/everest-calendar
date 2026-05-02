// synthesise-best-of.mjs
// 4th attempt: takes the 3 attempted BodyHtmlSpec JSON files + their QC verdicts,
// asks Kimi to merge the best sections from each into one synthesised spec.
//
// Strategy: per section position, pick the section from whichever attempt scored highest
// on that section's contribution. Then ask Kimi to harmonise voice/transitions across the merge.
//
// Usage: node scripts/system/synthesise-best-of.mjs --attempts <spec1.json,spec2.json,spec3.json> --verdicts <v1.json,v2.json,v3.json>
// Outputs: synthesised BodyHtmlSpec JSON to stdout.

import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kimiCall } from './kimi-call.mjs';
import { loadCanonicalAsPrompt } from './load-canonical.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}

if (!args.attempts) { console.error('Usage: --attempts <spec1.json,spec2.json,...>'); process.exit(2); }
const attemptPaths = args.attempts.split(',');
const attempts = await Promise.all(attemptPaths.map(async (p) => JSON.parse(await readFile(p, 'utf-8'))));

const canonical = await loadCanonicalAsPrompt();

const SYSTEM = `You are a Shopify product page synthesiser. You receive 3 candidate BodyHtmlSpec drafts for the SAME KRYO V4 product page. Each draft used a different generation strategy (literal clone of eightsleep / KRYO-divergent / price-aggressive). Your job is to pick the strongest section from each draft and merge them into one final BodyHtmlSpec.

DECISION RULES per section position:
- Hero: pick the headline that is shortest AND contains a specific number (1°C, 30 seconds, AED 3,990).
- Comparison: pick the version with the sharpest math anchor (cost-per-month / break-even framing).
- Founder quote: pick the most concrete, time-stamped, personal version. Reject "we believe" platitudes.
- FAQ: pick the version with shortest answers per question. Eight Sleep cadence.
- Risk reversal: pick the version with the most specific "if X then Y" promise.
- Other sections: pick whichever has the most specific numbers and least adjective stacking.

OUTPUT: ONE BodyHtmlSpec JSON. No markdown fences. No prose.

HARD RULES (zero tolerance, applied during merge):
- No em dashes anywhere. Replace with period or comma.
- No EverestPod, NUE, EverestEvo. KRYO is the only product.
- No medical claims (cure, treat, diagnose).
- AED 3,990 / 4 × AED 997.5 only.
- Specs must match canonical exactly.

Allowed section types: hero_video, sticky_cta_bar, metrics_scroll, comparison_split, cryo_engine_deep_dive, founder_quote, review_aggregate, finance_banner, faq_with_schema, risk_reversal, press_logos, lifestyle_strip.`;

const userPrompt = `KRYO CANONICAL (source of truth — overrides anything in the candidates that conflicts):
${canonical}

CANDIDATE DRAFTS (3, generated with different strategies):

DRAFT A (strategy: ${attempts[0]?._meta?.strategy || 'unknown'}, score: see verdict A):
${JSON.stringify(attempts[0]?.sections, null, 2)}

DRAFT B (strategy: ${attempts[1]?._meta?.strategy || 'unknown'}):
${JSON.stringify(attempts[1]?.sections, null, 2)}

DRAFT C (strategy: ${attempts[2]?._meta?.strategy || 'unknown'}):
${JSON.stringify(attempts[2]?.sections, null, 2)}

Synthesise the strongest BodyHtmlSpec by picking the best section per position. Output ONE JSON object.`;

const { text, usage, auth_used } = await kimiCall({
  system: SYSTEM,
  user: userPrompt,
  maxTokens: 12000,
  temperature: 0.4, // lower temp for synthesis (more deterministic merge decisions)
});

process.stderr.write(`[synthesise] auth=${auth_used} tokens_in=${usage?.input_tokens || '?'} tokens_out=${usage?.output_tokens || '?'}\n`);

const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
const spec = JSON.parse(cleaned);

if (!Array.isArray(spec.sections) || spec.sections.length < 5) {
  process.stderr.write(`[synthesise] INVALID synthesis: ${spec.sections?.length || 0} sections\n`);
  process.exit(3);
}

spec._meta = {
  generated_at: new Date().toISOString(),
  strategy: 'synthesis',
  source_attempts: attemptPaths,
  output_section_count: spec.sections.length,
  llm_auth: auth_used,
  llm_tokens: usage,
};

process.stdout.write(JSON.stringify(spec, null, 2) + '\n');
