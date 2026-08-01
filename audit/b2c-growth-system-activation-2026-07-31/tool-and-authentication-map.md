# Tool and Authentication Map

## Tools
See `marketing/data-contracts/tool-map.md`.

| Need | Tool | Approval |
|---|---|---|
| Query marketing data | Supabase MCP `execute_sql` (`oksemtvjcfzicksmukmz`) | None (read-only) |
| Inspect schema | Supabase MCP `list_tables` | None |
| Meta insights | `meta-ads` MCP (`ads_*`) | None for reads |
| Meta campaign change | `meta-ads` MCP | **Tom** |
| Shopify | `shopify-dev-mcp` | **Tom** for writes |
| Apply migration | Supabase MCP `apply_migration` | **Tom** |
| Deploy | Vercel | **Tom** |

## Authentication
Full detail: `marketing/data-contracts/authentication-status.md`.

**Working:** Supabase · Meta Ads · Shopify storefront pixel · Clarity
**Failed:** GA4 · GSC (Google auth) — stale ~48 d, **not blocking**
**Suspect:** Shopify Admin orders — `shopify_orders` empty while `shopify_funnel_daily` updates
**Not capturing:** WhatsApp — `kryo_whatsapp_conversations` and `kryo_leads` both empty
