# KRYO Attribution Rules

## Required identifiers

Every ad URL and landing-page variant should preserve, where possible:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_campaign_id`
- `utm_adset_id`
- `utm_ad_id`
- `utm_content`
- `utm_angle`
- `utm_hook`
- `experiment_id`
- `landing_page_version`
- `market`

## Join policy

| Join | Required identifier | Current reliability |
|---|---|---|
| Meta ad -> session | `utm_ad_id` / `meta_ad_id` | Partial |
| Meta campaign -> session | `utm_campaign_id` | Partial |
| Creative angle -> session | `utm_angle` and `ad_creatives.angle` | Partial |
| Hook -> session | `utm_hook` | Missing/inconsistent |
| LP version -> session | page path + `landing_page_version` | Partial |
| Experiment -> session | `experiment_id` | Partial/missing |
| Session -> WhatsApp | session/anonymous ID + `whatsapp_click` | Click only |
| WhatsApp -> qualified lead | conversation/lead ID | Missing |
| Lead -> deposit | lead ID / draft order / deposit order | Missing |
| Session -> purchase | order attribution | Partial |

## Rule for recommendations

If the join is partial, recommendations must use language like `evidence suggests` and name the missing join. If the join is missing, treat the insight as a hypothesis, not a result.
