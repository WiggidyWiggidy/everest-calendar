#!/usr/bin/env node
/**
 * Instrument-validation gate.
 *
 * Implements marketing/data-contracts/instrument-validation.md as an executable check,
 * because prose rules demonstrably did not bind: on 2026-07-31 the rule "confidence capped
 * by n" was written to disk and violated in the same session ("CPA A$177.51" on n=3).
 *
 * Exit 0 = claim may be published.  Exit 1 = BLOCKED, failing checks named.
 *
 * Usage:
 *   node marketing/evals/validate-claim.mjs \
 *     --claim "CPA is A$205 per KRYO unit" \
 *     --instrument "shopify orders.json + Tom-attested Feb/Mar" \
 *     --n 5 --counted 5 --total 5 --fresh --enumerated --grain source
 *
 * Flags:
 *   --claim <text>          the claim being made (required)
 *   --instrument <text>     what produced the reading (required)
 *   --n <int>               sample size (required)
 *   --counted <int>         records actually received
 *   --total <int>           independent count of records that exist
 *   --fresh                 source was refreshed immediately before reading
 *   --as-of <ts>            ...or its as-of timestamp
 *   --enumerated            for search/filter claims: enumerated before filtering
 *   --grain <source|aggregate|derived>
 *   --inputs-validated      for derived claims: every input passed this gate
 *   --absence               the claim asserts something does NOT exist
 *   --label <FACT|PATTERN|HYPOTHESIS|UNKNOWN>
 *   --json                  machine-readable output
 */

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : (argv[i + 1]?.startsWith('--') ? true : argv[i + 1]); };
const has = (k) => argv.includes(`--${k}`);

const claim      = arg('claim');
const instrument = arg('instrument');
const n          = arg('n') !== null ? parseInt(arg('n'), 10) : null;
const counted    = arg('counted') !== null ? parseInt(arg('counted'), 10) : null;
const total      = arg('total') !== null ? parseInt(arg('total'), 10) : null;
const grain      = arg('grain');
const label      = (arg('label') || '').toUpperCase();
const asOf       = arg('as-of');

const fail = [];
const warn = [];

// -- gate 0: the claim must declare its instrument at all -------------------
if (!claim)      fail.push('NO_CLAIM: --claim is required.');
if (!instrument) fail.push('NO_INSTRUMENT: every reading must name what produced it. An output with no instrument is not evidence.');
if (n === null || Number.isNaN(n)) fail.push('NO_N: sample size is required. If unknown, the claim is UNKNOWN.');

// -- check 1: COMPLETENESS --------------------------------------------------
if (counted !== null && total !== null && counted !== total) {
  fail.push(`TRUNCATED: received ${counted} of ${total} records (${(100*counted/total).toFixed(1)}%). ` +
            `Report as "${counted} visible of ${total} total". Do not compute rates without stating the window. ` +
            `[live example: Shopify read_orders sees only 60 days — 5 of 791]`);
}
if (has('absence')) {
  if (counted === null || total === null)
    fail.push('ABSENCE_WITHOUT_COUNT: asserting something does not exist requires an independent count ' +
              '(--counted and --total). Absence is a claim about the instrument until proven otherwise.');
  if (!has('enumerated'))
    fail.push('ABSENCE_WITHOUT_ENUMERATION: prove the query can match a known-present instance before ' +
              'concluding absence. [live example: DOM scan filtered on "buy|cart" missed a bar labelled "Choose Model"]');
}

// -- check 2: FRESHNESS -----------------------------------------------------
if (!has('fresh') && !asOf) {
  fail.push('NO_FRESHNESS: source must be refreshed immediately before reading (--fresh) or carry ' +
            'an --as-of timestamp. [live example: stale git ref reported main 42 commits behind reality]');
}

