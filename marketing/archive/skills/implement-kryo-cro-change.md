# Skill: implement-kryo-cro-change

Required flow:

1. Run website preflight.
2. Read approved experiment packet.
3. Back up the template.
4. Generate dry-run diff.
5. Run copy gate.
6. Wait for Tom approval of the named patch.
7. Apply patch through canonical Shopify route.
8. Read asset back.
9. Render public page and attached-cart URL.
10. Record experiment status and rollback.

Command entry point today:

```bash
npm run operator:kryo-preflight -- --mode website --handle kryo2_
```
