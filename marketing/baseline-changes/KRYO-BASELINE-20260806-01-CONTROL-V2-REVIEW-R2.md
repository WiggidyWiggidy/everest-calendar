# KRYO-BASELINE-20260806-01-CONTROL-V2-REVIEW-R2

## Purpose
Build a private Shopify preview of the approved Control v2 baseline improvements. Do not change the product's live template assignment, live product media, cart, checkout, tracking, ads, or the live source template.

## Status
- task_class: `BASELINE_CHANGE`
- phase: `REVIEW_BUILD`
- status: `FROZEN_FOR_REVIEW_BUILD`
- owner_approval: `NOT_APPROVED`

## Hard execution rule
This manifest is self-contained. Do not research, search the repo, discover APIs, invent endpoints, or reinterpret copy. Use only the exact production routes below. If an exact route fails, output `EXECUTION_SURFACE_UNAVAILABLE` with route + status and stop.

## Production execution surface
Base URL:
`https://everest-calendar.vercel.app`

Authentication for every `/api/marketing/*` request:
`x-sync-secret: $MARKETING_SYNC_SECRET`

If `MARKETING_SYNC_SECRET` is not already in the shell environment, use the already-linked Vercel project to pull production env into a temporary file, load only for this process, do not print the secret, and delete the temporary file before completion.

Exact routes allowed:
1. `GET /api/marketing/shopify/get-product?handle=kryo2`
2. `GET /api/marketing/theme/asset?theme_id=167131775284&key=<encoded-key>`
3. `POST /api/marketing/theme/clone-template`
4. `POST /api/marketing/theme/deploy-asset`

Forbidden route:
`/api/marketing/shopify/admin-graphql`
It does not exist. Never call or substitute it.

## Exact Shopify resources
- product handle: `kryo2`
- product ID: `9334472311092`
- winner variant ID: `49131658805556`
- theme ID: `167131775284`
- live template key: `templates/product.kryo-2-2-track-cta2.json`
- review template key: `templates/product.kryo-2-2-control-v2-review.json`
- preview URL: `https://everestlabs.co/products/kryo2?view=kryo-2-2-control-v2-review&country=AE`

## REVIEW_BUILD preconditions
### Product read
Call exactly:
`GET https://everest-calendar.vercel.app/api/marketing/shopify/get-product?handle=kryo2`

Require:
- `id == 9334472311092`
- `handle == kryo2`
- `status` case-insensitive equals `active`
- `template_suffix == kryo-2-2-track-cta2`
- `total_inventory == 7`
- exactly one variant
- variant `id == 49131658805556`
- variant `inventory_quantity == 7`
- variant `sellable_now == true`

If any differ: `PRECONDITION_DRIFT`, list only the differing fields, stop.

### Live template read
Call exactly:
`GET https://everest-calendar.vercel.app/api/marketing/theme/asset?theme_id=167131775284&key=templates%2Fproduct.kryo-2-2-track-cta2.json`

Parse the returned `value` as JSON and require these exact sentinels:
- `sections.blocks_dijJNt.blocks.ai_gen_block_bbfce70_CeRWNE.settings.info_text == "ONLY AED 3,990 TODAY | OFFER ENDS FRIDAY"`
- `sections.blocks_dijJNt.blocks.ai_gen_block_d4edf68_nV8nd6.settings.announcement_text == "AED 1,500 OFF APPLIED | OFFER ENDS FRIDAY"`
- `sections.blocks_dijJNt.blocks.ai_gen_block_a11bf55_CzyXYf.settings.headline == "Step in tired. Step out switched on."`
- `sections.blocks_dijJNt.blocks.ai_gen_block_a11bf55_CzyXYf.settings.ship_date == "August 15 | August Dubai batch almost full."`
- `sections.blocks_dijJNt.blocks.ai_gen_block_55e2f8d_jEB4tB.settings.info_text == "ONLY AED 3,990 TODAY"`
- `sections.main.blocks.icon_with_text_4mxWMc.settings.heading_1 == "AED 1,500 Saving"`
- `sections.main.blocks.icon_with_text_4mxWMc.settings.heading_2 == "Performance Flow Upgrade"`
- `sections.main.blocks.icon_with_text_4mxWMc.settings.heading_3 == "30 Day Risk-free Trial"`
- block immediately after `ai_gen_block_93b0085_RdFjHB` is `ai_gen_block_e13ab73_Bka7Mc`

Also search the parsed live template for the winner direct-cart URL and require it is present:
`https://everestlabs.co/cart/add?id=49131658805556&quantity=1&return_to=%2Fcart`

If any differ: `PRECONDITION_DRIFT`, list only mismatches, stop.

## Build procedure
### 1. Clone private review template
POST exactly to:
`https://everest-calendar.vercel.app/api/marketing/theme/clone-template`

Body:
```json
{
  "source_key": "templates/product.kryo-2-2-track-cta2.json",
  "target_key": "templates/product.kryo-2-2-control-v2-review.json",
  "theme_id": 167131775284,
  "overwrite": true,
  "patches": []
}
```

This target is an alternate review template. Do not change the product template assignment.

### 2. Read review template
GET exactly:
`https://everest-calendar.vercel.app/api/marketing/theme/asset?theme_id=167131775284&key=templates%2Fproduct.kryo-2-2-control-v2-review.json`

