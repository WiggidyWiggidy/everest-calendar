# KRYO Marketing System QC Gate

Purpose: keep KRYO marketing changes reliable without Tom manually checking every detail.

## Mandatory gate commands

Run these before any KRYO marketing action:

- Read-only observation / daily status:
  `npm run gate:kryo`

- Before activating spend, changing budgets, or recommending live spend:
  `npm run gate:kryo:pre-spend`

- Before publishing or claiming a storefront/page/cart change is ready:
  `npm run gate:kryo:pre-page`

## What the gate checks

- Meta account status.
- Open URL-tag guardrails.
- KRYO ad destination URL/UTM/country issues from synced Meta data.
- First-party cart abandonment signals.
- Checkout-click tracking presence.
- Latest proof packet freshness.
- Pixel presence.
- Tracking endpoint persistence to Supabase as `internal_qa`.
- Desktop/mobile storefront proof.
- Severe console errors.

## Rules

- A `BLOCKED` gate means do not proceed with the requested marketing mutation.
- `PASS_WITH_WARNINGS` is acceptable for observation, but not for live spend unless the warning is explicitly acknowledged in the final report.
- Never activate ads, raise budgets, or publish storefront changes solely because a gate passes. Tom still approves spend and live storefront changes.
- Proof artifacts stay local under `artifacts/` and are gitignored.

## Current known blockers from gate

As of the first run on 2026-07-01:

- Meta account status is not active.
- 2 high URL-tag guardrails are open.
- Checkout-click tracking is missing/zero in first-party KRYO sessions.
- Several synced KRYO ads have destination/UTM issues before spend.

## System confidence commands

Run this when Codex changes marketing system code or when Tom asks whether the system can be trusted:

`npm run qc:kryo-system`

It creates one evidence packet under `artifacts/kryo-system-qc/` and runs:

- Node syntax checks for every KRYO proof/audit/gate script.
- Targeted lint for the modified marketing attribution/report files.
- TypeScript compile check.
- Free tool health checks for Supabase REST, Meta Graph, Shopify theme read, MCP configuration, and local Chrome DevTools readiness.
- Observe gate.
- Pre-spend gate. A blocked pre-spend gate is treated as a successful guardrail, not a script failure.

Run this when browser/storefront proof also needs to be refreshed:

`npm run qc:kryo-system:with-proof`

This can be slower. It still uses internal QA tracking and does not activate ads or mutate the storefront.

## Free tool stack now tracked

- Pipeboard Meta Ads MCP is configured. Use it for typed Meta reads and draft mutations, but never activate spend without Tom approval.
- Analytics MCP is configured. Use it to cross-check GA4 funnel and revenue numbers against first-party Supabase data.
- Supabase REST is healthy and remains the reliable fallback. Supabase MCP is configured but still has a TODO access token.
- Shopify live theme read via the marketing API is healthy. Direct storefront mutations remain off-limits until Tom approves.
- Chrome DevTools MCP is configured, but local Chrome remote debugging must be running before relying on it.


## Operator action packet

Run this to convert raw proof/gate/tool evidence into a ranked operating list:

`npm run operator:kryo:refresh`

It refreshes free tool health, observe gate, and pre-spend gate, then writes `artifacts/kryo-operator-action-packet/*/operator-action-packet.md`.

The packet marks each action by owner, approval requirement, safety class, evidence source, and expected effect. It is read-only. It does not activate ads, change budgets, or mutate Shopify.

Codex should pick the highest-ranked Codex-owned action whose safety class is read-only, diagnostic-only, process-only, local-config-only, or internal-QA. Anything marked `approval_required: yes` must stay as a draft/plan until Tom approves.


## Checkout reconciliation

Run this for the original pre-shutdown baseline window:

`npm run audit:kryo-checkout-baseline`

It compares, in one read-only packet:

- Browser proof checkout visibility.
- Internal QA tracking endpoint persistence.
- First-party real-user `cart_checkout_click` and `checkout_start` events.
- GA4 page-hourly `begin_checkouts` for KRYO page paths.
- Cart-add failure rate.

