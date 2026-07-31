# Analysis View Plan

## Existing assets reviewed first
`vw_kryo_visitor_journey`, `vw_kryo_true_funnel_7d`, `vw_kryo_intent_daily`,
`vw_kryo_growth_spine_daily`, `kryo_funnel_daily`, `lp_funnel_daily`,
`kryo_lp_scorecards`, `kryo_pdp_*`, `shopify_funnel_daily`, `attribution_touches`.

**Why a new view is still needed:** none of the existing views applies the
`everestlabs.co` host filter, so all of them include Shopify theme-preview traffic and
overstate add-to-cart. Several rest on tables that are stale or empty
(`kryo_funnel_daily` = 1 row, 54 d; `kryo_pdp_*` = 46 d; `sessions` = 65 d).

## Prepared — NOT APPLIED
`supabase/migrations/_prepared/2026-07-31_marketing_session_journeys.sql`

Smallest view that answers the required questions: which traffic reaches the product page,
who engages, who clicks WhatsApp, who adds to cart, who starts checkout, and which ads,
pages, devices and visitor types produce those outcomes.

**Verified read-only against live data on 2026-07-31** — reproduces the diagnosis exactly:
mobile 833 PDP / 0.36% ATC; desktop 190 PDP / 12.11% ATC.

## Deliberate limitations
- **Session grain, not visitor grain.** `anonymous_id` cross-session persistence is
  unverified, so a visitor-level join would be unsound. Documented rather than faked.
- **No purchase, revenue or lead fields.** `shopify_orders` and `kryo_leads` are empty.
  Inventing columns for them would imply capability that does not exist.
- **No Clarity fields.** No reliable session-level join exists.