Parse `value` as JSON.

### 3. Apply only T1-T6 in memory / temporary local file
Do not edit repository source files.

T1:
`sections.blocks_dijJNt.blocks.ai_gen_block_bbfce70_CeRWNE.settings.info_text`
FROM `ONLY AED 3,990 TODAY | OFFER ENDS FRIDAY`
TO `AED 3,990 · 7 OF 10 REMAIN · NEXT DISPATCH 15 AUGUST`

T2:
`sections.blocks_dijJNt.blocks.ai_gen_block_d4edf68_nV8nd6.settings.announcement_text`
FROM `AED 1,500 OFF APPLIED | OFFER ENDS FRIDAY`
TO `AUGUST DUBAI ALLOCATION · 7 OF 10 REMAIN · NEXT DISPATCH 15 AUGUST`

T3:
`sections.blocks_dijJNt.blocks.ai_gen_block_a11bf55_CzyXYf.settings.ship_date`
FROM `August 15 | August Dubai batch almost full.`
TO `Next dispatch 15 August · 7 of 10 August allocations remain.`

T4:
`sections.blocks_dijJNt.blocks.ai_gen_block_55e2f8d_jEB4tB.settings.info_text`
FROM `ONLY AED 3,990 TODAY`
TO `AED 3,990 · 7 OF 10 REMAIN`

T5:
`sections.main.blocks.icon_with_text_4mxWMc.settings.heading_3`
FROM `30 Day Risk-free Trial`
TO `30 Day Risk-free Trial · Free Dubai Delivery & Returns`

T6: insert exact testimonial block into `sections.blocks_dijJNt.blocks` using ID `ai_gen_block_5edb068_GqHjBY`:
```json
{
  "type": "ai_gen_block_5edb068",
  "settings": {
    "max_width": 900,
    "padding_top": 80,
    "padding_bottom": 80,
    "background_color": "#fafbfc",
    "text_color": "#0f1419",
    "author_color": "#5a6c7d",
    "quote_size": 24,
    "author_size": 12,
    "quote_1": "I struggle with poor sleep and wake up groggy most mornings. KRYO obviously does not fix a bad night's sleep, but it changes how I feel when I get up. I keep mine at 5°C and do 45 seconds. It is intense, but manageable. Then I have a coffee, get some sunlight and I am ready to start the day.",
    "author_1": "Tom M.",
    "quote_2": "I have used cold plunges before and this feels completely different. The halo covers your upper body and the airflow makes the cold feel even sharper. It is not relaxing at all, but that is the point. The hardest part is knowing you could take one small step and make it stop.",
    "author_2": "John Z.",
    "quote_3": "I would still choose a long cold plunge after a really hard training session but to start the day this fits my schedule better. It is ready when I need it, takes less than a minute and uses fresh water every time so no rinsing off afterwards. It is something I can actually see myself continuing to use.",
    "author_3": "James S."
  },
  "blocks": {}
}
```

Update only `sections.blocks_dijJNt.block_order` so the local sequence becomes:
`ai_gen_block_93b0085_RdFjHB`
→ `ai_gen_block_5edb068_GqHjBY`
→ `ai_gen_block_e13ab73_Bka7Mc`

Do not reorder anything else.

### 4. Write only review template
POST exactly to:
`https://everest-calendar.vercel.app/api/marketing/theme/deploy-asset`

Body fields:
- `theme_id`: `167131775284`
- `key`: `templates/product.kryo-2-2-control-v2-review.json`
- `value`: full JSON string created in step 3

Do not write the live source key.

### 5. Verify
Reread both exact assets with route 2:
- review: `templates/product.kryo-2-2-control-v2-review.json`
- live: `templates/product.kryo-2-2-track-cta2.json`

Require review contains exact T1-T6 and the direct-cart URL remains present.
Require live still contains every original sentinel from the precondition section.

Do not mutate product media in REVIEW_BUILD.

## Product-media review packet only
Show these planned assets in final output, but do not attach them yet:
1. `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-whats-in-the-box.webp?v=1785069614`
2. `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-front-view.webp?v=1785069614`
3. `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-side-view.webp?v=1785069614`

Desired eventual order after owner approval:
1. existing primary
2. what's in the box
3. front view
4. side view
5. existing image 2
6. existing image 3

## Forbidden changes
Do not change live template assignment, live source template, product media, price, variants, hero headline/subheadline/image, CTA behaviour, Downpay, cart popup, checkout, WhatsApp/Chatway, tracking, Meta ads, or unrelated repository/theme files.

## Required output
On success output only:

`REVIEW_READY`

- Preview: `https://everestlabs.co/products/kryo2?view=kryo-2-2-control-v2-review&country=AE`
- Product preconditions: PASS
- Live template preconditions: PASS
- T1 scarcity: PASS
- T2 announcement: PASS
- T3 dispatch: PASS
- T4 sticky: PASS
- T5 reassurance: PASS
- T6 testimonials: PASS
- Direct ATC preserved in review: PASS
- Live source unchanged: PASS
- Product media unchanged: PASS
- Planned media: 3 exact URLs above

Then stop. Never continue to production deployment in this run.
