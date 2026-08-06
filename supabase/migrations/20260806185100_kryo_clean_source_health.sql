create or replace view public.vw_kryo_source_health as
with rows as (
  select
    'shopify_admin_readout'::text as source_name,
    'orders_revenue_sessions_funnel'::text as source_role,
    (select max(report_date)::text from public.kryo_shopify_daily_readout) as latest_period,
    (select max(coalesce(data_as_of, updated_at, created_at)) from public.kryo_shopify_daily_readout) as latest_sync,
    (select count(*) from public.kryo_shopify_daily_readout where report_date >= current_date - 7)::bigint as row_count_7d,
    'Shopify Admin analytics remains the order, revenue, product-session and checkout source of truth.'::text as notes
  union all
  select
    'first_party_attribution',
    'anonymous_session_utm_intent_spine',
    null,
    (select max(created_at) from public.attribution_touches),
    (select count(*) from public.attribution_touches where created_at >= now() - interval '7 days')::bigint,
    'First-party Supabase event spine for anonymous_id, session_id, UTM, Meta IDs and intent-state analysis.'
  union all
  select
    'pdp_session_quality',
    'scroll_click_active_time_quality',
    null,
    (select max(last_seen_at) from public.kryo_pdp_session_quality),
    (select count(*) from public.kryo_pdp_session_quality where last_seen_at >= now() - interval '7 days')::bigint,
    'KRYO PDP quality events: active time, scroll, clicks, rage/dead clicks, CTA clicks and section engagement.'
  union all
  select
    'meta_graph_ads',
    'ad_spend_delivery_frequency_ad_level_results',
    (select max(date)::text from public.meta_ad_metrics_daily),
    (select max(updated_at) from public.meta_ad_metrics_daily),
    (select count(*) from public.meta_ad_metrics_daily where date >= current_date - 7)::bigint,
    'Official Meta Marketing API only. Currently decision-allowed only after valid app/system-user token repopulates fresh rows.'
  union all
  select
    'ga4_data_api',
    'new_returning_users_source_medium_behaviour_validation',
    (select max(report_hour)::text from public.ga4_site_hourly),
    (select max(synced_at) from public.ga4_site_hourly),
    (select count(*) from public.ga4_site_hourly where report_hour >= now() - interval '7 days')::bigint,
    'GA4 Data API should validate user behaviour and new/returning users. Shopify remains revenue truth.'
  union all
  select
    'google_search_console',
    'organic_search_demand_query_page_visibility',
    (select max(date)::text from public.gsc_query_page_daily),
    (select max(fetched_at) from public.gsc_query_page_daily),
    (select count(*) from public.gsc_query_page_daily where date >= current_date - 7)::bigint,
    'GSC is organic-demand visibility only. Recent rows are delayed/provisional and should not drive paid-funnel decisions.'
  union all
  select
    'whatsapp_assisted_sales',
    'lead_capture_followup_return_purchase',
    null,
    (select max(updated_at) from public.kryo_whatsapp_conversations),
    (select count(*) from public.kryo_whatsapp_conversations where created_at >= now() - interval '7 days')::bigint,
    'Schema exists for WhatsApp-assisted sales, but no live leads yet. Decision use starts after tracked links/conversation status exist.'
  union all
  select
    'shopify_order_attribution',
    'order_to_anonymous_session_join',
    null,
    (select max(updated_at) from public.shopify_order_attribution),
    (select count(*) from public.shopify_order_attribution where updated_at >= now() - interval '7 days')::bigint,
    'Order attribution spine for anonymous/session to Shopify order matching. Empty until order join is wired.'
  union all
  select
    'clarity_secondary',
    'heatmap_friction_secondary_context',
    (select max(date)::text from public.clarity_section_heatmap),
    null::timestamptz,
    (select count(*) from public.clarity_section_heatmap where date >= current_date - 7)::bigint,
    'Clarity is secondary friction context. It must not override Shopify/Supabase/Meta source-of-truth data.'
)
select
  source_name,
  source_role,
  latest_period,
  latest_sync,
  row_count_7d,
  case
    when source_name = 'shopify_admin_readout' and latest_sync >= now() - interval '48 hours' and row_count_7d > 0 then 'fresh_trusted'
    when source_name in ('first_party_attribution','pdp_session_quality') and latest_sync >= now() - interval '24 hours' and row_count_7d > 0 then 'fresh_trusted'
    when source_name = 'meta_graph_ads' and latest_sync >= now() - interval '12 hours' and row_count_7d > 0 then 'fresh_trusted'
    when source_name = 'ga4_data_api' and latest_sync >= now() - interval '12 hours' and row_count_7d > 0 then 'fresh_trusted'
    when source_name = 'google_search_console' and latest_sync >= now() - interval '48 hours' and row_count_7d > 0 then 'fresh_secondary'
    when source_name = 'clarity_secondary' and row_count_7d > 0 then 'fresh_secondary'
    when row_count_7d = 0 then 'schema_ready_no_fresh_rows'
    else 'stale_untrusted'
  end as trust_state,
  case
    when source_name = 'shopify_admin_readout' and latest_sync >= now() - interval '48 hours' and row_count_7d > 0 then true
    when source_name in ('first_party_attribution','pdp_session_quality') and latest_sync >= now() - interval '24 hours' and row_count_7d > 0 then true
    when source_name = 'meta_graph_ads' and latest_sync >= now() - interval '12 hours' and row_count_7d > 0 then true
    when source_name = 'ga4_data_api' and latest_sync >= now() - interval '12 hours' and row_count_7d > 0 then true
    else false
  end as decision_allowed,
  case
    when row_count_7d = 0 then 'no_fresh_rows_after_2026_08_06_cleanup_or_not_yet_connected'
    when latest_sync is null and source_name not in ('clarity_secondary') then 'no_sync_timestamp_available'
    when source_name in ('meta_graph_ads','ga4_data_api','google_search_console') then 'external_api_requires_reauth_or_recent_success_before_use'
    else null
  end as stale_reason,
  notes,
  now() as evaluated_at
from rows;

comment on view public.vw_kryo_source_health is 'KRYO clean source-of-truth gate. Agents must not use a source for experiment decisions unless decision_allowed=true.';
