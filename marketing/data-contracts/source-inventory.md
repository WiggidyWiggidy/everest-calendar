# KRYO Marketing Source Inventory

Verified by direct query against Supabase project `oksemtvjcfzicksmukmz` on **2026-07-31**.
Every row below is measured, not assumed. Re-verify before any diagnosis.

Timezone: all `date` columns are UTC-derived. Currency: AED.

---

## Verdict summary

| Source | State | Safe for analysis? |
|---|---|---|
| `attribution_touches` | **LIVE** (0.0 d) | Yes — with §0 eligibility filter |
| `meta_ad_metrics_daily` | **LIVE** (1.4 d) | Yes |
| `clarity_friction_elements` | **LIVE** (1.4 d) | Yes |
| `shopify_funnel_daily` | **LIVE** (1.4 d) | Yes — but see note |
| `clarity_section_heatmap` | LIVE (2.4 d) | Yes |
| `lp_funnel_daily` | LAGGING (3.4 d) | Directional |
| `marketing_findings` | LIVE (1.4 d) | Yes |
| `marketing_experiments` | STALE (24.8 d) | Read-only history |
| `marketing_learnings` | STALE (25.1 d) | Read-only history |
| `kryo_pdp_session_quality` | STALE (45.9 d) | **No** |
| `kryo_pdp_section_events` | STALE (46.8 d) | **No** |
| `ga4_page_hourly` | STALE (48.4 d) | **No** — auth failure |
| `gsc_query_page_daily` | STALE (49.4 d) | **No** — auth failure |
| `kryo_funnel_daily` | STALE (54.4 d), 1 row | **No** — effectively empty |
| `sessions` / `journey_events` | STALE (64.7 d) | **No** |
| `meta_ad_breakdowns_daily` | ORPHANED (75.4 d) | **No** — sync route deleted |
| `meta_asset_performance_daily` | ORPHANED (151.4 d) | **No** — no refresh path |
| `shopify_orders` | **EMPTY (0 rows)** | **No** |
| `kryo_leads` | **EMPTY (0 rows)** | **No** |
| `kryo_whatsapp_conversations` | **EMPTY (0 rows)** | **No** |

---

## Corrections to the assumed baseline

The activation brief listed these as established. Direct query contradicts three of them.
Recorded here so the error is not inherited by later work.

| Brief stated | Measured reality |
|---|---|
| "Shopify … currently flowing into Supabase" | `shopify_funnel_daily` is fresh, but **`shopify_orders` has 0 rows**. Order-level and revenue analysis is impossible. |
| "storefront event data … flowing" | True — but the stream is **contaminated by Shopify theme-preview traffic** that `is_internal` does not exclude. |
| WhatsApp pathway is measurable | `kryo_leads` and `kryo_whatsapp_conversations` are **both empty**. Only `whatsapp_click` (9 live sessions/60d) exists. |

---

## Detail

### `attribution_touches` — canonical first-party spine
- **Grain:** one row per event. 13,161 rows; latest `ts` 2026-07-31 09:11 UTC.
- **Identifiers:** `session_id` (analysis grain), `anonymous_id`, `customer_id` (sparse),
  `meta_ad_id` / `meta_campaign_id` / `meta_adset_id`, `landing_page_id`, `fbclid`.
- **Segmentation available:** `device_type`, `traffic_class`, `page_path`, `ip_country`,
  `utm_*`, `referrer`.
- **Range:** 2026-05-02 → 2026-07-31.
- **Refresh:** continuous, storefront web pixel.
- **Join:** `meta_ad_id` → `meta_ad_metrics_daily.ad_id`.
- **Limitations:**
  - `is_internal` does **not** exclude Shopify theme-editor preview traffic. Host filter mandatory.
  - `add_to_cart` / `cart_add_request` duplicate heavily (up to ~16×/session). Session grain only.
  - `checkout_start` fired **once ever** (2026-06-02). Checkout stage is untracked first-party.
  - Section-view events regressed: `reviews_section_view` stopped 2026-06-08,
    `comparison_section_view` stopped 2026-06-22.
  - `sticky_cta_click` only began 2026-07-26 — no history before that.

### `meta_ad_metrics_daily`
- 174 rows, max date 2026-07-30. Grain: ad × day. Safe for spend/impressions/clicks/LPV.
- Join key `ad_id`. Attribution window must be stated when quoting conversions.

### `shopify_funnel_daily`
- 95 rows, max 2026-07-30. Grain: day (site-wide; **no device or source split**).
- Last 45 days: **1 checkout started, 1 completed** (2026-07-06); every other day zero.
- Corroborates the first-party finding that checkout volume is ~zero.

### Clarity
- `clarity_friction_elements` 3,219 rows (1.4 d); `clarity_section_heatmap` 209 rows (2.4 d).
- Use for friction diagnosis only — never as a conversion source.

### GA4 / GSC — stale, not blocking
- `ga4_page_hourly` last 2026-06-13; `gsc_query_page_daily` last 2026-06-12.
- Cause: Google authentication failure (see `authentication-status.md`).
- **Not a prerequisite** for the current diagnosis. Do not block on repair.

### Orphaned Meta feeds
- `meta_ad_breakdowns_daily` — 403 rows, last 2026-05-17. Sync route deleted
  (`src/app/api/marketing/sync/meta-breakdowns/route.ts`). Deletion is **uncommitted and
  recoverable**; the backing migration is likewise preserved.
- `meta_asset_performance_daily` — 156 rows, last 2026-03-02. No refresh path in the
  nightly analytics sync.
- Neither is required for the current diagnosis; both block creative-level breakdown analysis.
