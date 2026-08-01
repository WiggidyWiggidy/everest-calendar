# Lens: customer-avatar (ideal customer / ICP)

Builds the ideal-customer picture from **real buyers and real purchase-intent data** — never an invented
persona. Feeds targeting, creative, message-match, and the consumer-psychology lens. Bound to
evidence-standards: at low n it is a HYPOTHESIS to validate, labelled as such, and it sharpens as
customers accumulate.

## How it's built (sources, in priority)
1. **Actual customers** — the 5 lifetime buyers: device, geo (UAE region/city), which ad/creative,
   time-to-purchase, first-touch angle. (Pull from `attribution_touches` where `shopify_order_id` is
   set / order events; Supabase MCP was erroring at authoring time — Claude Code to populate.)
2. **Meta purchase-intent demographics** — who *adds to cart / initiates checkout / buys* by age,
   gender, region, placement (`meta_ad_breakdowns_daily` / Meta Insights breakdowns). NOTE: this feed
   is stale (last ~May 17) — refresh via a Meta sync before trusting the numbers.
3. **Qualitative canon** — `marketing/foundation/positioning.md`, `customer-beliefs.md`.

## Draft avatar v0.1 — HYPOTHESIS (n=5 customers; validate before over-committing spend on it)
- **Who:** UAE (Dubai) resident, **male, ~35–54**, disposable income, apartment owner. (Age/gender split
  to be confirmed from Meta breakdowns.)
- **Device/context:** ~90% arrive on **mobile**, via **Instagram/Facebook** paid, cold first touch.
- **State of mind:** skeptical, auditing a high-ticket (**AED 3,990**) purchase from an unknown brand on
  a phone. Interested in cold exposure; the question isn't the category, it's *is this company/device
  real, safe, deliverable (esp. with the 30-day wait), and supportable.*
- **Core objections (buy order):** legitimacy → delivery certainty → will it work/fit my bathroom/safe →
  support/returns.
- **What likely makes it irresistible:** concrete proof it's real and works (real-use video, tester
  evidence), removal of delivery/setup risk, and a low-friction first step for the undecided (WhatsApp /
  refundable deposit) rather than only a cold AED 3,990 ask.

## What to confirm to firm this up (hand to Claude Code)
- The 5 buyers' actual device/region/age/gender/creative + days-to-purchase.
- Meta ATC/IC/purchase demographic breakdowns (fresh sync) — does the buyer skew match the draft?
- Whether buyers differ from non-converting traffic (the real ICP is where they diverge).

## How it's used
- **meta-ads-expert:** targeting seed (though 2026 practice favours broad + creative — see that lens),
  and exclusions.
- **consumer-psychology + creative:** every headline/image/offer is written *to this person's* state and
  objections; message-match scored against the ad they clicked.
- **Refinement cadence:** update after every N new customers; the avatar is versioned, and each claim
  carries its evidence + n. Never freeze a persona the data hasn't earned.
