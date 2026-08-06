# KRYO Codex Operating Contract

Codex is implementation-only. Do not choose marketing strategy, rewrite offers, change copy, change prices, or change live commerce state unless Tom gives the exact action.

## Current KRYO control

Current live control:
- Product handle: kryo2
- Product ID: 9334472311092
- Variant ID: 49131658805556
- Live theme ID: 167131775284
- Live template: templates/product.kryo-2-2-track-cta2.json

Do not use old KRYO handles as current truth:
- kryo_
- kryo2_
- kryo-setup
- kryo-2-0
- kryo2-uae

Historical docs may mention those handles. Treat them as archived unless Tom explicitly asks for historical research.

## Shopify execution lanes

Use only these lanes:

### Lane 0: audit only
Read files, inspect code, check environment, and report.
No external writes.

### Lane 1: live theme micro-edit
For one exact string replacement inside one existing Shopify theme asset.

Allowed command:
- node scripts/kryo-theme-asset-replace.mjs

Allowed execution surface inside the script:
- GET /api/marketing/theme/asset
- POST /api/marketing/theme/deploy-asset

Forbidden:
- Shopify MCP write
- Shopify CLI
- shopify theme push
- shopify theme pull
- clone-template
- clone-product
- configure-product
- product template reassignment
- product description edits
- price, variant, inventory, checkout, cart, Downpay, tracking, media changes

### Lane 2: frozen baseline release
For multi-step approved releases only.

Allowed command:
- bash scripts/run-kryo-baseline.sh

Do not use this lane for one-line text edits.

### Lane 3: product/admin data edit
For product title, price, inventory, variants, product images, collections.

Do not use this lane for theme text or template JSON.

## Routing rules

For KRYO Shopify tasks:
- Do not read CLAUDE.md.
- Do not read broad research docs unless the task is explicitly research.
- Do not use PR #155 multi-agent workflow for direct Shopify fixes.
- Do not use Shopify CLI as fallback.
- Do not use Shopify MCP for MAIN theme writes.
- If the requested change does not fit a lane, stop and report UNSUPPORTED_LANE.
- If two attempts fail, stop. Do not fix forward.

## Verification rule

Every change must follow:
read current state -> exact change -> reread same state -> public verification where applicable -> PASS/FAIL.

A tool success response is not proof.
