// Inspector C — Creative inspector.
// Pure HTML/text inspection. No browser, no network calls (except: optional diff-from-control fetch).
// Runs against the variant's body_html plus a comparison against the canonical kryo_ control.

import { CheckResult, makeVerdict, PartialVerdict } from './rubric';

const META_DISALLOWED_KEYWORDS = [
  // Meta policy disallowed superlatives
  'guaranteed weight loss', 'miracle', 'cure ', 'cures ', 'cured', 'medically proven',
  'fda approved', 'fda-approved', 'clinically proven',
  'best ever', '#1 in the world',
];

const MEDICAL_CLAIM_PATTERNS = [
  // Bodily / disease claims
  /\bcure[ds]?\s+(?:my|your|the)?\s*(diabetes|cancer|depression|anxiety|insomnia|adhd)\b/i,
  /\btreats?\s+(?:diabetes|cancer|depression|insomnia)\b/i,
  /\bdiagnos[ie]s\b/i,
  /\bprevents?\s+(disease|cancer|stroke|heart attack)\b/i,
  /\b(weight\s*loss|fat\s*burn(?:ing|er)?)\s+guarantee/i,
];

const PLACEHOLDER_PATTERNS = [
  /REPLACE_ME/i,
  /\bTODO\b/,
  /\bLorem\s+ipsum\b/i,
  /\bPlaceholder\b/i,
  /\bsection title here\b/i,
  /<<.+?>>/,                      // <<replace_me_token>>
  /\{\{\s*[a-z_]+\s*\}\}/i,      // unrendered Liquid: {{ headline }}
  /\$\{[a-z_]+\}/i,              // unrendered template: ${headline}
];

export interface CreativeInspectionInput {
  variant_body_html: string;
  variant_title: string;
  control_body_html?: string;     // Optional: if provided, diff-vs-control runs.
  control_title?: string;
  ad_headlines?: string[];        // Optional: for Meta-policy headline length check.
  ad_primary_texts?: string[];    // Optional: for Meta primary-text length check.
}

export function inspectCreative(input: CreativeInspectionInput): PartialVerdict {
  const checks: CheckResult[] = [];
  const html = input.variant_body_html;
  const text = stripHtml(html).trim();

  // 1. No placeholder strings
  const placeholderHits = PLACEHOLDER_PATTERNS.flatMap((p) => {
    const m = html.match(p);
    return m ? [m[0]] : [];
  });
  checks.push({
    check: 'no_placeholder_strings',
    pass: placeholderHits.length === 0,
    detail: placeholderHits.length ? `Found: ${placeholderHits.slice(0, 3).join(', ')}` : undefined,
    weight: 4,
  });

  // 2. No em dashes (Tom rule)
  const emDashHits = html.match(/—|—/g) ?? [];
  checks.push({
    check: 'no_em_dashes',
    pass: emDashHits.length === 0,
    detail: emDashHits.length ? `${emDashHits.length} em dash(es) found` : undefined,
    weight: 2,
  });

  // 3. Meta disallowed keywords
  const lowerText = text.toLowerCase();
  const disallowedHits = META_DISALLOWED_KEYWORDS.filter((kw) => lowerText.includes(kw));
  checks.push({
    check: 'no_meta_disallowed_keywords',
    pass: disallowedHits.length === 0,
    detail: disallowedHits.length ? `Found: ${disallowedHits.join(', ')}` : undefined,
    weight: 3,
  });

  // 4. No medical claims
  const medicalHits = MEDICAL_CLAIM_PATTERNS.flatMap((p) => {
    const m = text.match(p);
    return m ? [m[0]] : [];
  });
  checks.push({
    check: 'no_medical_claims',
    pass: medicalHits.length === 0,
    detail: medicalHits.length ? `Found: ${medicalHits.slice(0, 2).join(', ')}` : undefined,
    weight: 4,
  });

  // 5. Headline length (Meta ad rule, if ad_headlines provided)
  if (input.ad_headlines?.length) {
    const overLimit = input.ad_headlines.filter((h) => h.length > 40);
    checks.push({
      check: 'headline_under_40',
      pass: overLimit.length === 0,
      detail: overLimit.length ? `${overLimit.length} headlines >40 chars (max: ${Math.max(...input.ad_headlines.map((h) => h.length))})` : undefined,
      weight: 2,
    });
  }

  // 6. Primary text length (Meta ad rule, if ad_primary_texts provided)
  if (input.ad_primary_texts?.length) {
    const overLimit = input.ad_primary_texts.filter((p) => p.length > 125);
    checks.push({
      check: 'primary_text_under_125',
      pass: overLimit.length === 0,
      detail: overLimit.length ? `${overLimit.length} primary texts >125 chars (max: ${Math.max(...input.ad_primary_texts.map((p) => p.length))})` : undefined,
      weight: 2,
    });
  }

  // 7. Value prop in first 2 sentences (heuristic: contains a price, % number, or product name)
  const firstTwoSentences = text.split(/[.!?]/).slice(0, 2).join('. ');
  const hasValueMarker = /\b(AED\s*[\d,]+|\d+\s*(?:°C|degrees|seconds|minutes|min|day|days|month|months)|KRYO)\b/i.test(firstTwoSentences);
  checks.push({
    check: 'value_prop_in_first_two_lines',
    pass: hasValueMarker,
    detail: hasValueMarker ? undefined : 'No price, spec number, or KRYO mention in first 2 sentences',
    weight: 2,
  });

  // 8. Meaningfully different from control (if control body provided)
  if (input.control_body_html) {
    const variantText = text;
    const controlText = stripHtml(input.control_body_html).trim();
    const sim = jaccardSimilarity(variantText, controlText);
    // Pass if 0.20 ≤ sim ≤ 0.85 (we want some similarity — same product — but not identical).
    const meaningfullyDifferent = sim >= 0.20 && sim <= 0.85;
    checks.push({
      check: 'meaningfully_different_from_control',
      pass: meaningfullyDifferent,
      detail: !meaningfullyDifferent
        ? sim > 0.85
          ? `Too similar to control (jaccard ${sim.toFixed(2)}, max 0.85). Variant didn't differentiate.`
          : `Too dissimilar (jaccard ${sim.toFixed(2)}, min 0.20). Variant lost product identity.`
        : undefined,
      weight: 2,
    });
  }

  return makeVerdict('creative', checks);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4),
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let intersection = 0;
  sa.forEach((w) => { if (sb.has(w)) intersection++; });
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
