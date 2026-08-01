# WhatsApp Pathway — Source of Truth

## Intended pathway
Low-friction WhatsApp access request → conversation → qualification → optional refundable
deposit. Serves the warm buyer; the hyper-buyer path is direct purchase.
See [offer-and-pricing.md](offer-and-pricing.md).

## Measured reality — 2026-07-31

**The pathway is effectively unmeasured.**

| Signal | State |
|---|---|
| `whatsapp_click` events | 11 events / 10 sessions since 2026-06-02 (9 on live site) |
| `kryo_leads` | **0 rows** |
| `kryo_whatsapp_conversations` | **0 rows** |
| `kryo_deposit_events` | unpopulated |

All 9 live-site WhatsApp clicks came from **desktop direct** traffic. Zero from mobile,
zero from paid Meta.

## Consequences
- Qualified WhatsApp lead rate is **UNKNOWN** and cannot be computed.
- `whatsapp_click` must never be reported as a lead — see
  [metric-definitions.md](../data-contracts/metric-definitions.md) §4.
- EXP-2 (messaging / assisted-sales) is blocked until lead capture exists.

## Required before this pathway can be optimised
1. Deploy WhatsApp lead capture writing to `kryo_leads`.
2. Define and record a qualification status.
3. Verify the join from `kryo_leads` back to `session_id` / `anonymous_id`.
