---
depends-on: [money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp]
---

# Source of Truth Map

`marketing/source-of-truth/` — the only place business facts may live.

| File | Content | State |
|---|---|---|
| `kryo-product.md` | KRYO 2.0 product facts | **Partially unresolved — 4 open items** |
| `offer-and-pricing.md` | AED 3,990, Aug 30 dispatch, batch rules | Moved; needs Tom's confirmation |
| `positioning.md` | Market position | Moved from `foundation/` |
| `customer.md` | Customer beliefs | Moved from `foundation/` (was `customer-beliefs.md`) |
| `funnel.md` | Business funnel model | Moved from `foundation/` |
| `landing-pages.md` | Live pages + measured traffic | **New** |
| `whatsapp-pathway.md` | Intended vs measured pathway | **New** |
| `business-objectives.md` | Objectives + priority order | **New** |
| `agent-permissions.md` | Standing permission posture | **New** |
| `brand-voice.md`, `claims-and-evidence.md`, `visual-direction.md` | Retained | Moved |

## Unresolved facts — flagged, not guessed
- Full KRYO 2.0 technical specification
- Which `kryo2*` handle is canonical vs test clone (4 exist in traffic)
- Whether KRYO 1 specs still appear in live copy
- Warranty / trial / support terms
- Offer terms marked "pending Tom confirmation" predating this session

Per `.claude/rules/evidence-standards.md`, these are recorded as open questions.
No KRYO 1 figure was carried forward into a KRYO 2.0 document.
