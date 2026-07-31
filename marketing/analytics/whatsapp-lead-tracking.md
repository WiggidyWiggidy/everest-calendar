# KRYO WhatsApp Lead Tracking

Updated: 2026-07-25.

## Canonical website WhatsApp number

- Display: `+44 7724 709585`
- E.164: `+447724709585`
- Website link prefix: `https://wa.me/447724709585`
- Verified read-only from live Shopify theme asset `templates/product.kryo2_.json` on 2026-07-25.

## Meta native tracking

If the ad is a Click-to-WhatsApp / messaging ad and uses the selected Everest Labs WhatsApp asset, Meta can report native WhatsApp messaging metrics such as conversations or messaging conversations started and their cost.

Current screenshot-verified Meta WhatsApp asset:

- Label: `Everest Labs`
- Asset ID shown in Ads Manager: `907927035270302`
- Screenshot source: `Screenshot 2026-07-25 at 12.08.38 pm.png`

This asset ID is recorded in `../../config/kryo-whatsapp-tracking.json`. Pipeboard Meta is currently quota-limited, so the asset is screenshot-verified, not API-verified.

## Website WhatsApp signup tracking

Canonical first-party sources:

- `attribution_touches.event_type='whatsapp_click'` for website WhatsApp clicks.
- `kryo_leads` for consented WhatsApp access/signups.
- `kryo_deposit_events` for deposit outcomes.
- `kryo_whatsapp_conversations` and `kryo_whatsapp_messages` for WhatsApp Cloud API conversations once WABA credentials are configured.

Production backend route:

- `POST https://everest-calendar.vercel.app/api/marketing/kryo/leads/capture`
- Public CORS route, no session redirect after 2026-07-25 backend deploy.
- Requires `consent_to_follow_up=true` and phone/session/anonymous ID.
- Stores Meta/ad/experiment identifiers when supplied.

Meta Ads Manager signup visibility:

- The lead capture route now sends a Meta Conversions API `Lead` event with `custom_data.lead_type='whatsapp_signup'` when both are configured:
  - `META_PIXEL_ID` or `NEXT_PUBLIC_META_PIXEL_ID`
  - `META_CAPI_ACCESS_TOKEN` or `FACEBOOK_CONVERSIONS_API_TOKEN`
- These env vars are currently missing in Vercel production as of 2026-07-25, so Meta Ads Manager will not yet receive website signup events.

## Required ad URL params

Every ad URL that sends traffic to the page should include:

- `utm_source`
- `utm_medium`
- `utm_campaign_id`
- `utm_adset_id`
- `utm_ad_id`
- `utm_angle`
- `utm_hook`
- `experiment_id`
- `experiment_key`
- `landing_page_version`

## Metrics

- Cost per website WhatsApp click = Meta spend / first-party WhatsApp-click sessions.
- Cost per WhatsApp signup = Meta spend / `kryo_leads` count.
- Cost per qualified WhatsApp lead = Meta spend / qualified `kryo_leads` count.
- Cost per deposit = Meta spend / `kryo_deposit_events.event_type='deposit_completed'`.
- Meta Ads Manager cost per signup requires the CAPI `Lead` event env to be configured and fresh Meta delivery rows.

## Checks

Run:

```bash
npm run audit:kryo-whatsapp-tracking
npm run audit:kryo-whatsapp-cloud
```

Current expected blockers after 2026-07-25 backend deploy:

- Missing `META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` for Meta Ads Manager website signup tracking.
- Missing WhatsApp Cloud API token, phone number ID, and WABA ID for conversation logging/template follow-up.
- Pipeboard Meta quota until reset/upgrade; direct Meta app token is invalid because the old app was deleted.
