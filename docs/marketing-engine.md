# KRYO Marketing Engine -- System Reference

## Overview

A closed-loop marketing system that collects data from 6 sources, feeds it to an AI strategist, and outputs testable hypotheses. Every component is either free or built on existing infrastructure.

```
[Data Sources] --> [Central DB] --> [Marketing Agent] --> [Proposals] --> [Tom Approves] --> [Execute]
     |                                    |                                                    |
     +-------- [Feedback Loop] <----------+----------------------------------------------------+
```

---

## 1. Data Collection Layer (6 Sources)

### 1a. Shopify Sync (`/api/marketing/sync/shopify`)
**What it does:** Every day, pulls yesterday's orders from Shopify Admin API.

**Metrics captured:**
- `shopify_revenue` -- total order value
- `shopify_orders` -- number of orders
- `shopify_aov` -- average order value (revenue / orders)
- `customers_acquired` -- count of unique customer emails (NEW)

**Computed after sync:**
- `cpa` -- cost per acquisition (Meta ad spend / customers acquired)
- `profit_per_customer` -- (revenue - ad spend) / customers
- `gross_profit` -- revenue minus ad spend
- `sales_growth_rate` -- % change vs 7-day rolling average

**Why it matters:** Revenue is the north star. But revenue alone doesn't tell you if you're profitable per customer or if growth is accelerating. The computed fields answer: "Am I making money on each customer?" and "Is the business growing faster or slower?"

**How to improve:** Add Shopify sessions + conversion rate (requires Shopify Analytics API or GA4 ecommerce tracking). Add product-level breakdown to see which SKUs drive revenue.

---

### 1b. Meta Ads Sync (`/api/marketing/sync/meta`)
**What it does:** Pulls account-level ad performance from Meta Graph API v21.0.

**Metrics captured:**
- `meta_spend` -- total daily ad spend
- `meta_impressions` -- how many times ads were shown
- `meta_clicks` -- clicks on ads
- `meta_ctr` -- click-through rate (clicks / impressions)
- `meta_cpm` -- cost per 1000 impressions
- `meta_cpc` -- cost per click
- `meta_roas` -- return on ad spend (purchase value / spend)
- `meta_purchases` -- conversion events tracked by Meta pixel
- `meta_cost_per_purchase` -- spend / purchases

**Also computes:** CPA and profit metrics if Shopify data exists for the same day.

**Why it matters:** This tells you how efficiently your ad dollars convert. ROAS > 3x is the target (industry benchmark for profitable DTC). CTR tells you if creative is working. CPC tells you how competitive the auction is.

**How to improve:** Add ad-level tracking (which specific ads perform best). The `ad_creatives` and `ad_metrics_daily` tables already exist for this -- needs a second sync that pulls per-ad metrics instead of account-level.

---

### 1c. Google Analytics 4 Sync (`/api/marketing/sync/ga4`)
**What it does:** Pulls site-wide traffic and behavior metrics via GA4 Data API.

**Metrics captured:**
- `ga_sessions` -- total site visits
- `ga_users` -- unique visitors
- `ga_new_users` -- first-time visitors
- `ga_bounce_rate` -- % who leave without interacting
- `ga_avg_session_duration` -- seconds on site
- `ga_conversion_rate` -- conversions / sessions

**Why it matters:** GA4 captures the full picture of site traffic regardless of source. If Meta ads are driving clicks but GA4 shows high bounce, the landing page is the problem. If sessions grow but conversion drops, something on the site changed.

**How to improve:** Add page-level breakdowns (which pages convert best). Add source/medium dimension to attribute traffic. Add ecommerce events (add_to_cart, begin_checkout) for funnel analysis.

---

### 1d. Microsoft Clarity Sync (`/api/marketing/sync/clarity`)
**What it does:** Pulls behavioral/UX engagement metrics from Clarity.

**Metrics captured:**
- `clarity_engagement_score` -- 0-100 composite score
- `clarity_rage_clicks` -- frustrated rapid clicks (UX problems)
- `clarity_dead_clicks` -- clicks on non-interactive elements
- `clarity_avg_scroll_depth` -- how far users scroll (%)

**Why it matters:** Clarity tells you HOW people use the site, not just IF they visited. High rage clicks = something is broken or confusing. Low scroll depth = above-the-fold content isn't compelling enough. Low engagement + high bounce = landing page needs work.

**How to improve:** Clarity also offers session recordings and heatmaps -- the marketing agent could reference specific recordings when proposing page changes.

---

### 1e. Google Search Console Sync (`/api/marketing/sync/gsc`) -- NEW
**What it does:** Pulls branded search query data. Tracks whether people are searching for KRYO/ISU-001 on Google.

**Metrics captured (in `brand_tracking_daily`):**
- Per branded term: impressions, clicks, average position
- Aggregated `_branded_total` row per day for total brand search volume
- Tracks terms: "kryo", "isu-001", "isu001", "ice shower", "portable ice bath", "everest labs"

