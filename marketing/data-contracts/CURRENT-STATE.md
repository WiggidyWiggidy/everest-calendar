# CURRENT STATE — the single source of fact

**This is the ONLY file in the repository permitted to state a current business figure.**

Rules, agents, skills and commands encode *how to think*. They must not contain figures.
A number written into a rule file becomes stale the moment reality moves, and nothing detects it.
On 2026-07-31 an agent was found asserting `AOV ≈ A$2,000` — a figure that was never real — while
`CLAUDE.md` and `business-scope.md` disagreed with the findings about what the binding constraint was.

Enforced by `marketing/evals/lint-facts.mjs`. Adding a figure to a rule or agent fails the lint.

**Every row carries: value · n · source · as-of · confidence.**
No row may be added without all five. If a fact is unknown, it is listed as UNKNOWN — never omitted.


## Fact keys (stable identifiers — findings reference these)

Every fact below has a key. Conclusions declare `depends-on: [key, ...]` in their frontmatter.
When a fact is superseded, `marketing/evals/check-dependencies.mjs` flags every dependent
conclusion automatically. Belief revision must propagate — on 2026-07-31 a fact was disproven,
three dependent findings were flagged **by hand**, and a fourth was missed and left asserting it.

| Key | Fact | Review by |
|---|---|---|
| `money.sales_lifetime` | KRYO unit sales, lifetime | 2026-08-31 |
| `money.revenue_lifetime` | KRYO revenue, lifetime | 2026-08-31 |
| `money.aov` | KRYO AOV | 2026-08-31 |
| `money.spend_lifetime` | Meta spend, lifetime | 2026-08-14 |
| `money.mer` | MER | 2026-08-14 |
| `money.cpa` | CPA per KRYO unit | 2026-08-14 |
| `money.cogs` | COGS / margin — **UNKNOWN** | — |
| `delivery.uptime` | Live delivery days | 2026-08-14 |
| `delivery.cost_per_lpv` | Cost per landing page view | 2026-08-14 |
| `delivery.winner_ad` | Winner ad id + status | 2026-08-07 |
| `site.live_pdp` | Live PDP handle | 2026-08-14 |
| `site.buy_control_position` | Buy control page depth | 2026-08-14 |
| `site.tracking_capi` | `facebook.com/tr` / CAPI state | 2026-08-07 |
| `constraint.binding` | The binding constraint | 2026-08-14 |

## SUPERSEDED facts — anything depending on these is invalid

| Key | Was asserted | Superseded by | Date |
|---|---|---|---|
| `money.checkouts_as_sales` | "6 completed checkouts = 6 real sales" | upsell double-counting; true KRYO units = 5 | 2026-07-31 |
| `money.aov_2000` | "AOV = A$2,000" | fabricated; real A$2,149.76 | 2026-07-31 |
| `money.mer_486` | "MER 4.86x, below floor" | 60-day API blind spot; real 10.50x | 2026-07-31 |
| `constraint.mobile_atc` | "dominant loss is mobile add-to-cart" | volume is the binding constraint | 2026-07-31 |
| `delivery.july_collapse` | "July collapse: spend +64%, orders −80%" | 28 of 61 days were dark | 2026-07-31 |

---

## Money — as of 2026-07-31

| Fact | Value | n | Source | Confidence |
|---|---|---|---|---|
| KRYO unit sales, lifetime | 5 | — | Shopify API (3) + Tom-attested (2) | FACT |
| KRYO revenue, lifetime | A$10,748.82 | 5 | same | FACT |
| KRYO AOV | A$2,149.76 | 5 | derived from above | PATTERN (n=5) |
| Meta spend, lifetime | A$1,023.83 | — | `meta_ad_metrics_daily` | FACT |
| MER (revenue ÷ spend) | 10.50x | 5 | derived | PATTERN (n=5) |
| CPA per KRYO unit | ≈A$205 | 5 | derived | PATTERN (n=5) |
| Target CPA | < A$100 | — | Tom, 2026-07-31 | CONFIRMED |
| Break-even CPA | A$400 | — | Tom, 2026-07-31 | CONFIRMED |
| Minimum acceptable ROAS | 5.0x | — | Tom, 2026-07-31 | CONFIRMED |
| Account + shop currency | AUD | — | shop.json + account-context | FACT |
| COGS / contribution margin | **UNKNOWN** | — | needs Tom | UNKNOWN |

**Excluded from acquisition maths:** orders `#1787` (A$213.99) and `#1789` (A$114.99) are
replacement parts, not advertising-driven (Tom, 2026-07-31).

## Delivery — as of 2026-07-31

| Fact | Value | n | Source | Confidence |
|---|---|---|---|---|
| Live delivery days, Jun–Jul | 33 of 61 (28 dark, deliberate) | — | `meta_ad_metrics_daily` | FACT |
| Cost per landing page view | ≈A$0.78 | 679 | `meta_ad_metrics_daily` | FACT |
| Winner ad | `Winner \| Plunge is Dead` `120249120433950279` | — | `meta_ad_metrics_daily` | FACT |
| Winner ad ATC rate | 10.0% of LPV | 470 LPV | same | FACT |
| Winner ad status | **OFF since 2026-07-15** | — | same | FACT |
| Current live ad ATC rate | 1.27% of LPV | 79 LPV | same | PATTERN (thin n) |

## Site — as of 2026-07-31

| Fact | Value | Source | Confidence |
|---|---|---|---|
| Live PDP | `/products/kryo2_` | live browser | FACT |
| `/products/kryo2` | 404 (unpublished) | live browser | FACT |
| Add-to-cart works | yes — `/cart/add` 200, real line | live browser test | FACT |
| Buy control position | 97% page depth (y≈11,731 of 12,096) | live browser | FACT |
| Sticky bar | reads "Choose Model", anchor link, leaves button 153px below fold | live browser | FACT |
| `whatsapp_click` tracking | **FIXED + deployed** 2026-07-31 (`wa\\.me` → `wa\.me`) | theme `167131775284` | FACT |
| `facebook.com/tr` | aborts on navigation — Meta does not reliably receive ATC | live browser | FACT |
| Clarity pixel | fails to start (TypeError) | live browser | FACT |

## The binding constraint — as of 2026-07-31

**VOLUME.** ~1 order/month at ~A$113/week spend. At this rate a zero-order month has probability
~37%, so month-to-month "inconsistency" is arithmetic, not a conversion defect.

Superseded: "the dominant loss is mobile add-to-cart." The 97%-depth buy control is a real defect,
but the same page converted while it existed, and the figures behind that claim (desktop 10.4% vs
mobile 0.18%) came from a query missing three of four canonical exclusions.

## Blocked prerequisites

| Blocker | Blocks | Needs |
|---|---|---|
| `facebook.com/tr` aborts; CAPI not deployed | ATC optimisation, any spend threshold | `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN`, then deploy |
| Shopify `read_all_orders` scope absent | any historical revenue query (60-day blind spot; 786 of 791 orders hidden) | Shopify approval |
| COGS unknown | contribution margin, true break-even | Tom |
| `shopify_orders` has no writer | per-order attribution; no sale ties to an ad | order webhook fix |

## UNKNOWN — do not infer these
- COGS / contribution margin.
- Which ad produced any specific sale.
- Whether Feb/Mar sales were Meta-driven (Tom says Meta is the only channel; not independently verified).
- WhatsApp lead rate as % of LPV — only measurable from 2026-07-31, when tracking was fixed.
