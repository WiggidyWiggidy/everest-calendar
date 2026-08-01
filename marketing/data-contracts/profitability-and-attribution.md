# Profitability & Attribution — the trustworthy trio (binding)

Added 2026-07-31 from current DTC practice. This fixes the recurring failure of trusting Meta's
platform ROAS/CPA (which overstates true performance ~2.3× and double-counts). At low volume with a
broken pixel, platform numbers are the LEAST trustworthy source — not the most. Manage on these three.

## 1. MER is the primary money metric (not platform ROAS)
- **MER = total business revenue ÷ total marketing spend** (attribution-free, from the P&L).
  KRYO is single-channel (Meta), so MER ≈ blended ROAS and is trivial to compute — and far more
  trustworthy than Meta's reported ROAS.
- **Platform ROAS/CPA = directional only.** Use it for *within-channel* decisions (which ad/angle wins),
  never as the profitability verdict. Every platform ROAS must be labelled "platform-reported, directional."
- Healthy DTC MER runs ~2.5–4×; confirm KRYO's break-even MER from real economics (COGS/margin).
- **Revenue for MER comes from Shopify orders**, not the pixel. (`shopify_orders` must be synced — it's empty.)

## 2. Post-purchase survey — "How did you hear about us?" (cheapest attribution fix there is)
- One question on the thank-you/order-confirmation page. At low volume + broken pixels this is the single
  most reliable attribution signal, and it doubles as voice-of-customer (see `../skills/voice-of-customer.md`).
- Surveys routinely reveal channels last-click misses (e.g., 34% self-report vs 8% last-click).
- Prepare it as a Shopify thank-you-page block + a `kryo_attribution_survey` table. Low effort, high signal.

## 3. Quarterly incrementality / holdout (is Meta actually *causing* sales?)
- Pause the channel ~2 weeks; compare total business revenue during the pause vs the prior comparable
  window. The delta = the true incremental contribution. For a single-channel business this is clean.
- KRYO already has natural holdouts: the ads were dark 28/61 days — use those windows as a first read.

## Operating cadence (80% of the insight at 5% of the cost)
- **MER: weekly.** Post-purchase survey: continuously. Incrementality: once per quarter (or read from
  existing dark-ad windows).
- `performance-economics` reports MER as the headline; platform ROAS/CPA only as labelled directional
  inputs; and never issues a scaling verdict on platform numbers alone.

## Enforcement
No profitability/scaling claim ships on platform ROAS alone. MER (from Shopify revenue) is the verdict
metric; platform figures are directional; survey + incrementality validate. Ties to
`experiment-standards.md` (sample caps, provenance) and `source-of-truth.md`.
