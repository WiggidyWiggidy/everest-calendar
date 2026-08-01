# Real orders, AOV and MER — ground truth from Shopify admin

**Date:** 2026-07-31 · **Source:** Shopify Admin REST `/orders.json?status=any`, created_at ≥ 2026-01-01
**Method:** client-credentials OAuth; excluded `cancelled_at` and `test` orders (0 of each present)
**n = 5 orders.** Everything below is directional; no rate quoted to false precision.

## FACT — the orders

| Order | Date | Total (AUD) | Line items | Type |
|---|---|---:|---:|---|
| #1787 | 2026-06-02 | 213.99 | 1 | accessory |
| #1788 | 2026-06-07 | 1,540.92 | 2 | **KRYO unit** |
| #1789 | 2026-06-07 | 114.99 | 1 | accessory |
| #1790 | 2026-06-14 | 1,541.81 | 2 | **KRYO unit** |
| #1791 | 2026-07-06 | 1,566.09 | 2 | **KRYO unit** |

- **Total revenue: A$4,977.80** · **5 orders** · **currency AUD** (confirms the account currency)
- **Blended AOV: A$995.56**
- **KRYO-unit AOV: A$1,549.61** (n=3)
- Two orders are accessory-only (A$328.98 combined) and should not be credited to KRYO unit ads.

## FACT — MER (real revenue ÷ total ad spend)

| Basis | Revenue | Spend | MER |
|---|---:|---:|---:|
| All-time | A$4,977.80 | A$1,023.83 | **4.86x** |
| KRYO units only | A$4,648.82 | A$1,023.83 | **4.54x** |
| Jun–Jul window only | A$4,977.80 | A$532.53 | 9.35x |

**All-time MER is 4.86x — BELOW Tom's stated 5.0x floor.**
The 9.35x figure is flattering because it excludes the Feb/May spend that produced zero orders.
**Use the all-time figure. Excluding unproductive spend is how a channel looks profitable while
losing money.**

## FACT — CPA
- Per order (n=5): **≈A$205**
- Per KRYO unit (n=3): **≈A$341** — against target <A$100 and break-even A$400.
  Unit CPA is uncomfortably close to break-even.

## Corrections this forces — three prior claims were wrong

| Prior claim | Source | Reality |
|---|---|---|
| "~$10k in sales" | Tom, verbal | **A$4,977.80** — actual revenue is ~half |
| "AOV = A$2,000" | **I invented this** | **A$995.56 blended / A$1,549.61 per unit** — my figure was ~2x too high |
| "9.8x ROAS" | derived from the invented AOV | **MER 4.86x** — below the acceptable floor |
| "Order in February and one in March" | Tom, verbal | **No orders before 2026-06-02 exist in Shopify.** The query covered from 2026-01-01. |
| "June was only 2 orders" | Tom, verbal | **June had 4 orders** (2 units + 2 accessories) |

The Feb/Mar recollection and the June count are both contradicted by the source system.
Worth Tom confirming whether orders exist in another channel/store that this API key cannot see —
otherwise the record stands at 5 orders, all June–July.

## What this changes
1. **The business is at roughly break-even on ads, not comfortably profitable.** MER 4.86x against a
   5.0x floor. Every earlier scaling recommendation assumed ~9.8x and is void.
2. **Unit CPA ≈A$341 vs break-even A$400** leaves ~15% headroom, not the 2.25x I last stated
   (which itself replaced an even worse 4.5–6.7x). **Do not scale on the current numbers.**
3. **Margin is still UNKNOWN.** Break-even CPA A$400 was given by Tom; with AOV now known at
   A$1,549.61/unit, that implies ~26% contribution margin — but Tom should confirm rather than
   have it inferred.

## UNKNOWN
- COGS / true contribution margin (Tom).
- Whether any pre-June orders exist outside this Shopify store.
- Attribution per order — no order carries a UTM or ad id in this pull; `shopify_orders` is empty,
  so no order can yet be tied to a specific ad.

## Confidence
**FACT** for order count, revenue, AOV and MER — read directly from the source system.
**Directional only** for any rate derived from n=5. No verdict on ad-level performance is possible
until orders carry attribution.