**Why it matters:** Brand search volume is the purest signal of brand awareness. If you're spending on Meta ads and branded search is growing, your ads are building awareness beyond just direct clicks. If branded search is flat while spend increases, you're buying transactions but not building a brand.

**How to improve:** Add competitor branded terms ("plunge", "ice barrel") to benchmark relative awareness. Add non-branded terms ("cold plunge", "ice bath") to track category interest.

---

### 1f. Customer Feedback Collection -- NEW

**Two endpoints feed into the same `customer_feedback` table:**

#### WhatsApp Lead Ads Webhook (`/api/webhooks/meta-leads`)
**What it does:** When someone fills out a WhatsApp lead ad on Meta, this webhook receives their form submission automatically.

**Data captured:**
- All form field responses (stored as JSON)
- Customer email and phone (extracted from form)
- Which ad drove the lead (`meta_ad_id`)
- Creates an inbox item so Tom sees every new lead

**How it works:** Meta sends a POST with the lead ID. The webhook fetches full lead data from Meta API, parses form fields, stores everything, and creates an inbox notification.

#### Survey/Optin Form (`/api/marketing/survey`)
**What it does:** Public endpoint that any landing page form can POST to. No auth needed -- designed to receive form submissions from Shopify pages or standalone landing pages.

**Data captured:**
- Survey responses (any JSON structure)
- Customer email/phone
- UTM source/campaign for attribution
- Which ad drove them (`meta_ad_id` if available)

**Example usage from a Shopify page:**
```javascript
fetch('https://everest-calendar.vercel.app/api/marketing/survey', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'post_purchase',
    email: customer.email,
    utm_source: 'shopify',
    responses: {
      motivation: 'Athletic recovery',
      how_found: 'Instagram ad',
      nps_score: 9,
      improvement: 'Would like colder temperatures'
    }
  })
});
```

**Why feedback matters:** This is the voice of the customer. The marketing agent reads these responses and extracts: what motivates purchases, how customers find KRYO, what objections exist, and what product improvements they want. This feeds directly into ad copy, landing page messaging, and product decisions.

**How to improve:** Add Klaviyo post-purchase survey flow (automated email after order, responses feed here). Add on-site exit-intent popup survey. Build a feedback summary dashboard.

---

## 2. Central Database

All data flows into Supabase tables:

| Table | What's in it | How it's used |
|-------|-------------|---------------|
| `marketing_metrics_daily` | One row per day with all platform metrics + computed KPIs | Main dashboard, trend analysis, anomaly detection |
| `brand_tracking_daily` | Branded search volume by term and source | Brand awareness tracking, competitor comparison |
| `customer_feedback` | Survey responses, lead ad submissions | Customer understanding, product insights, ad copy optimization |
| `marketing_experiments` | A/B tests with hypothesis, baseline, result, lift % | Experiment tracking |
| `marketing_proposals` | Agent-generated actions with reasoning and data | Proposal review queue |
| `ad_creatives` | Meta ad variants with copy, targeting, budget | Creative pipeline management |
| `ad_metrics_daily` | Per-ad performance data | Creative performance ranking |
| `ad_templates` | Reusable ad layout templates | Creative generation |

---

## 3. Analysis Brain (Marketing Agent)

**Scheduled task:** `marketing-agent` (runs daily)

This is the brain of the system. It's a Claude Code scheduled task that:

### Step 1: Pulls all data
Calls `get_marketing_trends(30)` RPC which returns in one call:
- Last 30 days of metrics averaged
- Prior 30 days for comparison
- Growth rates for every metric (revenue, orders, ROAS, CPA, etc.)
- Anomaly flags (anything >2 standard deviations from 7-day rolling average)
- Brand tracking data
- Customer feedback count

Also pulls: active ad creatives with per-ad metrics, running experiments, recent customer feedback.

### Step 2: Cross-source analysis
The agent doesn't just check rules. It correlates across sources:
- "Meta spend up 20% but Clarity engagement dropped" = creative fatigue
- "ROAS dropping but branded search growing" = brand lift not captured in last-click
- "High rage clicks on pricing page" = UX problem killing conversion
- "Survey says 60% found us via Instagram" = double down on Instagram creative

### Step 3: Generates hypotheses
Each hypothesis has:
- **Observation**: specific numbers from the data
- **Hypothesis**: why this is happening
- **Test**: specific A/B test or change to validate
- **Expected impact**: which metric moves and by how much
- **Confidence**: low/medium/high

### Step 4: Creates proposals
Top hypotheses become `marketing_proposals` + `platform_inbox` items for Tom to approve. Maximum 5 per run.

### Step 5: Anomaly alerts
If anything is severely off (CPA spike, ROAS crash, conversion drop), creates HIGH priority inbox items immediately.

