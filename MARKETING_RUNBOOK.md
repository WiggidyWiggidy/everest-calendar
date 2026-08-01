# Marketing System Runbook

Tool-neutral spec for the four marketing capabilities that came together this week (May 2026). Any agent (Claude Code, Codex, a one-off script, a future cron job) reads this file to know how to drive the system. The Claude Code slash commands under `~/.claude/commands/` are reference *implementations* of this spec — not the spec itself.

If you change a route shape, the rules below, or the table model, **update this file in the same PR**.

---

## 1. System map

| Layer | Where it lives | Owner |
|---|---|---|
| Backend (Next.js app) | `/Users/happy/Desktop/Claude Project/everest-calendar/` | Deployed to `https://everest-calendar.vercel.app` |
| Marketing API routes | `src/app/api/marketing/**/route.ts` | Same repo, all gated by `MARKETING_SYNC_SECRET` |
| Database + state | Supabase project `oksemtvjcfzicksmukmz` | https://oksemtvjcfzicksmukmz.supabase.co |
| Auth + secrets | `everest-calendar/.env.local` (local dev) + Vercel env (prod) | Tom |
| Inspection UI | https://everest-calendar.vercel.app + `/inbox` for approvals | Tom |
| Reference implementations | `~/.claude/commands/clone-ad.md`, `clone-product.md`, `launch-angle.md`, `launch-kryo.md` | Read for working examples |
| QC sub-agents (Claude format) | `~/.claude/agents/clone-ad-qc.md`, `clone-product-qc.md` | 5-/6-dimension diff checks |

**House rules** that apply across all four capabilities — read first:

- `everest-calendar/CLAUDE.md` — verification rules ("show the tool output that proves it"), critique loop, circuit breaker after 2 failures
- `/Users/happy/Desktop/Claude Project/CLAUDE.md` — session warmup, session end handoff, decision tiers
- All ads land **PAUSED**. The Vercel route enforces this; never override with `--force-live`.
- All landing pages publish **ACTIVE** to every storefront publication (so the URL is reachable from any geo immediately).
- `experiment_id` must propagate to *both* sides of a paired clone (`ad_creatives.experiment_id` + `landing_pages.experiment_id`) for attribution.
- Inbox-write *every* user-visible action so it appears in the approval dashboard.

---

## 2. Auth

Every `/api/marketing/*` route requires the `x-sync-secret` header:

