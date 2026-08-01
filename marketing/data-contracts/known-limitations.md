# Known Limitations

Verified 2026-07-31. Every item is measured, not assumed.

## 1. Preview-traffic contamination (highest severity)
Shopify theme-editor traffic enters `attribution_touches` with `is_internal=false`.
Signature: `page_url` on `everestcoldwater.myshopify.com`, `?source=visualPreviewInitialLoad`, `?oseid=`.
Impact: 57 sessions supplying **8 of 34** add-to-cart sessions (24% overstatement); worse at
event level (~16 duplicate cart events/session).
Control: mandatory host filter, `metric-definitions.md` §0.
**Any prior funnel analysis without this filter overstated add-to-cart.**

## 2. Event duplication
`add_to_cart` / `cart_add_request` fire repeatedly within a session.
Control: session grain only. Event-level counts are prohibited as funnel numerators.

## 3. Checkout is untracked first-party
`checkout_start` fired **once ever** (2026-06-02). Cart-to-checkout is UNKNOWN from
first-party data. `shopify_funnel_daily` gives a site-wide daily count with **no device or
source split**.

## 4. Empty tables presented as live
`shopify_orders`, `kryo_leads`, `kryo_whatsapp_conversations` are **all 0 rows**, despite
the activation brief listing Shopify and the WhatsApp pathway as flowing. Purchase, revenue,
RPV, days-to-conversion and qualified-lead metrics are all UNKNOWN.

## 5. Instrumentation regressions
`reviews_section_view` stopped 2026-06-08; `comparison_section_view` stopped 2026-06-22;
`sticky_cta_click` only began 2026-07-26 (no prior history). Section-level engagement
analysis is unreliable across these boundaries.

## 6. Missing events
No `pricing_section_view`, no model-interaction event. These metrics are UNKNOWN — they must
not be proxied onto a near-neighbour event.

## 7. Identity
`anonymous_id` cross-session persistence is unverified, so new-vs-returning is not trustworthy.
No reliable visitor-level join exists between sessions and orders. Session grain is the
highest reliable grain today.

## 8. Orphaned feeds
`meta_ad_breakdowns_daily` stale since 2026-05-17 (sync route deleted, recoverable).
`meta_asset_performance_daily` stale since 2026-03-02 (no refresh path).
GA4 and GSC stale since mid-June (Google auth failure).
