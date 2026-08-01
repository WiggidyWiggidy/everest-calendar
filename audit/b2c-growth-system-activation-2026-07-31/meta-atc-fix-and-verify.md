---
depends-on: [money.cpa, money.sales_lifetime, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# KRYO add-to-cart / checkout: root cause, fix, and how to verify (2026-07-31)

Status: **root cause confirmed from code + live data. Fix prepared, review-only, NOT deployed.**
Nothing live was changed. "100% fixed" is claimable only after deploy + the verification below passes.

## Root cause (evidence)
- First-party pixel recorded ~7 add-to-carts on kryo2_ (30d); Meta recorded ~1. (Supabase `attribution_touches`.)
- The theme fires **no browser Meta pixel** (`grep fbq theme-assets` = empty). Meta only gets AddToCart
  via Shopify's browser pixel, which is blocked on ~70% mobile / in-app-browser traffic (iOS ITP).
- You already run server-side Meta CAPI — but only for WhatsApp `Lead`
  (`src/app/api/marketing/kryo/leads/capture/route.ts`), not for AddToCart/Checkout/Purchase.
- Conversion (separate from measurement): mobile CTA-clickers reach cart at 6% vs 58% desktop;
  0 checkout clicks from 7 adds. Needs the mobile UX fix below.

## Fix A — server-side Meta CAPI for funnel events (measurement) — PREPARED
New file (additive, safe): `src/lib/marketing/meta-capi.ts` — mirrors your working Lead-CAPI pattern.

Wire it into `src/app/api/marketing/sync/storefront-event/route.ts`, right AFTER the
`attribution_touches` insert succeeds, for the three funnel events. Insertion snippet for review:

```ts
import { sendMetaFunnelEvent, metaEventForFunnelType } from '@/lib/marketing/meta-capi';

// ...after the successful insert of the funnel event...
const metaEvent = metaEventForFunnelType(eventType); // add_to_cart|checkout_start|order_placed
if (metaEvent) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  await sendMetaFunnelEvent({
    eventName: metaEvent,
    eventId: body.event_id || `kryo_${eventType}_${crypto.randomUUID()}`,
    eventSourceUrl: body.page_url || body.page_path || null,
    fbclid,                       // already resolved in this route
    clientIpAddress: ip,
    clientUserAgent: request.headers.get('user-agent'),
    value: typeof body.event_value === 'number' ? body.event_value : null,
    currency: 'AED',
    contentIds: body.shopify_variant_id ? [String(body.shopify_variant_id)] : undefined,
  }).catch(() => {}); // never block the pixel response on CAPI
}
```
Notes for the reviewer: it's fire-and-forget (won't slow the pixel), server-side (mobile can't block it),
and dedup-ready via `event_id` if you later add a browser pixel. Set `META_TEST_EVENT_CODE` in env to
watch events land in Meta before going fully live.

## Fix B — mobile "Choose model → add to cart" completion (conversion) — NEEDS LIVE TEST TO FINALISE
Hypothesis (high, from data): the `variant_picker` "button" requires selecting a model before
`buy_buttons` enables; on mobile users land mid-page after the smooth-scroll, don't pick a model,
and the disabled buy button reads as "broken." Prepared change once confirmed on device:
default-select the first model so the buy button is live immediately, and make "Choose model" scroll
directly to the buy button with the picker in view. Confirm with the Playwright run below on mobile.

## GA4/GSC — parked, not blocking (per Tom). Documented in reconnection-status.md.

## How to VERIFY (this is what lets anyone say "fixed")
Run in **Claude Code** (has Playwright + network; Cowork cannot reach a live browser):

1. BEFORE deploy — confirm the gap + that the cart works:
   `npx playwright test tests/kryo-atc-tracking.spec.ts --project=chromium`
   `npx playwright test tests/kryo-atc-tracking.spec.ts --project="Mobile Safari"`
   Expect: cart item_count > 0 (cart works), and "GAP CONFIRMED: no browser Meta AddToCart".

2. Deploy Fix A to a Vercel PREVIEW (needs Tom's approval — production change). Set `META_TEST_EVENT_CODE`.

3. AFTER deploy — verify Meta actually receives events:
   - Meta Events Manager → Data Sources → your pixel → **Test Events**: perform an add-to-cart and
     confirm an `AddToCart` server event appears (and `InitiateCheckout` on checkout).
   - Supabase: `add_to_cart` count in `attribution_touches` should match AddToCart count in Meta
     within a small window (dedup working).

4. Only when step 3 matches → the measurement is verified fixed. Then A/B the mobile UX fix (B) and
   read qualified-intent (ATC + WhatsApp), not ATC alone.

## Approval gates (Tom)
- Deploy Fix A (server-side CAPI) — production change.
- Deploy Fix B (theme model-preselect) — live Shopify theme change.
- Both must go via preview + the verification above before production.
