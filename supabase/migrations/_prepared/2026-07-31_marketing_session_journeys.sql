-- PREPARED FOR REVIEW — NOT APPLIED
-- Canonical session-level journey view for KRYO B2C funnel analysis.
-- Encodes marketing/data-contracts/metric-definitions.md §0 eligibility so no analysis
-- can accidentally omit the preview-host filter.
--
-- Grain: one row per session_id.
-- Deliberately session-level, not visitor-level: anonymous_id cross-session persistence
-- is unverified (known-limitations.md §7), so a visitor-level join would be unsound.
-- Deliberately excludes purchase/lead fields: shopify_orders and kryo_leads are empty.

create or replace view marketing_session_journeys as
select
  t.session_id,
  min(t.ts)                                        as session_start_at,
  max(t.ts)                                        as session_end_at,
  min(t.ts)::date                                  as session_date,
  max(t.anonymous_id)                              as anonymous_id,
  max(t.device_type)                               as device_type,
  max(t.traffic_class)                             as traffic_class,
  max(t.ip_country)                                as ip_country,
  (array_agg(t.page_path order by t.ts))[1]        as entry_page_path,
  max(t.meta_ad_id)                                as meta_ad_id,
  max(t.meta_adset_id)                             as meta_adset_id,
  max(t.meta_campaign_id)                          as meta_campaign_id,
  max(t.landing_page_id)                           as landing_page_id,
  max(t.utm_campaign)                              as utm_campaign,

  -- funnel flags (session grain; event duplication is irrelevant to a boolean)
  max((t.event_type = 'product_view')::int)::boolean            as reached_product_page,
  max((t.event_type = 'scroll_depth_50')::int)::boolean         as engaged,
  max((t.event_type = 'scroll_depth_90')::int)::boolean         as deep_engaged,
  max((t.event_type in ('hero_cta_click','sticky_cta_click'))::int)::boolean as clicked_cta,
  max((t.event_type = 'cart_add_request')::int)::boolean        as requested_cart_add,
  max((t.event_type = 'cart_add_failed')::int)::boolean         as cart_add_failed,
  max((t.event_type = 'add_to_cart')::int)::boolean             as added_to_cart,
  max((t.event_type = 'cart_view')::int)::boolean               as viewed_cart,
  max((t.event_type = 'whatsapp_click')::int)::boolean          as clicked_whatsapp,
  max((t.event_type in ('checkout_start','cart_checkout_click'))::int)::boolean as started_checkout,

  count(*)                                          as event_count
from attribution_touches t
where t.is_internal = false
  and coalesce(t.traffic_class,'x') <> 'bot'
  and t.event_metadata->>'page_url' ilike '%everestlabs.co%'   -- excludes theme-preview traffic
group by t.session_id;

comment on view marketing_session_journeys is
  'Session-grain KRYO funnel view. Eligibility per metric-definitions.md §0 incl. mandatory '
  'everestlabs.co host filter excluding Shopify theme-preview traffic. Session grain only — '
  'visitor-level join unsound (anonymous_id persistence unverified). No purchase/lead fields: '
  'shopify_orders and kryo_leads are empty as of 2026-07-31.';
