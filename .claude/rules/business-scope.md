# Business Scope

## In scope
KRYO **B2C** direct-to-consumer marketing only: paid acquisition (Meta), landing pages
and PDPs, on-site conversion, the WhatsApp assisted-sales pathway, and Shopify checkout.

## Out of scope — never load into this project
- B2B / wholesale pipeline
- Manufacturing and production
- CAD, `ISU001_SHELL_CAD`, dimensions, DXF export
- Supplier negotiation, Alibaba/1688, supplier inbox and dispatch

If a task requires these, stop and tell Tom it belongs to a different project root.

## Authoritative facts
Business facts live in `marketing/source-of-truth/`, not in rules, skills or commands.
Metric definitions live in `marketing/data-contracts/metric-definitions.md`.
Never restate a business fact inline — reference the file.

## Priority order
1. Product-page add-to-cart rate (currently the dominant loss)
2. Qualified WhatsApp signup — **blocked on lead capture existing at all**
3. Checkout completion

Prefer one commercially meaningful learning over additional dashboard surface.
A metric nobody will act on is not worth building.