**How to improve:** Feed experiment results back in (closed loop). Add competitor monitoring data. Add seasonality awareness (cold plunge demand peaks in summer). Connect to Klaviyo for email performance data.

---

## 4. Anomaly Detection (Built into RPC + Agent)

The `get_marketing_trends` RPC automatically flags anomalies using statistical deviation:

- Revenue > 2 standard deviations from 7-day rolling average (spike or drop)
- CPA > 2 standard deviations above average (cost spike)
- ROAS > 2 standard deviations below average (efficiency drop)

The marketing agent also checks:
- CPA > 2x target
- ROAS below 1.0 for 3+ consecutive days (losing money)
- Conversion rate drop >15% day-over-day
- Revenue drop >30% from 7-day average

These create HIGH priority inbox items -- you see them immediately.

**How to improve:** Add Slack/WhatsApp alert for critical anomalies. Add budget auto-pause if ROAS drops below threshold for 3 days (with approval gate). Add forecasting to predict anomalies before they happen.

---

## 5. What's Not Built Yet (Next Sessions)

| What | Why | Effort |
|------|-----|--------|
| **PostHog A/B testing** | Free experiment platform with Shopify integration. Handles statistical significance, feature flags, variant assignment. Replaces building custom experiment code. | 1hr setup |
| **Klaviyo email/SMS** | Free up to 250 contacts. Automated abandoned cart, welcome series, post-purchase surveys. Industry standard for DTC. | 1hr setup |
| **Meta creative testing pipeline** | Scheduled task that takes agent proposals -> creates paused Meta ads via existing `/api/marketing/ads/create` -> monitors performance -> feeds results back to agent. | 2hrs |
| **Dashboard enhancements** | North star metrics (CPA, profit/customer, growth rate), brand health (search volume), experiment results, customer voice summary. | 2hrs |
| **Google Trends monitoring** | Weekly task that checks search volume trends for brand + competitor terms. Free, no API key needed. | 30min |
| **Ad-level Meta sync** | Pull per-ad metrics (not just account-level) to see which specific creatives perform. Tables already exist. | 1hr |

---

## 6. The Feedback Loop (How This Compounds)

```
Week 1: Data starts flowing. Agent sees baseline metrics.
         "ROAS is 2.8x, below 3x target. Bounce rate 60%."

Week 2: Agent proposes: "Test UGC testimonial creative vs current lifestyle creative"
         Tom approves. Ad created paused. Tom activates.

Week 3: Agent sees: "UGC creative has 4.2x ROAS vs 2.1x for lifestyle."
         Proposes: "Scale UGC budget 50%, pause lifestyle."
         Also: "Survey says 40% bought for athletic recovery -- test recovery-focused copy."

Week 4: Agent sees: "Recovery copy variant has 30% higher CTR."
         Proposes: "Roll out recovery messaging across all ads."
         Also: "Branded search up 25% since UGC launch -- awareness building."

Week 5: Agent connects: "Customers from UGC ads have 2x reorder rate (from Klaviyo)."
         Proposes: "Increase UGC budget allocation to 70% of total spend."
```

Each cycle: more data -> better hypotheses -> higher confidence tests -> compounding returns. The system gets smarter every day it runs.

---

## 7. Credential Requirements

These need to be set in **Vercel Environment Variables** for production and `.env.local` for local dev:

| Variable | Source | Used By |
|----------|--------|---------|
| `MARKETING_SYNC_SECRET` | Self-generated (already set: `mktg_sync_8f3a2d7e4b1c9056`) | All sync endpoints |
| `META_ACCESS_TOKEN` | Meta Business Suite > System User > Generate Token | Meta sync, lead ads webhook |
| `META_AD_ACCOUNT_ID` | Meta Ads Manager URL (format: `act_123456789`) | Meta sync |
| `SHOPIFY_STORE_URL` | Your Shopify store (e.g. `kryo-store.myshopify.com`) | Shopify sync |
| `SHOPIFY_CLIENT_ID` | Shopify Partners > App > Credentials | Shopify sync |
| `SHOPIFY_CLIENT_SECRET` | Shopify Partners > App > Credentials | Shopify sync |
| `GA_PROPERTY_ID` | GA4 > Admin > Property Settings (numeric) | GA4 sync |
| `GA_SERVICE_ACCOUNT_JSON` | Google Cloud > Service Accounts > JSON key (base64 encoded) | GA4 sync, GSC sync |
| `GSC_SITE_URL` | Google Search Console (e.g. `https://kryorecovery.com`) | GSC sync |
| `CLARITY_API_TOKEN` | Clarity > Settings > API | Clarity sync |
| `CLARITY_PROJECT_ID` | Clarity > Settings | Clarity sync |
| `META_WEBHOOK_VERIFY_TOKEN` | Self-generated string for webhook verification | Lead ads webhook |
