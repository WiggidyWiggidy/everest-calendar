# KRYO Baseline Change Protocol

**Purpose:** repeatable operating procedure for high-confidence, non-experiment storefront changes such as factual corrections, broken UX fixes, trust/reassurance improvements, and other changes where the expected downside is low enough that a simultaneous split test is not justified.

**Not for:** new positioning, new offers, new funnels, major CTA architecture, new product choices, or any change where causal learning is the main goal. Those go through the experiment workflow.

## Core operating model

**Research operator decides. Codex executes. Owner approves. Data decides keep/revert.**

Codex must never be asked to discover the marketing answer during this workflow.

The research operator must complete all live reads, research, prioritisation, copy, asset selection, placement, expected effect, monitoring window, and rollback criteria before freezing the task.

Codex receives a frozen manifest and performs deterministic implementation only.

This follows the repository-as-system-of-record / progressive-disclosure pattern: stable doctrine lives here, exact changing values live in one task manifest, and the Codex invocation stays very short.

## Baseline change vs experiment

Use this protocol only when all are true:

1. The current state has an identifiable deficiency, bug, stale/fake factual statement, missing purchase-critical information, or clear trust/usability gap.
2. The proposed change has strong directional evidence or fixes objective correctness.
3. It preserves the main commercial hypothesis and purchase mechanics unless the defect itself is in those mechanics.
4. We do not need isolated causal attribution to the individual change.
5. A clean rollback is possible.

If any are false, route to the KRYO experiment process instead.

## Roles

### Research operator

Before Codex runs:

- read current Shopify/Supabase/Meta state as relevant;
- identify exact target resources and immutable IDs;
- snapshot current values and timestamps;
- decide every old → new value;
- select exact assets and order;
- define allowed mutation surfaces;
- define forbidden changes;
- define preview method;
- define precondition/drift checks;
- define approval gate;
- define live verification checks;
- define monitoring metrics, sample/time gates, and rollback rule;
- freeze one task manifest.

The research operator resolves drift. Codex does not.

### Codex executor

Codex:

- reads only the named Skill and named frozen manifest plus the exact implementation surfaces named by them;
- does not research marketing, competitors, copy, CRO, Shopify docs, or alternative implementations;
- does not broaden scope;
- does not refactor or clean unrelated code;
- stops on any precondition mismatch;
- never infers owner approval;
- executes exact approved bytes/operations after approval;
- verifies every write by rereading the changed live resource.

### Owner

The owner visually reviews the prepared preview/review packet and explicitly approves or rejects it.

### Measurement operator

After live deployment, evaluate only data after the recorded deployment timestamp. Keep or revert using the frozen monitoring rules. A baseline release is a regression-controlled release, not a causal A/B test.

## Lifecycle

`DRAFT_RESEARCH`
→ `FROZEN_FOR_REVIEW_BUILD`
→ `REVIEW_READY`
→ `APPROVED`
→ `LIVE_DEPLOYING`
→ `LIVE_VERIFIED`
→ `MONITORING`
→ `KEPT` or `REVERTED`

No state may be skipped.

## Frozen task manifest requirements

Every task must contain:

- unique task ID;
- task class = `BASELINE_CHANGE`;
- current status;
- research/freeze timestamp;
- product/theme/template identifiers;
- source snapshot timestamp/version;
- exact precondition sentinels;
- exact review target;
- exact preview URL;
- exact JSON/text operations;
- exact assets and desired order;
- explicitly allowed resources;
- explicitly forbidden resources/behaviours;
- review acceptance checklist;
- approval gate;
- exact production operation;
- rollback snapshot requirements;
- live verification checklist;
- monitoring start definition;
- keep/investigate/revert rules.

No placeholders may remain when status becomes `FROZEN_FOR_REVIEW_BUILD`.

## Drift rule

A frozen task is valid only for the live state it was researched against.

Before REVIEW_BUILD and again before DEPLOY_APPROVED, Codex checks every manifest precondition.

If any sentinel differs, Codex must output:

`PRECONDITION_DRIFT`

followed only by the mismatched fields and observed values, then stop.

Codex must not update copy, counts, dates, IDs, paths, or implementation to accommodate drift. The research operator rereads live state and issues a new manifest revision.

## Two mutation surfaces

### 1. Template-scoped changes

Examples: copy, section settings, block insertion/order, reassurance text.

Safe review process:

