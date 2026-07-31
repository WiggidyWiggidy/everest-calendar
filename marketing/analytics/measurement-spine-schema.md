# KRYO Measurement Spine Schema

Proposed migration:

`../../supabase/migrations/20260725050000_kryo_measurement_spine.sql`

Status: repository-only, not applied to Supabase yet.

## Tables

- `kryo_growth_experiments`: DB-backed experiment ledger.
- `kryo_leads`: WhatsApp/chat lead lifecycle with source identifiers.
- `kryo_deposit_events`: deposit lifecycle events.
- `vw_kryo_growth_spine_daily`: daily rollup by experiment, angle, hook and landing-page version.

## Why this exists

The current system can track clicks and some checkout/purchase signals, but cannot reliably answer:

- Which angle created qualified WhatsApp leads?
- Which leads paid deposits?
- Which deposits came from which ad/landing-page experiment?
- Which experiment paid for ad spend through refundable deposits?

This schema is the missing bridge between interest and commercial outcome.
