# Table Map

Canonical table/view per question. Verified 2026-07-31. Full state: `source-inventory.md`.

| Question | Canonical source | Usable? |
|---|---|---|
| Who reached the product page? | `attribution_touches` (`product_view`) | Yes |
| Who engaged? | `attribution_touches` (`scroll_depth_*`) | Yes |
| Who asked to buy? | `attribution_touches` (`hero_cta_click`, `sticky_cta_click`) | Yes |
| Who requested a cart add? | `attribution_touches` (`cart_add_request`) | Yes |
| Who added to cart? | `attribution_touches` (`add_to_cart`) | Yes |
| Who clicked WhatsApp? | `attribution_touches` (`whatsapp_click`) | Yes — click only |
| Who became a qualified lead? | `kryo_leads` | **No — empty** |
| Who started checkout? | `shopify_funnel_daily` (no device split) | Partial |
| Who purchased? | `shopify_orders` | **No — empty** |
| What did ads deliver? | `meta_ad_metrics_daily` | Yes |
| Creative/placement breakdown? | `meta_ad_breakdowns_daily` | **No — orphaned** |
| Where is on-page friction? | `clarity_friction_elements`, `clarity_section_heatmap` | Yes |
| What was already learned? | `marketing_findings`, `marketing_learnings`, `marketing_experiments` | Yes — history |

## Do not use (stale/empty)
`kryo_funnel_daily` (1 row, 54 d) · `sessions` / `journey_events` (65 d) ·
`kryo_pdp_session_quality`, `kryo_pdp_section_events` (46 d) · `ga4_*`, `gsc_*` (48 d+)
