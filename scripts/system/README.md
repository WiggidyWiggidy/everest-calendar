# KRYO Page Builder + Asset Library — Autonomous Runtime

**Claude builds. Kimi + OpenClaw + fal.ai run. Tom approves 2 minutes a day.**

This is the full autonomous stack that produces god-tier KRYO V4 long-form product pages on Shopify, on a daily cron, drawing from a constantly-replenished library of manual + AI-generated graphics, all QC'd before they reach Tom.

---

## Two parallel autonomous loops

```
┌─────────────────────────────────────────────────────────────────┐
│ LOOP 1 — ASSET LIBRARY (every 6h)                               │
│ ┌───────────┐    ┌──────────────┐    ┌────────────────────┐    │
│ │ Manual    │    │ AI generator │    │ media_assets table │    │
│ │ uploads   │───▶│ (fal.ai →    │───▶│ + Supabase Storage │    │
│ │ - dashbrd │    │ flux-pro)    │    │ kryo-assets bucket │    │
│ │ - folder  │    │ + qc-asset   │    └────────────────────┘    │
│ └───────────┘    └──────────────┘             │                 │
│                                                ▼                 │
│                              Tom approves on /dashboard/assets   │
│                              Approved → eligible for embedding   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LOOP 2 — PAGE BUILDER (daily 7am)                               │
│   1. Pick angle of the day (rotates morning_energy → ... )      │
│   2. 3 Kimi attempts (literal/divergent/aggressive)             │
│   3. Each attempt calls select-assets() → embeds approved imgs  │
│   4. Compose body_html, screenshot, 3-inspector QC              │
│   5. Synthesis attempt if all below threshold                   │
│   6. Winner → Shopify (publish_active=true, all geos)           │
│   7. Re-QC LIVE Shopify URL (parity check)                      │
│   8. inbox-write with screenshots + score + parity verdict      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       Tom reviews /inbox card
                       Approve → live in ad rotation
                       Reject → archived, swarm tries next angle
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LOOP 3 — PERFORMANCE FEEDBACK (nightly)                         │
│   refresh-asset-performance.mjs reads lp_funnel_daily,          │
│   bumps media_assets.performance_score for assets in            │
│   high-converting pages. Selector then prefers winners.         │
└─────────────────────────────────────────────────────────────────┘
```

---

## File map

```
scripts/system/
├── kimi-call.mjs                     ✓ LLM wrapper (Kimi/Moonshot, 2/8/32s retry)
├── load-canonical.mjs                ✓ Pulls product_context.kryo_v4_canonical from Supabase
├── select-assets.mjs                 ✓ Asset selector — LRU approved per scene+angle
├── clone-and-substitute.mjs          ✓ Strategy-aware substituter (literal/divergent/aggressive)
├── synthesise-best-of.mjs            ✓ 4th-attempt merger
├── upload-screenshot.mjs             ✓ Supabase Storage uploader
├── swarm-loop.mjs                    ✓ Page builder (3 attempts + synth + Shopify deploy + parity QC)
├── ingest-folder-watch.mjs           ✓ Watches ~/Desktop/KRYO_ASSETS_INBOX/ + Kimi vision auto-tag
├── seed-canonical-assets.mjs         ✓ One-time canonical KRYO image seed
├── generate-asset.mjs                ✓ AI image/video gen (fal.ai default, Replicate fallback, --video flag)
├── qc-asset.mjs                      ✓ Image QC (fetchable, dimensions, mime, brand, Meta-policy)
├── asset-swarm-loop.mjs              ✓ Detect gaps → 4 parallel gens → QC → store at pending_approval
├── refresh-asset-performance.mjs     ✓ Nightly perf → asset score feedback
├── auto-export-to-ad-creatives.mjs   ✓ Approved hero/lifestyle → ad_creatives draft
├── openclaw-skill-build-kryo-page.js ✓ WhatsApp trigger
├── cron-trigger.plist                ✓ LaunchAgent — page swarm daily 7am
├── asset-gen-cron.plist              ✓ LaunchAgent — asset swarm every 6h
└── README.md                         ✓ this file

src/app/api/marketing/assets/
├── upload/route.ts                   ✓ Multipart + JSON URL paste
├── list/route.ts                     ✓ Filterable listing
├── inventory/route.ts                ✓ Counts per scene×angle×status, gap detection
├── [id]/route.ts                     ✓ GET + DELETE (refuses if in_use)
├── [id]/approve/route.ts             ✓ Tom approves
└── [id]/reject/route.ts              ✓ Tom rejects with reason

src/app/dashboard/assets/page.tsx     ✓ Drag-drop + grid + filters + tag editor

src/app/api/marketing/launch/
├── clone-page/route.ts               ✓ (patched) supports publish_active for instant-active deploy
├── inbox-write/route.ts              ✓
├── compose-body-html/route.ts        ✓ (already deployed on main)
├── process-approvals/route.ts        ✓
└── qc-verify/route.ts                ✓ (feature-branch, optional)

supabase/migrations/
├── 20260502120000_kryo_winning_views.sql       ✓ 4 winning-data views
├── 20260502120100_qc_rejected_variants.sql     ✓ QC rejection log
├── (latest) swarm_runs                         ✓ per-run telemetry
└── (latest) media_assets_library_fields        ✓ asset library schema extension

benchmarks/
├── eightsleep-pod-cover-sections.json          ✓ primary blueprint (10 sections)
├── eightsleep-pod-4-ultra-sections.json        ✓ secondary (sparse, video-driven)
├── eightsleep-sections.json                    ✓ stable pointer
└── www-eightsleep-com-product-pod-cover-profile.json  ✓ diagnostic profile
```

