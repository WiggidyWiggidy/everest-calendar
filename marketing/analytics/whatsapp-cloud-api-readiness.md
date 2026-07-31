# KRYO WhatsApp Business Platform setup

Purpose: make Meta WhatsApp lead capture measurable and make later follow-up possible without mixing it with the legacy Green API webhook.

## Canonical flow

1. Meta Click-to-WhatsApp ads use the Everest Labs WhatsApp asset selected in Ads Manager.
2. The landing page records low-friction opt-in through `/api/marketing/kryo/leads/capture` and stores `kryo_leads.consent_to_follow_up=true`.
3. Meta WhatsApp Business Platform webhooks hit `/api/webhooks/meta-whatsapp`.
4. Inbound messages/statuses are stored in `kryo_whatsapp_conversations` and `kryo_whatsapp_messages`.
5. Later outbound follow-up uses `/api/marketing/kryo/whatsapp/send-template` with an approved WhatsApp template and `x-sync-secret`.

## Required production environment variables

- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_CLOUD_API_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID` or `WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_BUSINESS_ACCOUNT_ID` or `WHATSAPP_BUSINESS_ACCOUNT_ID`

Do not use the legacy Green API webhook as the KRYO marketing source of truth.
Do not infer marketing opt-in from a webhook-only inbound message. The page capture or ad form must collect consent.

## Checks

Run:

```bash
npm run audit:kryo-whatsapp-cloud
npm run audit:kryo-whatsapp-tracking
```

The system is not ready to claim cost per WhatsApp signup or later template follow-up until both reports pass or only show delivery-pending Meta spend.
