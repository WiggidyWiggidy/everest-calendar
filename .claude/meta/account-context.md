# Meta Ads account context

Replace `REQUIRED` values. Keep this compact and factual. Claude reads it only during Meta skills.

## Account

- Business/brand: KRYO / Everest Labs
- Meta ad account ID: 1737922103322223 ("Everest Labs Ad Account", business_id 996702814674025) — confirmed live via `ads_get_ad_accounts`, 2026-07-28
- Account timezone: Australia/Sydney — confirmed live, 2026-07-28
- Account currency: AUD — confirmed live, 2026-07-28
- Primary market(s): Dubai/UAE ads only (per Tom, 2026-07-06 session) — not re-verified live this session, treat as ASSUMED until confirmed via campaign targeting query
- Website/store attribution source: Shopify and Meta; note known reporting differences
- Default Meta attribution setting: REQUIRED; retrieve via `/meta-setup` or `/meta-verify`
- Primary conversion event: Purchase
- Secondary events: Landing Page View, Add to Cart, Initiate Checkout, WhatsApp lead where applicable

## Commercial economics

- Product / offer: REQUIRED
- Selling price: REQUIRED
- Gross revenue recognised per purchase: REQUIRED
- Variable cost excluding ads: REQUIRED
- Break-even CPA: **A$400** — confirmed by Tom 2026-07-31. Implies contribution A$400/order at AOV A$2,000 = **20% margin** (COGS ~A$1,600).
- Target CPA: **under A$100** — confirmed by Tom 2026-07-31 (= ROAS 20x).
- Break-even Meta ROAS: **5.0x** — confirmed by Tom 2026-07-31. **Minimum acceptable; treat 5x as the floor, not a target.**
- Target Meta ROAS: REQUIRED
- Minimum spend before a no-purchase ad can be judged: REQUIRED
- Minimum purchases before a winner claim: REQUIRED

## Current strategy

- Primary objective: profitable new-customer acquisition
- Traffic mix: primarily cold Meta traffic
- Main pathways: direct purchase and, where configured, WhatsApp capture/follow-up
- Prospecting campaign names or IDs: REQUIRED
- Retargeting campaign names or IDs: REQUIRED
- Campaigns/objects to exclude: REQUIRED or none
- Current landing page URL(s): REQUIRED

## Decision constraints

- Maximum acceptable daily spend change without a new instruction: 0%; never mutate by default
- Preferred budget-change increment when explicitly approved: REQUIRED
- Protect learning/testing unless evidence exceeds the thresholds above
- Business facts override generic advertising benchmarks
