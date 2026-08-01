# KRYO storefront reliability protocol

This is the required process for `https://everestlabs.co/products/kryo2_` and any future KRYO Shopify product page edits.

## Public render gate

Run:

```bash
npm run qc:shopify-page -- --handle kryo2_
```

The gate is read-only. It does not use marketing/data-health checks, does not mutate the product, and does not make fixes.

It verifies only the canonical public URL from `config/qc-shopify-pages.json`.

Rejected evidence:

- `?view=default`
- `preview_theme_id`
- any query string
- any cache-bust URL
- any alternate product/template URL unless Tom explicitly asked to validate that alternate page

The report is written to `artifacts/shopify-page-qc/<timestamp>-<handle>/shopify-page-qc.json` and copied to `artifacts/shopify-page-qc/latest/shopify-page-qc.json`.

## What the gate checks

- Active Shopify product template source, read-only.
- Required first/middle/last markers from template block settings.
- Required manifest markers for `kryo2_`:
  - above-fold founding-access text
  - “What makes KRYO different?”
  - “Designed for the bathroom you already use.”
  - mid-page CTA
  - reviews marker
- Visible product form.
- Visible Add to Cart button.
- Desktop and mobile clean browser contexts.
- Fixed scroll checkpoints.
- Large empty content gaps.
- Blank viewport after scroll.
- Large hidden/opacity-zero DOM regions.
- page errors.
- console errors.
- failed JS/CSS requests.
- screenshots at top, middle and bottom for desktop and mobile.

## Release behavior

Before an agent-initiated Shopify write:

```bash
npm run release:shopify-backup -- --handle kryo2_ --assets templates/product.kryo2_.json --reason "one logical change"
```

For write commands that can be wrapped safely:

```bash
npm run release:shopify-guarded -- --handle kryo2_ --assets templates/product.kryo2_.json -- <write-command>
```

`release:shopify-guarded` creates one backup, runs the write command, runs `qc:shopify-page`, and restores only the backed-up assets if public QC fails.

Manual Shopify edits are never auto-restored. They are verified with `qc:shopify-page` only.

## Reasoning rule

If a regression appears after our work:

1. Stop.
2. List the exact assets changed in the immediately preceding release.
3. Restore the backup for those assets only.
4. Run `qc:shopify-page` on the canonical URL.
5. Only then inspect broader causes if the restored page still fails.

Do not stack CSS workarounds, alternate templates, product suffix changes, cache-bust product mutations, or unrelated section edits on top of an undiagnosed regression.

## Done definition

“Done” is prohibited unless:

- source readback matches the intended asset change;
- `qc:shopify-page` returns `PASS` for desktop and mobile on the canonical URL;
- the report path and screenshot paths are included in the response;
- Add to Cart and tracking were not modified, or exact tracking changes were explicitly requested and verified.
