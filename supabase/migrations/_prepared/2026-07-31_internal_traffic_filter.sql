-- PREPARED FOR REVIEW — NOT APPLIED
-- Reusable internal/invalid traffic exclusion, so every funnel report applies the
-- SAME rule and no analysis can silently forget one of them.
--
-- Encodes the four exclusions established 2026-07-31. Each has a measured reason:
--
-- 1. is_internal / traffic_class='bot' — the existing flags.
-- 2. Host must be everestlabs.co. `is_internal` does NOT catch Shopify theme-editor
--    preview traffic (*.myshopify.com, ?source=visualPreviewInitialLoad, ?oseid=).
--    MEASURED IMPACT OF THE FULL FILTER (all-time, verified 2026-07-31):
--      product_view sessions   1,318 raw ->   969 clean  (-26%)
--      add_to_cart  sessions      50 raw ->    18 clean  (-64%)
--      add_to_cart  EVENTS       696 raw ->    40 clean  (-94%)
--    Unfiltered add-to-cart is overstated ~2.8x at session level and ~17x at event level.
--    An earlier estimate of "24% overstatement" applied only the host filter and was too low.
-- 3. Known team anon_ids, confirmed by Tom.
-- 4. Shopify admin/preview referrers.
--
-- NOTE ON GRAIN: funnel metrics are count(distinct session_id). add_to_cart and
-- cart_add_request duplicate heavily; event-level counts are NOT valid numerators.

create or replace view marketing_touches_clean as
select *
from attribution_touches
where is_internal = false
  and coalesce(traffic_class, 'x') <> 'bot'
  and event_metadata->>'page_url' ilike '%everestlabs.co%'
  and coalesce(anonymous_id, '') not like 'elv_1779869995748%'
  and coalesce(anonymous_id, '') not like 'elv_1779806210806%'
  and coalesce(referrer, '') not ilike '%myshopify.com%'
  and coalesce(referrer, '') not ilike '%admin.shopify.com%';

comment on view marketing_touches_clean is
  'attribution_touches with the canonical internal/invalid-traffic exclusions applied '
  '(internal flag, bots, non-everestlabs.co hosts incl. Shopify theme preview, known team '
  'anon_ids, admin referrers). Use this view for ALL funnel reporting. Querying '
  'attribution_touches directly will include theme-preview traffic and overstate add-to-cart.';

-- Verification query — run after applying. Expect the clean counts to be LOWER.
--   select
--     (select count(distinct session_id) from attribution_touches
--       where event_type='add_to_cart') as raw_atc_sessions,
--     (select count(distinct session_id) from marketing_touches_clean
--       where event_type='add_to_cart') as clean_atc_sessions;
