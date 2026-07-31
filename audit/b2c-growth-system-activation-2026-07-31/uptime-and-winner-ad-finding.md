# The real finding: 46% downtime, and the winner ad is switched off

2026-07-31. Verified directly against `meta_ad_metrics_daily`.

## 1. The account was dark for 28 of 61 days

| Window | Days | Spend | Orders |
|---|---:|---:|---:|
| Jun 1–14 | 14 **live** | $201.55 | **2** |
| **Jun 15 – Jul 2** | **18 DARK** | **$0.00** | — |
| Jul 3–16 | 14 **live** | $269.35 | **1** |
| **Jul 17–25** | **9 DARK** | **$0.00** | — |
| Jul 26–30 | 5 **live** | $61.63 | 0 |
| Jul 31 | dark | $0.00 | — |

**33 days live, 28 dark — 46% downtime.**

This dissolves the "June $201 → July $331 (+64% spend)" comparison I built earlier: those were
never comparable months. They were two 14-day bursts separated by an 18-day blackout.

**Orders track delivery almost exactly: ~1 order per 14 live days in both comparable windows.**
There is no conversion inconsistency to explain. **There is an uptime problem.**

This is also the most likely reason CPA feels erratic: every restart re-enters Meta's learning
phase, and at this volume the account can never re-accumulate signal before going dark again.

## 2. The only ad that ever produced purchases is switched off

| Ad | Spend | LPV | ATC | ATC% | Purchases | Last ran |
|---|---:|---:|---:|---:|---:|---|
| **`Winner \| Plunge is Dead`** | $303.61 | 470 | 47 | **10.00%** | **3** | **2026-07-15** |
| `2.2 \| Winning copy \| New Image` | $45.00 | 41 | 4 | 9.76% | 0 | 2026-07-12 |
| **`(2_) LP - Winner \| Plunge is Dead`** | $61.63 | 79 | 1 | **1.27%** | **0** | 2026-07-30 |

- The proven winner — **3 of the 5 lifetime customers** — last spent **2026-07-15** and has not
  run since.
- Every ad converting at ~10% ATC stopped by 2026-07-16.
- The only ad running since 07-26 is the replacement pointing at the new `/products/kryo2_`
  page, converting at **1.27% ATC with zero purchases**.

**8x worse add-to-cart, on Meta's own consistent measurement.** Fisher exact on the ATC counts:
**p ≈ 0.002**.

### This partly reverses an earlier conclusion of mine

I previously compared old vs new page using *first-party* data (1.53% vs 1.20%) and called the
difference "not meaningful" (z=0.368, p=0.71). On **Meta's** measurement the same comparison is
10.00% vs 1.27%, p≈0.002.

Caveats, stated plainly:
- Meta's ATC uses its own attribution window and is not comparable in *level* to first-party.
  The relative comparison is valid because both ads are measured identically.
- The new ad is confounded with the new page — creative and destination changed together.
- n is small: 79 LPV, 1 ATC.

But the direction is now supported rather than dismissed. **The new page/ad combination looks
materially worse, and my earlier "no meaningful difference" was based on the weaker instrument.**

### Attribution — partially answered
Meta attributes **3 purchases** to `Winner | Plunge is Dead`. Against 5 lifetime customers,
that suggests the ROAS is at least partly causal, not an off-platform artifact. It does not
settle it — Meta's attribution is self-reported — but it materially weakens the "the sales came
from a WhatsApp group" hypothesis.

## 3. `shopify_orders` has no writer at all

Not a broken sync — **a dead table**. Nothing in the repository writes to it.

The webhook that should (`src/app/api/webhooks/shopify/order-created/route.ts`):
- writes only to `attribution_touches`, never to `shopify_orders`
- **swallows every failure**: returns `{ ok: true, warning }` on insert error and
  `{ ok: true, error }` on exception. Shopify sees HTTP 200 and never retries.

A total silent failure is therefore indistinguishable from success — which is exactly why zero
rows accumulated with zero alarms.

And the inflated order count is confirmed mechanically: `sync/shopify/route.ts` fetches with
`status=any` and takes `orders.length` with no filter for cancelled, test, or upsell orders;
`shopify-funnel/route.ts` copies that straight into `checkouts_completed`. June's daily revenue
rows ($163.99, $213.99, two totalling $1,655.91, $1,541.81) mix accessory-scale and unit-scale
values — consistent with upsells counted as orders.

## Revised priority order

1. **Turn the ads back on and keep them on.** 46% downtime makes every other lever unmeasurable
   and prevents Meta from ever holding a learning state.
2. **Restart `Winner | Plunge is Dead`** (`120249120433950279`) pointing at the page it converted
   on. It is the only ad with a purchase history and it has been off since 07-15.
3. **Re-check live campaign/adset status.** `meta_ads`/`meta_adsets`/`meta_campaigns` last synced
   **2026-07-03** — ~4 weeks stale. A reported conflict (campaign `KRYO | Dubai | Scaling` PAUSED
   while child adset `2.2 Scaling Ad Set` ACTIVE) could not be verified and must be checked live.
4. **Fix the order webhook** to return non-200 on failure, write to `shopify_orders`, and confirm
   it is actually registered in Shopify Admin.
5. Then, and only then, consider page changes.