1. Clone the exact live product template to a unique review suffix.
2. Apply only the frozen operations to the review template.
3. Verify the source/live template is unchanged.
4. Review with Shopify alternate-template preview:
   `https://everestlabs.co/products/<handle>?view=<review-suffix>&country=AE`
5. Stop at `REVIEW_READY`.
6. After explicit approval, use the exact approved review-template bytes to overwrite the original live template key.
7. Do not regenerate the changes at deployment time.
8. Reread the live asset and compare required sentinels.

### 2. Product-scoped changes

Examples: product media/gallery relationships and ordering.

Product media is attached to the product, not to a product template, so it cannot be faithfully sandboxed by an alternate template alone.

For a baseline task:

1. Freeze exact source media URLs, alt text, and desired order in the manifest.
2. Include them in the owner review packet without mutating the live product.
3. Only after owner approval, execute the exact frozen product mutation.
4. Capture returned media IDs.
5. Execute the frozen reorder rule using those returned IDs.
6. Reread the product media and verify final order.
7. Rollback uses the pre-deployment media snapshot.

Do not create a duplicate product merely to preview product-level media unless the manifest explicitly requires a fully faithful product-level sandbox.

## Approval gate

`REVIEW_BUILD` is never allowed to mutate:

- the original live template;
- live product media;
- price;
- variants;
- inventory;
- cart/checkout;
- tracking;
- Meta.

The phase ends with `REVIEW_READY` and stops.

Only an explicit owner instruction to run `DEPLOY_APPROVED` permits production writes.

## Rollback requirements

Immediately before production writes, capture:

- exact current live-template bytes;
- source template key and Shopify update timestamp if available;
- product status / variant / inventory sentinels relevant to the task;
- current product-media IDs, URLs and order if media will change;
- UTC timestamp.

Do not delete the review artifact until the monitoring decision is `KEPT` or the rollback has completed.

If rollback is required, restore exact pre-deployment state. Do not create a third interpretation of the page.

## Verification

Every production write is followed immediately by a live reread.

A deployment is not complete because the write API returned 200. It is complete only when the reread confirms the frozen acceptance criteria.

Output one of:

- `LIVE_VERIFIED`
- `LIVE_VERIFY_FAILED`

On verification failure, stop and report the exact mismatch. Do not improvise a repair unless the manifest explicitly contains the repair operation.

## Monitoring doctrine

Baseline releases are judged for regression, not isolated causality.

Use only traffic/events after `deployed_at_utc`.

Always separate:

- delivery quality: Meta spend, CTR, CPC, LPV, cost/LPV when freshness is proven;
- onsite intent: clean LPV → ATC, cart progression, checkout;
- mature outcome: purchase, CPA, ROAS/revenue after known purchase lag;
- technical quality: wrong destination, errors, market/currency, broken CTA, tracking loss.

Do not compare cost metrics from stale Meta mirrors.

The frozen task sets the exact gates. For current KRYO traffic, a typical baseline-release pattern is:

- ~25 clean paid LPVs: technical/regression checkpoint;
- ~50 LPVs: directional intent checkpoint;
- ~100 LPVs or 3–5 days: keep/revert checkpoint, while allowing mature purchases to lag.

## Output contracts

### REVIEW_BUILD success

Return only:

`REVIEW_READY`

- task ID
- review template key
- preview URL
- exact changed fields/assets
- source live unchanged = PASS/FAIL
- preconditions = PASS/FAIL
- forbidden-change check = PASS/FAIL

Then stop.

### DEPLOY_APPROVED success

Return only:

`LIVE_VERIFIED`

- task ID
- deployed_at_utc
- live template key
- exact deployed changes
- live verification checks
- rollback snapshot location/reference
- monitoring checkpoints

Then stop.

## Failure contract

For any mismatch or unavailable required execution surface, stop with one of:

- `PRECONDITION_DRIFT`
- `REVIEW_BUILD_FAILED`
- `APPROVAL_REQUIRED`
- `EXECUTION_SURFACE_UNAVAILABLE`
- `LIVE_VERIFY_FAILED`

Never replace a failure with exploration.

## Why this structure

OpenAI's Codex guidance favours lean prompts, limited relevant tools, repository-local source-of-truth knowledge, progressive disclosure, and human steering at the intent/acceptance layer. Therefore this protocol intentionally keeps stable workflow in a reusable Skill and exact one-off decisions in a frozen manifest rather than repeating a giant prompt on every task.
