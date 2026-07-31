# KRYO Funnel Model

Canonical funnel:

```text
Ad impression
-> outbound click
-> landing-page view
-> engaged landing-page session
-> primary CTA click
-> WhatsApp conversation started
-> qualified enquiry
-> deposit initiated
-> deposit completed
-> checkout initiated
-> purchase
```

## Current tracking status

| Stage | Current source | Status |
|---|---|---|
| Ad impression | `meta_ad_metrics_daily.impressions` | Historical only until fresh delivery resumes |
| Outbound click | `meta_ad_metrics_daily.outbound_clicks` | Historical only |
| Landing-page view | Meta LPV + `attribution_touches.page_view` | Partial |
| Engaged session | `vw_kryo_intent_daily`, Clarity | Usable when source-health fresh |
| Primary CTA click | `hero_cta_click`, `sticky_cta_click`, `cart_add_request` | Partial, event naming needs cleanup |
| WhatsApp started | `whatsapp_click` only | Click tracked; conversation not reliably joined |
| Qualified enquiry | none canonical | Missing |
| Deposit initiated | none canonical | Missing |
| Deposit completed | none canonical | Missing |
| Checkout initiated | Shopify funnel + first-party checkout events | Partial |
| Purchase | Shopify/order sync + Meta purchase | Partial attribution |

## Primary commercial interpretation rule

Do not call a funnel constraint from one source alone. Use source-health first, then triangulate:

- Demand quality: Meta LPV/ATC plus onsite engaged sessions.
- Trust/objection load: Clarity dead clicks, quick backs, chat/WhatsApp clicks, FAQ opens.
- Purchase intent: cart views, checkout clicks, deposits, checkout starts.
- Commercial outcome: Shopify completed checkouts, deposits, purchases.
