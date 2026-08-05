# BASELINE CHANGE TASK TEMPLATE

## Identity

- task_id:
- task_class: `BASELINE_CHANGE`
- status: `DRAFT_RESEARCH`
- researched_at_utc:
- frozen_at_utc:
- owner_approval: `NOT_APPROVED`

## Commercial purpose

- observed deficiency:
- why this is baseline/hygiene rather than an experiment:
- expected directional outcome:
- primary regression metric:

## Exact live resources

- store:
- product_handle:
- product_gid:
- product_variant_gid:
- main_theme_gid:
- live_template_key:
- live_template_updated_at_expected:
- review_template_key:
- review_suffix:
- preview_url:

## Preconditions

Every row must be exact. Any mismatch = `PRECONDITION_DRIFT`.

| Resource/path | Expected live value |
|---|---|
|  |  |

## Allowed execution surfaces

- 

## Forbidden changes

- 

## Template operations

List exact operations in execution order. No placeholders.

### Operation T1

- action:
- JSON path / insertion point:
- expected old value:
- exact new value:

## Inserted block payloads

Embed complete JSON/settings here. Do not make executor read another page to recreate it.

## Product-level operations

If none: `NONE`.

For product media, freeze:

- exact source URLs;
- alt text;
- desired final ordering rule;
- validated GraphQL operation;
- dynamic-result substitutions allowed (for example returned media IDs).

No product-level operation may execute during `REVIEW_BUILD`.

## REVIEW_BUILD procedure

1. Assert preconditions.
2. Clone exact live template → exact review template.
3. Apply exact template operations only to review template.
4. Reread review + live source.
5. Verify acceptance criteria and protected sentinels.
6. Return `REVIEW_READY` and stop.

## Review acceptance criteria

- 

## Approval gate

Production mutation requires explicit owner instruction:

`DEPLOY_APPROVED <task_id>`

No other message counts as approval.

## DEPLOY_APPROVED procedure

1. Rerun preconditions.
2. Capture rollback snapshot.
3. Confirm approved review artifact.
4. Copy exact approved review bytes → live template key.
5. Execute exact approved product-level operations.
6. Reread live state.
7. Record `deployed_at_utc`.
8. Return `LIVE_VERIFIED` and stop.

## Rollback snapshot

Capture before production write:

- live template exact bytes/reference;
- template update timestamp;
- product/variant sentinels;
- media IDs/URLs/order if media changes;
- UTC timestamp.

## Post-deploy live verification

- 

## Monitoring

- monitoring starts at: `deployed_at_utc`
- clean traffic definition:
- historical benchmark:

### Gate 1

- sample/time:
- healthy:
- investigate:
- revert condition if any:

### Gate 2

- sample/time:
- healthy:
- investigate:

### Decision gate

- sample/time:
- KEEP:
- INVESTIGATE:
- REVERT:

## Output contract

### REVIEW_READY

- task ID
- review template key
- preview URL
- exact changed fields/assets
- live source unchanged PASS/FAIL
- preconditions PASS/FAIL
- forbidden-change check PASS/FAIL

### LIVE_VERIFIED

- task ID
- deployed_at_utc
- live template key
- exact deployed changes
- live verification checks
- rollback snapshot reference
- monitoring checkpoints
