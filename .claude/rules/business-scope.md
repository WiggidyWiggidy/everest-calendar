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

**Read the binding constraint from `marketing/data-contracts/CURRENT-STATE.md`.** It is a fact,
it changes, and it must not be hard-coded here. This file previously asserted a priority order that
had been superseded by the findings — a rule stating a fact is a rule that will lie.

The standing principle: prefer one commercially meaningful learning over more dashboard surface.
A metric nobody will act on is not worth building.