Current interpretation rule: if browser checkout is visible and the internal endpoint persists, but both first-party checkout starts and GA4 begin checkouts are zero, do not assume the fix is copy/design. Treat it as either true cart abandonment or a checkout-click listener/instrumentation gap until a safe proof or listener inspection resolves it.


## Anti-drift rules after 2026-07-01 review

These rules exist because Codex briefly drifted toward fixing live storefront bugs instead of improving the reliability system.

- System-first means proof, gates, reports, and rollback-safe plans. It does not mean changing Shopify theme assets, live landing pages, active ads, budgets, or campaign status.
- If a proof packet finds a storefront/ad bug, write it as evidence and rank it. Do not fix it unless Tom explicitly approves that class of mutation.
- Operator packet actions with `approval_required: yes` are plans only. They must not call Meta/Shopify mutation routes.
- Before reporting progress, run `npm run qc:kryo-system` and cite the artifact path.
- Before any storefront/page readiness claim, run `npm run gate:kryo:pre-page`; a BLOCKED result is acceptable evidence, not permission to patch live.
- Before any spend/restart claim, run `npm run gate:kryo:pre-spend`; a BLOCKED result means stop and report the blockers.
- If a live change is accidentally made, stop, rollback, verify checksum/state, log it as risk, and do not continue with live mutations.
- Do not treat cart abandonment as a UX/copy problem until checkout reconciliation distinguishes true user drop-off from listener/tracking gaps.
- Keep artifacts local under `artifacts/`; do not commit screenshots, traces, or raw proof packets.


## Meta mutation preflight — hard checklist

This checklist is mandatory before any Meta ad mutation. It exists because Codex once changed a configured-active but campaign-paused ad after using `status=ACTIVE` instead of true delivery state.

### 1. Scope definition
- If Tom says "active", "running", "live", or points at Ads Manager rows, target only ads with `effective_status=ACTIVE` unless he explicitly says to include paused/campaign-paused/adset-paused ads.
- Never use configured `status=ACTIVE` alone to decide scope.
- Always read and report full hierarchy before mutation: Campaign name → Ad set name → Ad name → Ad ID → creative ID.
- If the API ad name does not appear in Tom's screenshot/view, STOP and reconcile before changing anything.

### 2. Pre-mutation proof
- Save a before snapshot for each target ad: `get_ad_details` or direct Graph read including `name,status,effective_status,configured_status,adset,campaign,creative`.
- Save a before creative snapshot via `bulk_get_ad_creatives` or `get_creative_details`.
- Prove the exact occurrences to change. Example: `June` count before, exact text fields, and expected replacement.
- Prove the creative is not shared with unintended ads. If shared, STOP unless Tom explicitly approves all affected ads.

### 3. Mutation method rules
- Do not edit budgets, targeting, URLs, status, campaign, ad set, or creative assets unless Tom explicitly asked.
- For dynamic/FLEX/placement creatives, assume content is immutable. Pipeboard says to create a new creative and swap it onto the ad; do not rely on in-place creative edits.
- If creating a new creative, validate the new creative readback before swapping: same asset counts/rules, no unintended text changes, zero stale date mentions.
- If the tool supports `dry_run`, use it before writes. If no dry_run exists, create/read/validate before binding to the ad.

### 4. Post-mutation proof
- Immediately read back the ad and creative from Meta.
- Confirm the ad status/effective status matches the intended scope.
- Confirm old text count is zero and new text count is expected.
- Re-scan all ads in the intended scope for stale text.
- Report both configured `status` and `effective_status`; if Meta returns `PENDING_REVIEW` or `IN_PROCESS`, say that clearly.

### 5. Failure behavior
- If any preflight fails, do not mutate.
- If a mutation hits the wrong scope, disclose plainly and offer rollback before making any further ad mutations.
- A user's "auto approve" only applies to the exact mutation class requested; it does not waive this preflight.
