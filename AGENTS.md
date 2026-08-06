# Universal Shopify Operations Router

Codex is implementation-only. Do not choose strategy, rewrite offers, or change commerce state unless Tom supplies the exact approved operation manifest.

## Mandatory execution path

All Shopify tasks use `npm run shopify:ops -- <plan|validate|apply|rollback> <manifest>`.

Every operation follows: **manifest → plan → apply → verify → rollback-capable record**. Stop after two failures. Do not fix forward.

## Operation lanes

- **S0 — audit only:** local inspection and reporting. No external writes.
- **S1 — theme asset micro-edit:** one exact string replacement in one existing asset.
- **S2 — theme asset structured JSON patch:** bounded JSON-pointer changes in one existing theme JSON asset.
- **S3 — Shopify Page content edit:** content-only page changes.
- **S4 — product data edit:** title, description, tags, or other approved product-admin fields.
- **S5 — product media edit:** approved product images or media only.
- **S6 — navigation/menu edit:** approved menu changes only.
- **S7 — full page/template release:** approved page/template release with explicit rollback data.
- **S8 — A/B experiment build:** approved experiment manifest with control, variant, tracking, and rollback.
- **S9 — rollback:** restore only from manifest rollback data.

## Hard routing rules

- Do not use Shopify CLI.
- Do not use Shopify MCP writes.
- Do not use Shopify plugin writes.
- Do not read broad marketing docs unless the user explicitly asks for research.
- Do not treat historical KRYO handles as current truth: `kryo_`, `kryo2_`, `kryo-setup`, `kryo-2-0`, `kryo2-uae`.
- Protected surfaces require explicit manifest permission: checkout, cart, tracking, Downpay, price, inventory, variants, and product-template assignment.
- If a request does not fit a lane, return `OPERATION_NOT_IMPLEMENTED` or `UNSUPPORTED_LANE`. Do not guess.
