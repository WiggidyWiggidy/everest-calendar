// QC firewall rubric — pass/fail thresholds for the 3-inspector council.
// All 3 inspectors return PartialVerdicts; rubric.ts unifies them into the final QcResult.
//
// PRINCIPLE: deterministic. No retries inside the rubric, no LLM judgment, no fuzzy matching.
// Borderline scores fail. Surface to Tom; do NOT auto-retry. (Per CLAUDE.md circuit-breaker rule.)

export type CheckId =
  // Visual (Inspector A)
  | 'desktop_screenshot'
  | 'mobile_screenshot'
  | 'tablet_screenshot'
  | 'hero_loaded'
  | 'h1_present'
  | 'no_console_errors'
  | 'cart_drawer_dom'
  | 'no_disallowed_animation_libs'
  | 'parent_column_not_narrow'
  // Visual content
  | 'no_placeholder_strings'
  | 'no_em_dashes'
  | 'jsonld_product_present'
  | 'jsonld_faq_present'
  | 'jsonld_parses_cleanly'
  // Functional (Inspector B)
  | 'all_links_2xx'
  | 'all_images_2xx'
  | 'add_to_cart_clickable'
  | 'cart_drawer_opens'
  | 'mobile_no_horizontal_scroll'
  | 'tap_targets_min_44px'
  | 'lcp_under_3s_mobile'
  // Creative (Inspector C)
  | 'primary_text_under_125'
  | 'headline_under_40'
  | 'no_meta_disallowed_keywords'
  | 'no_medical_claims'
  | 'value_prop_in_first_two_lines'
  | 'meaningfully_different_from_control';

export interface CheckResult {
  check: CheckId;
  pass: boolean;
  detail?: string;
  weight?: number;
}

export interface PartialVerdict {
  inspector: 'visual' | 'functional' | 'creative';
  pass: boolean;
  score: number;
  max_score: number;
  failed_checks: CheckResult[];
  passed_checks: CheckResult[];
  artifacts?: { desktop_screenshot_url?: string; mobile_screenshot_url?: string; diagnostics_path?: string };
}

export interface QcResult {
  pass: boolean;
  unanimous: boolean;
  total_score: number;
  total_max: number;
  pass_threshold: number;
  inspectors: { visual: PartialVerdict; functional: PartialVerdict; creative: PartialVerdict };
  failed_checks: CheckResult[];
  one_line_summary: string;
}

export const PASS_THRESHOLD_PCT = 90; // Council requires unanimous (each inspector pass=true) AND ≥90% of weighted score.

// Hard-fail checks — any one of these false = whole council fails, regardless of overall score.
// These exist because some failures are not score-able (e.g. broken image is broken).
export const HARD_FAIL_CHECKS: CheckId[] = [
  'desktop_screenshot',
  'mobile_screenshot',
  'hero_loaded',
  'h1_present',
  'no_placeholder_strings',
  'no_em_dashes',
  'jsonld_parses_cleanly',
  'all_images_2xx',
  'parent_column_not_narrow',
  'no_medical_claims',
];

export function unify(
  visual: PartialVerdict,
  functional: PartialVerdict,
  creative: PartialVerdict,
): QcResult {
  const allFailed = [...visual.failed_checks, ...functional.failed_checks, ...creative.failed_checks];
  const totalScore = visual.score + functional.score + creative.score;
  const totalMax = visual.max_score + functional.max_score + creative.max_score;
  const passThresholdAbs = Math.ceil(totalMax * (PASS_THRESHOLD_PCT / 100));

  const unanimous = visual.pass && functional.pass && creative.pass;

  const hardFailHit = allFailed.some((c) => HARD_FAIL_CHECKS.includes(c.check));
  const scoreOk = totalScore >= passThresholdAbs;

  const overallPass = unanimous && scoreOk && !hardFailHit;

  let summary: string;
  if (overallPass) {
    summary = `KRYO variant passed all 3 inspectors (${totalScore}/${totalMax}).`;
  } else if (hardFailHit) {
    const hardFails = allFailed.filter((c) => HARD_FAIL_CHECKS.includes(c.check));
    summary = `KRYO variant hard-failed on: ${hardFails.map((c) => c.check).join(', ')}.`;
  } else if (!unanimous) {
    const failingInspectors = [
      !visual.pass && 'visual',
      !functional.pass && 'functional',
      !creative.pass && 'creative',
    ]
      .filter(Boolean)
      .join(', ');
    summary = `KRYO variant rejected by ${failingInspectors} inspector(s).`;
  } else {
    summary = `KRYO variant scored ${totalScore}/${totalMax} (need ${passThresholdAbs}).`;
  }

  return {
    pass: overallPass,
    unanimous,
    total_score: totalScore,
    total_max: totalMax,
    pass_threshold: passThresholdAbs,
    inspectors: { visual, functional, creative },
    failed_checks: allFailed,
    one_line_summary: summary,
  };
}

// Helper for inspectors to construct their verdicts.
export function makeVerdict(
  inspector: 'visual' | 'functional' | 'creative',
  results: CheckResult[],
  artifacts?: PartialVerdict['artifacts'],
): PartialVerdict {
  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);
  const score = passed.reduce((sum, r) => sum + (r.weight ?? 1), 0);
  const max_score = results.reduce((sum, r) => sum + (r.weight ?? 1), 0);
  // Hard-fail checks make the whole inspector fail.
  const hardFailHit = failed.some((c) => HARD_FAIL_CHECKS.includes(c.check));
  const pass = failed.length === 0 || (!hardFailHit && score >= max_score * (PASS_THRESHOLD_PCT / 100));
  return { inspector, pass, score, max_score, failed_checks: failed, passed_checks: passed, artifacts };
}