---

## All required env vars (single block)

```bash
# Core
MARKETING_SYNC_SECRET
EVEREST_SUPABASE_URL
EVEREST_SUPABASE_SERVICE_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# LLM (one — KIMI_OAUTH_TOKEN preferred, FREE on Tom's Kimi sub)
KIMI_OAUTH_TOKEN
# OR
MOONSHOT_API_KEY

# AI image/video gen (one — FAL_API_KEY preferred)
FAL_API_KEY            # https://fal.ai/dashboard/keys
# OR
REPLICATE_API_TOKEN    # https://replicate.com/account/api-tokens
LUMA_API_KEY           # optional, for video via Luma Dream Machine

# Optional gates
SWARM_DEPLOY=true      # enables real Shopify deploy in page swarm
KIMI_MODEL=kimi-k2-6   # default model override
ASSET_TARGET_PER_SLOT=3  # how many approved assets per (scene, angle) before generation stops
```

---

## First-run sequence (Tom, when you wake up)

```bash
cd /Users/happy/Desktop/Claude\ Project/everest-calendar

# 1. Paste the API tokens
echo "KIMI_OAUTH_TOKEN=<from kimi.com>" >> .env.local
echo "FAL_API_KEY=<from fal.ai>"        >> .env.local

# 2. (optional) Seed library if you want — already done by Claude.
# node scripts/system/seed-canonical-assets.mjs

# 3. Smoke test the page builder
set -a; source .env.local; set +a
node scripts/system/swarm-loop.mjs --angle athlete_recovery --attempts 1 --threshold 0
# expected: stdout shows winner_score, /tmp/swarm-*-attempt-0.html exists

# 4. Smoke test the asset gen (will use 1 fal.ai credit ~$0.003)
node scripts/system/asset-swarm-loop.mjs --scene hero --angle athlete_recovery --count 1
# expected: 1 row in media_assets at status=pending_approval or rejected

# 5. Open the dashboard
open https://everest-calendar.vercel.app/dashboard/assets
# Drop a couple files. Approve a few.

# 6. First real run with Shopify deploy
SWARM_DEPLOY=true node scripts/system/swarm-loop.mjs --angle athlete_recovery --attempts 3 --threshold 75
# expected: Shopify variant in admin, /inbox card with screenshots

# 7. Load both LaunchAgents
cp scripts/system/cron-trigger.plist ~/Library/LaunchAgents/ai.everestlabs.kryo-page-swarm.plist
cp scripts/system/asset-gen-cron.plist ~/Library/LaunchAgents/ai.everestlabs.kryo-asset-swarm.plist
launchctl load ~/Library/LaunchAgents/ai.everestlabs.kryo-page-swarm.plist
launchctl load ~/Library/LaunchAgents/ai.everestlabs.kryo-asset-swarm.plist

# 8. Walk away. Pages + assets generated daily.
```

---

## Manual asset uploads — 4 paths

1. **Dashboard drag-drop** (most common): `/dashboard/assets`. Drop files. Set scene + angle filters first so they auto-tag.
2. **Folder watch**: drop files in `~/Desktop/KRYO_ASSETS_INBOX/`. Run `node scripts/system/ingest-folder-watch.mjs` once to start the watcher (or as a `nohup` background process). Ingested files move to `.processed/` subfolder.
3. **Paste URL**: in the dashboard's URL input, paste any public image URL (e.g. from Slack, Notion, a competitor page for reference). It gets fetched + saved into our bucket so it can't link-rot.
4. **Telegram / WhatsApp** (deferred): `ingest-telegram.mjs` + `ingest-whatsapp.mjs` are documented but not yet built — wrap `ingest-folder-watch.mjs`'s file ingest with a chat-bot front-end when Tom needs it.

---

## Observability — query without waking Claude

