# Real KRYO sales, AOV and MER

**Date:** 2026-07-31 · **n = 5 KRYO unit sales** · **Currency: AUD** (shop currency confirmed)
**Sources:** Shopify Admin API (Jun–Jul, API-visible) + Tom (Feb–Mar, API-blind — see limitation)

## ⚠️ Critical source limitation — read before using any Shopify order query

**The Shopify API credential can only see the last 60 days of orders.**

| Evidence | Value |
|---|---|
| `orders/count.json?status=any` | **791** |
| `orders.json?status=any` returns | **5** |
| Earliest visible order | 2026-06-02 |
| Today | 2026-08-01 |
| Gap | **exactly 60 days** |

This is Shopify's `read_orders` scope behaviour: without the `read_all_orders` scope (which requires
Shopify approval), an app sees only the trailing 60 days. **786 of 791 orders are invisible to this key.**

**Any historical revenue, AOV, MER or CPA computed from this API is wrong unless the window is
inside 60 days.** Request `read_all_orders`, or read history from the Shopify admin UI.

## FACT — KRYO unit sales

| Date | Amount (AUD) | Source |
|---|---:|---|
| Feb 2026 | 1,500.00 | Tom (API-blind) |
| Mar 2026 | 4,600.00 | Tom (API-blind) |
| 2026-06-07 | 1,540.92 | Shopify API `#1788` |
| 2026-06-14 | 1,541.81 | Shopify API `#1790` |
| 2026-07-06 | 1,566.09 | Shopify API `#1791` |
| **Total** | **10,748.82** | **n=5** |

**Excluded — replacement parts, not advertising-driven** (Tom): `#1787` A$213.99, `#1789` A$114.99.
Small-value orders must not be counted as acquisition; they distort AOV and CPA downward.

## FACT — economics

| Metric | Value | vs target |
|---|---:|---|
| KRYO AOV | **A$2,149.76** | — |
| Meta spend (all-time) | A$1,023.83 | — |
| **MER** (real revenue ÷ total spend) | **10.50x** | **above the 5.0x floor** |
| CPA per KRYO unit | **≈A$205** | target <A$100 · break-even A$400 |

Tom's original "~$10k in sales, healthy ROAS" was **correct**. The business is comfortably
profitable on ads at ~10.5x MER, with CPA roughly half of break-even.

## Corrections — what I got wrong and why

| My claim | Reality | Cause |
|---|---|---|
| "Revenue A$4,977.80" | **A$10,748.82** | API returned only 60 days; I treated the response as complete |
| "MER 4.86x, below the floor" | **10.50x, well above** | same |
| "No orders exist before 2026-06-02" | **They exist; the key cannot see them** | I asserted absence from a truncated response |
| "Tom's Feb/Mar recollection is contradicted" | **Tom was right** | I sided with an API over the owner without checking the API's limits |
| "AOV A$2,000" (earlier, invented) | A$2,149.76 | coincidentally close — but it was still fabricated, not derived |

**The process failure, not the arithmetic one:** `evidence-standards.md` requires that when sources
disagree, *the gap is the finding* and must be investigated before concluding. Tom's account and the
API disagreed. I resolved it by declaring the owner wrong instead of testing the instrument. The
check that would have caught it — comparing `orders/count.json` (791) against the returned array (5) —
took one extra request.

## UNKNOWN
- COGS / contribution margin (Tom). With AOV now A$2,149.76 and break-even CPA A$400, implied
  contribution is ~19% — **Tom should confirm rather than have it inferred.**
- Per-order attribution: no order carries a UTM or ad id; `shopify_orders` is empty. No sale can yet
  be tied to a specific ad.
- Whether the Feb/Mar sales were Meta-driven. Tom states Meta is the only channel; not independently verified.

## Confidence
**FACT** for the three June–July orders (direct from source).
**FACT, Tom-attested** for Feb/Mar amounts — not independently verifiable until `read_all_orders`.
n=5 → **directional only**. No ad-level verdict is possible.
