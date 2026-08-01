# Skill: voice-of-customer (mine real customer language)

The best hooks, LP copy, and objection-handling come from the customer's own words — not the founder's.
Feeds `customer-avatar`, `consumer-psychology`, and `creative-testing`.

## Sources (KRYO, in priority)
1. **Post-purchase survey** "How did you hear about us?" + one open question ("what nearly stopped you
   buying?") — see `../data-contracts/profitability-and-attribution.md`.
2. **WhatsApp conversations** with prospects/customers (the 2 known convos + future) — the real objections,
   in their words. (Instrument capture into `kryo_leads` / `kryo_whatsapp_messages`.)
3. **The 5 buyers** — what they asked before buying; any reviews/testimonials.
4. Competitor reviews (8 Sleep, cold-plunge brands) for category language + unmet objections.

## What to extract
- **Exact phrases** buyers/prospects use for the problem, desired outcome, and hesitation.
- **The top objections in their order** (legitimacy → delivery/wait → will-it-work/fit → support).
- **Trigger events** — what made them look now.
- Words to AVOID (jargon that doesn't match how they talk).

## Output
A living `marketing/source-of-truth/customer-language.md`: swipe-able phrases mapped to hook types and
funnel stage, each tagged with source + date + n. Hooks and LP copy must draw from here, not be invented.
Label confidence by n (5 customers = directional; grows with the survey).

## Honesty
If there isn't enough customer language yet, say so and propose the cheapest way to get it (ship the
survey, capture WhatsApp) — do not fabricate customer quotes or invent objections.
