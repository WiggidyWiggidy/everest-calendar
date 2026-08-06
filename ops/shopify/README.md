# Shopify operations

1. Choose an operation type and create a JSON manifest in `ops/shopify/changes/`.
2. Run `npm run shopify:doctor`.
3. Run `npm run shopify:ops -- plan <manifest>`.
4. Obtain owner approval.
5. Run `npm run shopify:ops -- apply <manifest> --approved`.
6. Roll back only through the same manifest: `npm run shopify:ops -- rollback <manifest> --approved`.
