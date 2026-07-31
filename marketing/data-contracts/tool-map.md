# Tool Map

| Need | Tool | Access |
|---|---|---|
| Query marketing data | Supabase MCP `execute_sql`, project `oksemtvjcfzicksmukmz` | Read-only for analysis |
| Inspect schema | Supabase MCP `list_tables` | Read-only |
| Meta ad entities & insights | `meta-ads` MCP (`ads_*`) | Read-only unless Tom approves a change |
| Shopify storefront/admin | `shopify-dev-mcp` | Read-only unless Tom approves |
| Apply schema change | Supabase MCP `apply_migration` | **Tom's approval required** |
| Deploy | Vercel | **Tom's approval required** |

Meta platform field mapping (which API field backs which metric) is retained in
`.claude/meta/tool-map.md`. It maps fields only — it does not define metrics.
Metric definitions come from `metric-definitions.md`.