```sql
-- ── PAGE BUILDER ──
-- Last week of swarm runs
SELECT created_at::date, angle, winner_strategy, winner_score, deployed, public_url, status
FROM swarm_runs ORDER BY created_at DESC LIMIT 20;

-- Pages where Shopify-render parity drift > 15 (theme wrapper broke them)
SELECT created_at, angle, winner_score, parity_verdict
FROM swarm_runs WHERE (parity_verdict->>'parity_pass')::boolean = false;


-- ── ASSET LIBRARY ──
-- Inventory by status
SELECT status, COUNT(*) FROM media_assets GROUP BY status;

-- Inventory by scene × angle (approved only)
SELECT scene_type, COALESCE(angle, 'agnostic') angle, COUNT(*)
FROM media_assets WHERE status = 'approved'
GROUP BY scene_type, angle ORDER BY scene_type, angle;

-- Pending Tom's approval (sorted by AI-tagged scene)
SELECT id, scene_type, angle, source, qc_score, public_url
FROM media_assets WHERE status = 'pending_approval'
ORDER BY created_at DESC;

-- High-performing assets (after performance feedback runs)
SELECT scene_type, angle, performance_score, public_url, used_in_pages
FROM media_assets WHERE status = 'approved' AND performance_score > 0.5
ORDER BY performance_score DESC LIMIT 20;
```

Or hit the inventory route:
```bash
curl -s "https://everest-calendar.vercel.app/api/marketing/assets/inventory" \
  -H "x-sync-secret: $MARKETING_SYNC_SECRET" | jq .
```

---

## Failure modes + automatic recovery

| Stage | Failure | Recovery |
|---|---|---|
| Asset gen | fal.ai 429 / 5xx | falls back to Replicate; if both fail, logs and continues to next slot |
| Asset gen | Both providers down | swarm exits cleanly; cron retries in 6h |
| Asset QC | Image too small / corrupt | rejected automatically, never enters approved pool |
| Asset QC | Off-brand colors | flagged but advisory; Tom decides on dashboard |
| Library | Empty | page builder falls back to canonical KRYO image; pages still build |
| Page gen | Kimi 429 | kimi-call.mjs retries 3× with 2/8/32s backoff |
| Page gen | All 3 attempts fail | synthesis attempt fires automatically |
| Page gen | Synthesis also fails | swarm_runs.status='all_failed', Tom sees in dashboard |
| Page deploy | clone-page error | swarm_runs.deployed=false, no inbox write, error logged |
| Page deploy | Parity drift > 15 | inbox card flags it; Tom investigates manually |
| Performance feedback | No funnel data yet | nothing to update, exits cleanly |

---

## What Claude Code's role is now

**Touch this system only when Tom asks for:**
- New page-section types in `src/lib/page-sections/`
- New strategies in `clone-and-substitute.mjs`
- New asset providers in `generate-asset.mjs`
- New benchmark blueprints (capture another competitor)
- Schema changes (new fields on swarm_runs / media_assets)
- Bug fixes traceable to a specific log line

**Claude does NOT:**
- Generate page content per-run
- Run the swarm loops
- Render screenshots
- Generate or QC individual assets
- Decide which variant ships

If Tom is talking to Claude every page or asset, the system is broken. Fix the system, don't run the system manually.

---

## Refresh procedures (quarterly or on-demand)

**Eightsleep updates their pages:**
```bash
node scripts/extract-eightsleep-sections.mjs https://www.eightsleep.com/product/pod-cover/
node scripts/extract-eightsleep-sections.mjs https://www.eightsleep.com/product/pod-4-ultra/
git add benchmarks/ && git commit -m "refresh eightsleep blueprint"
```

**KRYO product spec changes (new pricing, specs, claims):**
```sql
UPDATE product_context
SET content = '<new canonical text>', updated_at = NOW()
WHERE context_key = 'kryo_v4_canonical';
```
Next swarm run picks up the new context. No code changes.

**Adjust asset target count per slot:**
```bash
echo "ASSET_TARGET_PER_SLOT=5" >> .env.local
# (or change in cron-trigger.plist environment block)
```
Asset swarm now targets 5 approved per (scene, angle) instead of 3.

---

## Cost estimate (per day, steady state)

| Component | Cost / day | Notes |
|---|---|---|
| Page swarm (1 run/day, 3 Kimi attempts + 1 synth + QC) | ~$0.02 | Free with Kimi OAuth sub |
| Asset swarm (4 runs/day × 3 slots × 4 attempts × $0.003) | ~$0.15 | fal.ai flux-schnell |
| Performance feedback nightly | $0 | pure SQL |
| Dashboard | $0 | runs on Vercel free tier |
| Supabase Storage | ~$0.02/GB/month | ~5 MB per asset; 100 assets = 500 MB |
| **Total** | **<$0.20/day** | well under any "automation budget" |

If running flux-pro (final quality) instead of flux-schnell, multiply asset cost by ~10. Run a mixed schedule: schnell during exploratory weeks, pro for confirmed-winner regenerations.
