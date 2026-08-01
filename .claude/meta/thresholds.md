# KRYO — economic thresholds (the config the dashboard reads)

Confirmed by Tom 2026-07-31. **All figures AUD.** Derived from the live-days-only baseline
(33 live days · A$532.53 · 679 LPV · 47 ATC · 3 orders).

## Money model
| Input | Value |
|---|---|
| AOV | A$2,000 |
| Contribution / order | **A$400** (20% margin; COGS ≈ A$1,600) |
| **Target CPA** | **< A$100** → ROAS 20x |
| Current CPA | A$177.51 → ROAS 11.3x |
| **Break-even CPA** | **A$400** → ROAS 5.0x |
| **Minimum acceptable ROAS** | **5.0x** — floor, not a target |

**Headroom from current CPA to break-even is 2.25x.** Earlier analyses assumed 40–60% margin and
quoted 4.5–6.7x. That was wrong and is superseded — scaling has materially less room than stated.

## Leading indicators (dashboard: green / amber / red)
Derived from the measured **15.7 add-to-carts per order**.

| Indicator | Green | Amber | **Red — act** |
|---|---|---|---|
| **Cost per ATC** | ≤ A$6.38 (CPA A$100) | A$6.38–A$15.96 | **> A$25.53** (CPA A$400) |
| Cost per LPV | ≤ A$0.90 | A$0.90–A$1.50 | **> A$1.50** |
| Rolling 30-day CPA | ≤ A$100 | A$100–A$250 | **> A$400** |
| Rolling ROAS | ≥ 20x | 5–20x | **< 5x** |
| Click → LPV | ≥ 50% | 40–50% | **< 40%** (junk placements) |

Current position: cost/ATC **A$11.33** = amber. Cost/LPV **A$0.784** = green.

## Staging and kill rules
- **Scale** only while rolling cost-per-ATC ≤ A$15.96 (amber ceiling): +20–30% every 3–4 days.
- **Hold** if cost-per-ATC enters amber and does not recover within 4 days.
- **Cut** immediately if rolling CPA > A$400 or ROAS < 5x on ≥8 orders of evidence.
- **Never act on fewer than 5 orders**, or on a single week. At ~1 order/month, a zero-order month
  has probability 37% and means nothing.
- **Daily loss cap:** at 20% margin the downside is real. Do not exceed A$200/day until rolling
  cost-per-ATC has held green for a full 4-week block.

## Why this changes the scaling advice
At 20% margin the profit curve is much flatter than modelled earlier:

| Spend | CPA flat (A$178) | CPA +50% (A$266) | CPA at break-even (A$399) |
|---|---|---|---|
| A$56/day | A$2,106/mo | A$844 | ~A$0 |
| A$85/day | A$3,196/mo | A$1,281 | ~A$0 |
| A$130/day | A$4,888/mo | A$1,959 | ~A$0 |
| A$200/day | A$7,520/mo | A$3,014 | ~A$0 |

A 50% CPA deterioration — entirely plausible on an 8x scale step in a market the size of the UAE —
**cuts profit by ~60% at every spend level.** The upside is real but the margin for error is thin.

**Revised recommendation:** ramp A$85 → A$130 → A$200/day with a 4-week hold at each step, and gate
each step on cost-per-ATC staying out of red. Do not jump straight to A$200/day; at 2.25x headroom a
scale-induced CPA rise eats the entire gain.
