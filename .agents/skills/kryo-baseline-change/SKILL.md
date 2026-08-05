---
name: kryo-baseline-change
description: Execute a frozen, owner-reviewed KRYO baseline/hygiene change from a named task manifest. Use for non-experiment Shopify page fixes and high-confidence baseline upgrades. Never research, choose CRO changes, or reinterpret the manifest.
---

# KRYO Baseline Change

## Input

You must be given:

- one exact manifest path under `marketing/baseline-changes/`;
- one phase: `REVIEW_BUILD` or `DEPLOY_APPROVED`.

If either is missing, stop with `REVIEW_BUILD_FAILED` or `APPROVAL_REQUIRED` as appropriate.

## Governing doctrine

Read only:

1. this Skill;
2. the named manifest;
3. `docs/kryo-growth/operations/KRYO_BASELINE_CHANGE_PROTOCOL.md` if the manifest requires clarification of lifecycle/output semantics;
4. exact implementation files named by the manifest only if needed to call an existing route.

Do not search the repository broadly.
Do not browse the web.
Do not research competitors, CRO, copy, Shopify APIs, Meta, or alternatives.
Do not use another marketing Skill.
Do not redesign the task.

The manifest is frozen product intent. Your job is deterministic execution.

## Global rules

- State each required instruction once; do not expand scope.
- Never change a live value during `REVIEW_BUILD`.
- Never infer approval from context. `DEPLOY_APPROVED` must be explicitly requested by the owner/user.
- Never choose replacement copy, dates, counts, IDs, assets, layout, or implementation when a frozen precondition differs.
- On any precondition mismatch: output `PRECONDITION_DRIFT`, list mismatches, stop.
- No refactors, cleanup, formatting passes, renames, dependency changes, tracking changes, or unrelated fixes.
- Do not delete review or rollback artifacts before the manifest's monitoring decision is complete.
- Do not expose credentials/secrets in output.

## Phase: REVIEW_BUILD

1. Read the manifest.
2. Confirm `task_class: BASELINE_CHANGE` and `status: FROZEN_FOR_REVIEW_BUILD`.
3. Run only the manifest's precondition reads/checks.
4. If any mismatch: `PRECONDITION_DRIFT` and stop.
5. Clone the exact source template to the exact review target named by the manifest.
6. Read the cloned review JSON.
7. Apply exactly the manifest's template operations.
   - For an inserted block, use the exact embedded block ID/type/settings.
   - Update block order only as explicitly specified.
   - Do not copy/read a source challenger template unless the manifest explicitly requires it; frozen task content should normally be self-contained.
8. Write only the review template.
9. Reread both review template and live source template.
10. Verify every required changed sentinel and every protected sentinel.
11. For product-level media, do not mutate the product. Include the exact frozen media plan in the review result.
12. Return the exact `REVIEW_READY` output contract from the protocol and stop.

Never continue into production in the same run.

## Phase: DEPLOY_APPROVED

1. Confirm the user explicitly asked for `DEPLOY_APPROVED` for the same task ID.
2. Read the frozen manifest and approved review template.
3. Rerun all preconditions against current live state.
4. If any mismatch: `PRECONDITION_DRIFT` and stop. Do not adapt.
5. Capture the rollback snapshot required by the manifest.
6. Confirm the review artifact still matches the frozen acceptance criteria.
7. Deploy the exact approved review-template bytes to the original live template key.
   - Do not reconstruct the edits.
8. Execute only the exact frozen product-level mutations, if any.
   - Use exact source URLs/alt text from the manifest.
   - Capture newly returned IDs.
   - Use those returned IDs only where the manifest specifies dynamic-result substitution, such as media ordering.
9. Reread the live template and relevant product state.
10. Verify all changed and protected sentinels.
11. Record `deployed_at_utc`.
12. Return the exact `LIVE_VERIFIED` output contract and monitoring gates from the manifest.
13. Stop.

## Allowed implementation surfaces

Use only resources explicitly allowed by the manifest.

For current KRYO Shopify tasks, existing repo surfaces may include:

- `/api/marketing/theme/clone-template`
- `/api/marketing/theme/asset`
- `/api/marketing/theme/deploy-asset`
- `/api/marketing/theme/configure-product` only if the manifest explicitly allows it
- the already-connected Shopify Admin GraphQL capability for exact validated product-media mutations when the manifest embeds those mutations

Do not discover or substitute another route if an allowed surface is unavailable. Stop with `EXECUTION_SURFACE_UNAVAILABLE`.

## Protected production invariants

Unless a manifest explicitly changes one, preserve:

- product handle;
- product/variant IDs;
- price/market pricing;
- sellable variant count/choice architecture;
- hero and sticky CTA destination/behaviour;
- cart/checkout mechanics;
- Downpay;
- discounts/gifts;
- Meta/tracking/attribution code;
- unrelated theme sections/assets.

## Completion standard

A successful API write is not completion.

Completion requires a post-write live reread that proves the exact frozen acceptance criteria.

If live reread differs, output `LIVE_VERIFY_FAILED` and stop.