```bash
cd "/Users/happy/Desktop/Claude Project/everest-calendar"
set -a; source .env.local; set +a
PROD="https://everest-calendar.vercel.app"

curl -X POST "$PROD/api/marketing/launch/clone-page" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

The env vars an agent needs:

| Env var | Used for |
|---|---|
| `MARKETING_SYNC_SECRET` | Header on every `/api/marketing/*` write call |
| `EVEREST_SUPABASE_URL` | Base for Supabase REST (`$EVEREST_SUPABASE_URL/rest/v1/<table>`) |
| `EVEREST_SUPABASE_SERVICE_KEY` | `apikey:` + `Authorization: Bearer` for Supabase REST |
| `PIPEBOARD_API_TOKEN` | Canonical Pipeboard MCP auth for Meta and GA4 reads. |
| `META_ACCESS_TOKEN` | Deprecated direct Meta Graph fallback only. Do not treat a deleted direct app as a KRYO blocker when Pipeboard Meta is canonical. |
| `META_AD_ACCOUNT_ID` | Format `act_NNNNN`, used in Ads Manager links and Pipeboard Meta account reads. |
| `META_PAGE_ID` | Required for `launch/promote-ads` creative spec |
| `SHOPIFY_STORE_URL` | Format `<shop>.myshopify.com`, used in admin links |

All eight live in `everest-calendar/.env.local`. Source the file at the top of any marketing task — same posture as the Claude Code slash commands.

For Shopify Admin API calls, never carry the token yourself: hit a `/api/marketing/shopify/*` route. Token refresh is handled centrally by `src/lib/shopify-auth.ts`.

---

## 3. Capability recipes

### 3a. Get Meta ad stats

Run the KRYO source-health gate first:

```bash
npm run audit:kryo-source-health
```

Use the emitted metric policy, not raw connector status, to decide whether a claim is allowed.

Current KRYO truth:

- Pipeboard Meta is canonical.
- Direct Meta Graph is deprecated fallback only.
- If ads are off and `meta_ad_metrics_daily` stops at an old date, report “no fresh delivery rows” and label historical rows by max date.
- Do not call a current CPA/ROAS/winner/scale verdict unless `paid_atc_purchase_verdicts.usable=yes`.
- `marketing_findings` and old pre-computed winners are unsafe as current verdicts unless they were refreshed from fresh, validated source-health.

**Historical/cached paid data:** Query the raw daily table and label the max date.

```bash
curl -s "$EVEREST_SUPABASE_URL/rest/v1/meta_ad_metrics_daily?select=date,ad_id,ad_name,spend,impressions,clicks,landing_page_views,add_to_cart,initiate_checkout,purchases,purchase_value&order=date.desc&limit=100" \
  -H "apikey: $EVEREST_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $EVEREST_SUPABASE_SERVICE_KEY"
```

**Onsite/Shopify/WhatsApp data:** Use the metric-policy entries from source-health:

- Onsite intent: `vw_kryo_intent_daily` / `attribution_touches`.
- WhatsApp interest: `attribution_touches where event_type='whatsapp_click'`.
- Shopify orders/revenue: `shopify_funnel_daily` only when fresh.
- GA4: Pipeboard Google Analytics MCP only when quota/usage allows live reads.
- GSC: blocked until Search Console access or a dedicated connector exists.

Do not “fix” stale data by blindly calling duplicate sync routes. Check `config/kryo-system-registry.json` first. Many sync routes are manual-only/quarantined.

Supabase REST has shown intermittent SSL closes on this machine. Retry reads before marking a source stale, and never write secret-bearing curl commands into artifacts.

### 3b. Adjust ads (clone an existing ad with one tweak)

**Preferred execution path for Meta mutations:** use the Pipeboard `meta_ads` MCP tools when they are available. Discover them first via tool search. They provide typed creative/ad creation, duplication, and delivery checks. Use direct Graph HTTP only as a read path or as a last-resort fallback after Pipeboard is unavailable or returns a blocking error. Any fallback must preserve the full source creative payload and pass the complete parity gate before the ad is described as ready.

Single route: `POST /api/marketing/ads/duplicate`. Wraps Meta Graph `/{id}/copies` (v25.0). Always lands PAUSED.

```bash
curl -sX POST "$PROD/api/marketing/ads/duplicate" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source_id": "120242411668780279",
    "level": "ad",
    "rename_suffix": " — heat_fatigue",
    "override": {
      "title": "Beat the 45°C grind",
      "body": "30-second cryo-shower at AED 3,990. No tub, no plumbing job.",
      "link_url": "https://everestlabs.co/en-gb/products/kryo_heat-fatigue"
    },
    "angle": "heat_fatigue",
    "experiment_id": "<uuid>",
    "landing_page_id": "<uuid from clone-page response>"
  }'
```

Request fields (full set in `src/app/api/marketing/ads/duplicate/route.ts`):

- `source_id` (required) — the source Meta entity ID
- `level` — `ad` (default) | `adset` | `campaign`
- `deep_copy` — adset/campaign: include children. Default false.
- `rename_suffix`, `rename_strategy` — defaults to `ONLY_TOP_LEVEL_RENAME`
- `override` — ad-level only: `{ title, body, link_url, url_tags }`. Meta May-2025 feature.
- `adset_targeting_override`, `adset_campaign_id` — adset-level only
- `experiment_id`, `angle`, `hook_type`, `audience_segment_label`, `landing_page_id` — tagging

Response: `{ success, new_ad_id, ad_creative_row_id, is_paused, override_applied }`.

**Rules:**
- Source ad must NOT be Advantage+ Shopping or Advantage+ App — Meta blocks `/copies` for those (returns 400).
- For DCT (`asset_feed_spec`) source ads, `override.title/body` apply to scalar fallbacks only. DCT-internal swaps need a manual recreate.
- For any LP-only swap or manual DCT recreation, fail closed until the source-vs-target diff proves parity for `object_story_spec`, `asset_feed_spec`, scalar copy, media, CTA, page/Instagram IDs, UTMs, campaign, ad set, targeting, placements and budget. The destination URL is the only permitted difference.
- After cloning, the new ad has `status='live_paused'` in `ad_creatives`. Flip live via Meta Ads Manager or `launch/process-approvals`.

**Alternate path — create a fresh ad from a creative seed:** insert an `ad_creatives` row with `status='ready_to_promote'` then call `POST /api/marketing/launch/promote-ads`. That route creates a new campaign + adset + ad in Meta. Use only when there's no winning source ad to clone (e.g. cold-start).

### 3c. Duplicate landing pages (clean A/B clone)

Three Vercel routes called in sequence. Reference: `~/.claude/commands/clone-product.md`.

```bash
SOURCE_HANDLE="kryo-2-0"
TARGET_HANDLE="kryo_2-0-heat"
VARIANT_ANGLE="heat_fatigue"

# (1) Discover the source product's template_suffix
SRC=$(curl -s "$PROD/api/marketing/shopify/get-product?handle=$SOURCE_HANDLE" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET")
SRC_SUFFIX=$(echo "$SRC" | python3 -c "import json,sys; print(json.load(sys.stdin)['template_suffix'])")
TARGET_NAME=$(echo "$SRC" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")

# (2) Clone the theme template (no patches — bit-identical)
curl -sX POST "$PROD/api/marketing/theme/clone-template" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" -H "Content-Type: application/json" \
  -d "{\"source_key\":\"templates/product.$SRC_SUFFIX.json\",
       \"target_key\":\"templates/product.$TARGET_HANDLE.json\",
       \"overwrite\":true,\"patches\":[]}"

# (3) Clone the product (Shopify productDuplicate + copy metafields + publish ACTIVE)
CLONE=$(curl -sX POST "$PROD/api/marketing/launch/clone-page" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" -H "Content-Type: application/json" \
  -d "{
    \"source_handle\": \"$SOURCE_HANDLE\",
    \"target_handle\": \"$TARGET_HANDLE\",
    \"target_name\": \"$TARGET_NAME\",
    \"variant_angle\": \"$VARIANT_ANGLE\",
    \"hypothesis\": \"$VARIANT_ANGLE A/B clone of $SOURCE_HANDLE\",
    \"publish_active\": true,
    \"copy_metafields_from_source\": true,
    \"experiment_id\": \"<uuid>\"
  }")
NEW_PID=$(echo "$CLONE" | python3 -c "import json,sys; print(json.load(sys.stdin)['shopify_product_id'])")

# (4) Bind the new template to the new product
curl -sX POST "$PROD/api/marketing/theme/configure-product" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" -H "Content-Type: application/json" \
  -d "{\"product_id\": \"$NEW_PID\", \"template_suffix\": \"$TARGET_HANDLE\"}"
```

Clone-page request fields (full shape in `src/app/api/marketing/launch/clone-page/route.ts`):

- `variant_angle` (required), `target_name` (required)
- `target_handle` — exact handle, no auto-slugify. If taken, response has `handle_conflict.actual` with what Shopify served.
- `source_handle` — default `kryo_`. Pass to clone any other product.
- `overrides[]` — find/replace pairs on body_html
- `body_html_full_replace` — wholesale body_html swap
- `metafields[]` — per-product metafield writes (`kryo.hero_eyebrow`, etc.)
- `publish_active` — `true` (default for v2). `false` = legacy DRAFT mode.
- `copy_metafields_from_source` — copies all source metafields (defaults to `false`, but the runbook recipe sets it true)
- `experiment_id`, `hypothesis` — tracking

Response: `{ success, shopify_product_id, shopify_handle, landing_page_id, metafields_copied_from_source, handle_conflict? }`.

**Rules:**
- Bit-identical baseline first, then patch. Don't try to clone + override copy in one step — overrides on the source product can race with the duplicate API.
- Shopify will reject a target_handle that already exists. If you need to overwrite, delete the old product manually first.
- After clone, the new product is ACTIVE to all publications. Test reachability at `everestlabs.co/en-gb/products/<new-handle>` before flipping ad live.

### 3d. Adjust landing pages (patch the cloned template, not the source)

The clone in 3c gave you `templates/product.<target>.json` as a safe sandbox. Patch it with `theme/clone-template` using `source_key == target_key`:

```bash
# Patch one AI block's heading
curl -sX POST "$PROD/api/marketing/theme/clone-template" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" -H "Content-Type: application/json" \
  -d '{
    "source_key": "templates/product.kryo_2-0-heat.json",
    "target_key": "templates/product.kryo_2-0-heat.json",
    "overwrite": true,
    "patches": [
      { "section": "blocks_dijJNt",
        "block": "ai_gen_block_a11bf55_CzyXYf",
        "settings": { "heading": "Beat the 45°C grind" } }
    ]
  }'

# Swap a hero image by slot name
curl -sX POST "$PROD/api/marketing/theme/clone-template" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" -H "Content-Type: application/json" \
  -d '{
    "source_key": "templates/product.kryo_2-0-heat.json",
    "target_key": "templates/product.kryo_2-0-heat.json",
    "overwrite": true,
    "patches": [
      { "slot": "hero_overlay_lifestyle",
        "image_url": "https://cdn.shopify.com/s/files/.../heat-hero.webp" }
    ]
  }'
```

Patch shapes:
- **Raw:** `{ section, block?, settings }` — section + optional block + settings to merge.
- **Slot:** `{ slot, image_url }` — resolver looks up which section/block owns that slot for this template_suffix in the `kryo_image_slots` table and converts the CDN URL to `shopify://shop_images/<filename>`.

For wholesale body_html changes (not block-level), use `POST /api/marketing/launch/update-body-html`. For re-publishing or status flips, `POST /api/marketing/launch/publish-product`.

---

## 4. State model

Tables an agent reads or writes during a marketing task:

| Table | Purpose | Notes |
|---|---|---|
| `marketing_findings` | Pre-computed winners (top_ad, top_lp, best_angle, etc.) | Refreshed nightly. SELECT before anything else. |
| `meta_ads` | Per-ad metadata from Meta (synced) | Source of truth for `headline`, `body`, `asset_feed_spec`, `effective_status`. New columns added 14 May: `angle`, `hook_type`, `audience_segment_label`, `experiment_id`. |
| `ad_creatives` | Internal ad records (pre-Meta or post-Meta clone) | `status` ∈ `draft`, `ready_to_promote`, `live_paused`, `live`, `paused`, `archived`. FK `landing_page_id`. |
| `ad_metrics_daily` | Per-ad per-day insights | Joined to meta_ads via `meta_ad_id`. |
| `landing_pages` | Tracked Shopify product pages | `status` ∈ `testing`, `winner`, `loser`, `archived`. FK `experiment_id`. |
| `marketing_experiments` | Split tests + hypotheses | `status` ∈ `running`, `paused`, `complete`. `execution_spec` JSONB has angle + handles. |
| `marketing_proposals` | Agent-generated action proposals | Pause/scale/new-creative suggestions awaiting approval. |
| `platform_inbox` | Approval queue (the dashboard surface) | `status` ∈ `pending`, `approved`, `edited`, `rejected`, `auto_sent`, `snoozed`, `transitioned`. Marketing categories: `ad_clone`, `lp_clone`, `angle_launch`. |
| `product_context` | Business KB (canonical copy, rubrics, runbooks) | Read-only from agents. `kryo_v4_canonical` is the source of truth for ad copy claims. |
| `kryo_image_slots` | Maps slot_name → section/block per template | Used by clone-template's slot resolver. |

Key RPCs (Supabase functions):
- `session_warmup()` — inbox counts + last_handoff + broad product/procurement invariants. BOM/component failures from this RPC are not KRYO marketing-data or website-ops readiness failures.
- `check_invariants()` — health probe. Call at session end.
- `compute_ice_score(angle text)` — ICE estimate for a proposed experiment.
- `propose_lp_experiments()` — data-driven LP test suggestions from clarity_section_heatmap.
- `get_marketing_trends(days_back int)` — rolled-up KPI deltas.
- `get_pending_inbox()` — same as the dashboard's pending tab.

---

## 5. Inbox conventions

Every user-visible action writes a row to `platform_inbox`. The dashboard at `/inbox` is Tom's approval surface.

**Actual table schema (verified 2026-05-17 by codex end-to-end test):**

Top-level columns: `id`, `user_id`, `platform`, `status`, `approval_tier`, `ai_summary`, `raw_content`, `ai_recommendation`, `draft_reply`, `final_reply`, `media_type`, `media_url`, `metadata` (JSONB), `candidate_id`, `contact_identifier`, `contact_name`, `cowork_message_inbound_id`, `created_at`, `updated_at`, `approved_at`.

**There is NO top-level `category`, `priority`, or `summary` column.** Older docs (and Claude slash commands written pre-2026-05-17) wrote these as top-level fields and the inserts failed with Postgres 400. Correct shape:

- `category` lives in `metadata.category`
- `priority` lives in `metadata.priority`
- `summary` → top-level `ai_summary` (mirror to `raw_content` for backward compat)
- `approval_tier` (integer 0/1/2) is the real "tier" column

| `metadata.category` | When | Other `metadata` keys |
|---|---|---|
| `ad_clone` | `/api/marketing/ads/duplicate` succeeded | `source_meta_ad_id`, `new_meta_ad_id`, `ad_creative_id`, `angle`, `override_applied` |
| `lp_clone` | `/api/marketing/launch/clone-page` succeeded | `source_handle`, `new_handle`, `new_product_id`, `new_lp_url`, `variant_angle`, `experiment_id` |
| `angle_launch` | `/launch-angle` orchestrator completed (combines both) | `experiment_id`, `angle`, `source_ad_id`, `source_lp_handle`, `new_meta_ad_id`, `new_lp_handle`, `new_lp_url`, `new_title`, `new_body` |

Canonical POST shape:

```bash
curl -sX POST "$EVEREST_SUPABASE_URL/rest/v1/platform_inbox" \
  -H "apikey: $EVEREST_SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $EVEREST_SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{
    "user_id": "174f2dff-7a96-464c-a919-b473c328d531",
    "platform": "marketing",
    "status": "pending",
    "approval_tier": 1,
    "ai_summary": "LP cloned: kryo-2-0 → kryo_2-0-heat (ACTIVE)",
    "raw_content": "LP cloned: kryo-2-0 → kryo_2-0-heat (ACTIVE)",
    "metadata": {
      "category": "lp_clone",
      "priority": "medium",
      "source_handle": "kryo-2-0",
      "new_handle": "kryo_2-0-heat",
      "new_product_id": "9334268002612",
      "new_lp_url": "https://everestlabs.co/en-gb/products/kryo_2-0-heat",
      "variant_angle": "heat_fatigue",
      "experiment_id": "<uuid>"
    }
  }'
```

`status` values are constrained by a Postgres CHECK to: `pending`, `approved`, `edited`, `rejected`, `auto_sent`, `snoozed`, `transitioned`. Anything else returns 400.

`approval_tier` values map to `everest-calendar/CLAUDE.md` Decision Tiers — `0` (auto), `1` (draft + Tom approves), `2` (Tom writes).

---

## 6. Verification dimensions (use the QC sub-agents as a checklist)

After any clone, verify against these dimensions. The Claude Code QC sub-agents encode them:

**Product clone (`~/.claude/agents/clone-product-qc.md`) — 6 dims:**
1. URL shape — `/products/<handle>` reachable at 200, in `en-gb` + `en` locale prefixes
2. Template parity — `template_suffix == target_handle`
3. body_html — character count matches source (±10 for whitespace)
4. Metafields — `metafields_copied >= 1`, and the count matches the source's `kryo.*` metafield count
5. Variants/media — variant count + image count match source
6. Publication reach — published to all storefront publications (all markets)

**Ad clone (`~/.claude/agents/clone-ad-qc.md`) — 5 dims:**
1. PAUSED state — `effective_status='PAUSED'` on the new ad
2. Override applied — if you passed `override`, the new ad's headline/body matches what you sent (catches the May 2026 mint-and-swap bug)
3. Audience inherited — new adset's targeting JSON matches source unless `adset_targeting_override` was set
4. Pixel + conversion event preserved — `conversion_specs` and `tracking_specs` arrays match source
5. Naming convention — new ad name = source name + rename_suffix

Run the QC verbatim, surface verdict to the user. On FAIL, propose the smallest fix before continuing.

---

## 7. Decision tiers (applies to all four capabilities)

From `everest-calendar/CLAUDE.md`:

- **Tier 0 (just do it):** internal logging, status queries, drafting variants, syncing data, writing to `platform_inbox` as `pending`.
- **Tier 1 (draft + Tom approves):** anything that creates a clone, even paused. The system always lands the clone PAUSED + `pending`; Tom flips it live via Meta Ads Manager or the inbox approval flow. **Never flip an ad to `ACTIVE` autonomously.**
- **Tier 2 (Tom writes):** pricing claims in ad copy, anything financial.

---

## 8. Out-of-scope safety reminders + known gotchas

- Don't restart, redeploy, or "improve" the @KRYO_BUILDINGBOT Edge Function, Supabase triggers, the 9 RPC functions, or the 11 scheduled tasks without explicit ask.
- Don't edit `~/.openclaw/` files — OpenClaw is the legacy WhatsApp gateway, separate system, same DB. Marketing work never touches it.
- Don't push to `main` directly. Branch: `feature/<name>`, PR back to `main`.
- Currency: `$` from Chinese suppliers = USD by default; from anyone else state the unit explicitly.

### Known gotchas (verified 2026-05-17)

- **`POST /api/marketing/launch/publish-product` ignores `status: "DRAFT"`.** Lines 97–103 of the route always set `status: 'active'` after the optional explicit flip, so anything you pass to "draft" gets overwritten back to active during the publish-to-all-channels step. Don't rely on this route to hide a product; delete via Shopify admin instead (no DELETE route is exposed — see below).
- **No Shopify product DELETE route.** `/api/marketing/shopify/` only exposes get/list/publish/upload/generate/whoami. To remove a clone gone wrong: open `https://everestlabs.myshopify.com/admin/products/<id>` → More actions → Delete. 5 seconds. Or call Shopify Admin REST directly via the OAuth `client_credentials` flow (see `src/lib/shopify-auth.ts`).
- **`POST /api/marketing/ads/duplicate` returns Meta 400 for source ads created before May 2026** with `error_subcode: 3858504` ("standard enhancements field in creative has been deprecated"). The /copies endpoint inherits the source creative's `standard_enhancements` block which Meta no longer accepts on new ad creation. Workaround: build a fresh creative via `/api/marketing/ads/create` + post to Meta via `/api/marketing/launch/promote-ads`. Real fix: route should strip `standard_enhancements` from inherited spec before posting. Tracked separately.
- **Branch lag on local working tree.** Some routes (e.g. `/api/marketing/ads/duplicate`, PR #127) live on `main` but may not be present on whatever feature branch you have checked out locally. The Vercel deploy tracks `main`, so HTTP calls always work — but `cat src/app/api/marketing/ads/duplicate/route.ts` may say "no such file". Resolve by `git fetch && git show main:<path>` or by rebasing onto `main`.

---

## 9. Where to update which file

When a route changes, update in order:
1. The route file under `src/app/api/marketing/`
2. This runbook (`MARKETING_RUNBOOK.md`)
3. The Claude Code reference slash command at `~/.claude/commands/<name>.md` if its bash recipe is now wrong
4. Tom's auto-memory under `/Users/happy/.claude/projects/-Users-happy-Desktop-Claude-Project/memory/` if the conceptual model shifted

When a Supabase table changes, update in order:
1. Migration file under `supabase/migrations/`
2. Section 4 (State model) of this runbook
3. `everest-calendar/CLAUDE.md` Key Tables section if the status enum changed

---

*Last verified against `main` on 2026-05-18. Route shapes pulled from src/app/api/marketing/{launch/clone-page, ads/duplicate, theme/clone-template, theme/configure-product}/route.ts. End-to-end clone-page chain validated by codex test against live Vercel + Shopify + Supabase (new product `9334268002612`, landing_pages row `dc35ca6a-2fb4-4393-a334-24e991092233`).*