// -- check 3: FILTER FIDELITY ----------------------------------------------
if (/\b(no|none|zero|absent|does ?n.?t exist|nothing)\b/i.test(claim || '') && !has('enumerated')) {
  fail.push('NEGATIVE_CLAIM_WITHOUT_ENUMERATION: this claim asserts absence. Enumerate first, filter second.');
}

// -- check 3b: FILTER COMPLETENESS ------------------------------------------
// A filter that applies SOME of its required rules produces a confident, well-sampled,
// wrong number. Distinct from filter *fidelity* (can it match?) — this is: are ALL the
// canonical exclusions applied? [live example: "preview traffic overstates ATC by 24%"
// applied the host rule only, omitting anon_id + referrer rules; true figure was ~180%.]
const filteredPopulation = /\b(traffic|sessions?|users?|visitors?|orders?|events?|cohort|segment|clean|excluding|filtered)\b/i.test(claim || '');
if (filteredPopulation && !has('filter-complete')) {
  fail.push('FILTER_COMPLETENESS_UNPROVEN: this claim rests on a filtered population. Assert --filter-complete ' +
            'only after checking the filter against the canonical definition (metric-definitions.md §0 / ' +
            'marketing_touches_clean: is_internal, bot, everestlabs.co host, team anon_ids, admin referrers). ' +
            'A partial filter yields a confident wrong number.');
}

// -- check 4: GRAIN & PROVENANCE -------------------------------------------
if (!grain) {
  fail.push('NO_GRAIN: state --grain source|aggregate|derived.');
} else if (grain === 'aggregate' && label === 'FACT') {
  fail.push('AGGREGATE_AS_FACT: an aggregate is not evidence about what it aggregates until reconciled ' +
            'with the source system. [live example: shopify_funnel_daily double-counted upsells -> "6 sales" was 2]');
} else if (grain === 'derived' && !has('inputs-validated')) {
  fail.push('DERIVED_WITHOUT_VALIDATED_INPUTS: a derived claim inherits the weakest input. Validate every ' +
            'input or the output is UNKNOWN. [live example: AOV = verbal "$10k" / unconfirmed count -> fabricated]');
}

// -- check 5: SAMPLE ADEQUACY ----------------------------------------------
if (n !== null && !Number.isNaN(n)) {
  const rateLike = /\b(rate|CPA|AOV|ROAS|MER|CTR|conversion|per |%)\b/i.test(claim || '');
  if (n <= 2 && rateLike)
    fail.push(`SAMPLE_TOO_SMALL: n=${n} cannot support a rate or verdict. State the raw counts only.`);
  if (n < 30 && label === 'FACT' && rateLike)
    warn.push(`n=${n} < 30: a rate at this n is DIRECTIONAL, not FACT. Downgrade the label.`);
  const precise = (claim || '').match(/\d+\.\d{2,}/);
  if (n < 30 && precise)
    fail.push(`FALSE_PRECISION: "${precise[0]}" implies precision n=${n} cannot support. Round it ` +
              `(e.g. "≈${Math.round(parseFloat(precise[0]))}"). [live example: "CPA A$177.51" on n=3]`);
}

// -- report -----------------------------------------------------------------
const ok = fail.length === 0;
if (has('json')) {
  console.log(JSON.stringify({ ok, claim, instrument, n, failures: fail, warnings: warn }, null, 1));
} else {
  console.log(`\n  CLAIM      ${claim || '(none)'}`);
  console.log(`  INSTRUMENT ${instrument || '(none)'}`);
  console.log(`  n          ${n ?? '(none)'}\n`);
  for (const f of fail) console.log(`  ✗ BLOCKED  ${f}\n`);
  for (const w of warn) console.log(`  ! WARN     ${w}\n`);
  console.log(ok ? '  ✓ PASS — instrument validated, claim may be published.\n'
                 : `  ✗ FAIL — ${fail.length} check(s) failed. This claim must not be published as-is.\n`);
}
process.exit(ok ? 0 : 1);
