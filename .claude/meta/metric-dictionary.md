# Metric dictionary and calculation rules

Use semantic metrics, then map them to exact MCP fields in `tool-map.md`.

## Core delivery

- Spend: amount spent in the account currency.
- Impressions: delivered ad impressions.
- Reach: estimated unique people reached; do not sum reach across rows unless Meta explicitly provides a valid aggregate.
- Frequency: impressions divided by reach when both are compatible; prefer Meta's returned value.
- CPM: spend / impressions × 1,000.

## Traffic

- Link/outbound clicks: clicks that represent traffic towards the destination. Do not silently substitute all clicks.
- Link/outbound CTR: link/outbound clicks / impressions × 100.
- Link/outbound CPC: spend / link/outbound clicks.
- Landing page views (LPV): destination page loads recorded by Meta.
- LPV rate: LPV / link clicks. A low rate can indicate speed, redirect, tracking or accidental-click problems.

## Funnel

- Add to cart (ATC), initiate checkout (IC), purchase: extract only the relevant action type from nested action arrays.
- ATC rate: ATC / LPV.
- Checkout rate: IC / ATC.
- Purchase conversion rate from LPV: purchases / LPV.
- CPA: spend / purchases.
- Purchase conversion value: purchase revenue attributed by Meta, not all action value.
- Meta ROAS: purchase conversion value / spend. If Meta returns `purchase_roas`, validate its attribution basis before using it.

## Interpretation rules

- State the exact date window, account timezone and attribution setting/window.
- Do not compare rows with different attribution settings as though they are equivalent.
- Meta and Shopify can disagree because of attribution, event timing, identity matching, refunds, taxes, shipping and timezone. Present both when both are available; do not force equality.
- Recent conversion data can backfill. Treat today and incomplete days as directional, not final.
- Separate delivery deterioration (CPM), engagement deterioration (CTR/CPC), page leakage (LPV rate), onsite conversion leakage and attribution/tracking issues.
- A high ROAS on tiny spend is not a proven winner. A poor CPA after too little spend is not a proven loser.
