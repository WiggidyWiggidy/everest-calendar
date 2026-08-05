# KRYO-BASELINE-20260806-01-CONTROL-V2

## Identity

- task_id: `KRYO-BASELINE-20260806-01-CONTROL-V2`
- task_class: `BASELINE_CHANGE`
- status: `FROZEN_FOR_REVIEW_BUILD`
- researched_at_utc: `2026-08-05T16:32:27Z`
- frozen_at_utc: `2026-08-05T16:32:27Z`
- owner_approval: `NOT_APPROVED`

## Commercial purpose

Improve trust, product tangibility and truthful urgency on the historical winning KRYO purchase page without changing its proven one-SKU/direct-ATC purchase architecture.

This is a baseline release, not a split test. We do not need causal attribution to each component. We do need regression protection and a clean rollback.

Historical benchmark used for monitoring:

- historical winner LPV → ATC ≈ `10%`
- historical winner LPV → IC ≈ `2.13%`
- purchase has historically lagged across multiple sessions/days

## Exact live resources

- store: `everestlabs.co`
- live URL: `https://everestlabs.co/products/kryo2`
- product handle: `kryo2`
- product GID: `gid://shopify/Product/9334472311092`
- product numeric ID: `9334472311092`
- variant GID: `gid://shopify/ProductVariant/49131658805556`
- variant numeric ID: `49131658805556`
- main theme GID: `gid://shopify/OnlineStoreTheme/167131775284`
- main theme numeric ID: `167131775284`
- live template key: `templates/product.kryo-2-2-track-cta2.json`
- expected live template updatedAt: `2026-08-04T15:39:13Z`
- review template key: `templates/product.kryo-2-2-control-v2-review.json`
- review suffix: `kryo-2-2-control-v2-review`
- preview URL: `https://everestlabs.co/products/kryo2?view=kryo-2-2-control-v2-review&country=AE`

## Preconditions

Any mismatch = output `PRECONDITION_DRIFT` and stop. Do not fix or reinterpret.

| Resource/path | Expected live value |
|---|---|
| product status | `ACTIVE` |
| product handle | `kryo2` |
| product total inventory / sellable winner stock | `7` |
| winner variant | `49131658805556` |
| winner variant availableForSale | `true` |
| product template suffix | `kryo-2-2-track-cta2` |
| live template updatedAt | `2026-08-04T15:39:13Z` |
| `blocks_dijJNt.blocks.ai_gen_block_bbfce70_CeRWNE.settings.info_text` | `ONLY AED 3,990 TODAY | OFFER ENDS FRIDAY` |
| `blocks_dijJNt.blocks.ai_gen_block_d4edf68_nV8nd6.settings.announcement_text` | `AED 1,500 OFF APPLIED | OFFER ENDS FRIDAY` |
| `blocks_dijJNt.blocks.ai_gen_block_a11bf55_CzyXYf.settings.headline` | `Step in tired. Step out switched on.` |
| `blocks_dijJNt.blocks.ai_gen_block_a11bf55_CzyXYf.settings.ship_date` | `August 15 | August Dubai batch almost full.` |
| `blocks_dijJNt.blocks.ai_gen_block_55e2f8d_jEB4tB.settings.info_text` | `ONLY AED 3,990 TODAY` |
| `main.blocks.icon_with_text_4mxWMc.settings.heading_1` | `AED 1,500 Saving` |
| `main.blocks.icon_with_text_4mxWMc.settings.heading_2` | `Performance Flow Upgrade` |
| `main.blocks.icon_with_text_4mxWMc.settings.heading_3` | `30 Day Risk-free Trial` |
| hero direct ATC link | `https://everestlabs.co/cart/add?id=49131658805556&quantity=1&return_to=%2Fcart` |
| sticky direct ATC link(s) | winner variant `49131658805556`, direct cart add |
| block immediately after `ai_gen_block_93b0085_RdFjHB` | `ai_gen_block_e13ab73_Bka7Mc` |

## Allowed execution surfaces

During REVIEW_BUILD:

- `src/app/api/marketing/theme/clone-template/route.ts` / production `/api/marketing/theme/clone-template`
- theme asset read surface
- `src/app/api/marketing/theme/deploy-asset/route.ts` / production `/api/marketing/theme/deploy-asset`
- review template only

During DEPLOY_APPROVED only:

- same theme surfaces above
- already-connected Shopify Admin GraphQL capability using only the two validated media mutations embedded below
- original live template key
- product `gid://shopify/Product/9334472311092` media relationship/order only

## Forbidden changes

Do not change:

- hero headline/subheadline/image;
- AED 3,990 offer/pricing;
- market pricing;
- product handle;
- product/variant IDs;
- one-SKU architecture;
- hero direct ATC behaviour/link;
- sticky direct ATC behaviour/link;
- secondary hero `Learn More` behaviour;
- Downpay or `50% today. Balance before dispatch.`;
- Performance Flow Upgrade;
- cart gift/upgrade popup;
- cart/checkout;
- Chatway/WhatsApp;
- exit intent;
- Meta ads;
- tracking/attribution code;
- any unrelated section, style, copy, asset, app setting or repository file.

No refactor. No cleanup. No opportunistic fixes.

# Frozen template operations

Apply in this exact order to the REVIEW TEMPLATE ONLY during REVIEW_BUILD.

## T1 — truthful first sticky message

JSON path:
`sections.blocks_dijJNt.blocks.ai_gen_block_bbfce70_CeRWNE.settings.info_text`

FROM:
`ONLY AED 3,990 TODAY | OFFER ENDS FRIDAY`

TO:
`AED 3,990 · 7 OF 10 REMAIN · NEXT DISPATCH 15 AUGUST`

## T2 — truthful announcement bar

JSON path:
`sections.blocks_dijJNt.blocks.ai_gen_block_d4edf68_nV8nd6.settings.announcement_text`

FROM:
`AED 1,500 OFF APPLIED | OFFER ENDS FRIDAY`

TO:
`AUGUST DUBAI ALLOCATION · 7 OF 10 REMAIN · NEXT DISPATCH 15 AUGUST`

## T3 — truthful hero dispatch line

JSON path:
`sections.blocks_dijJNt.blocks.ai_gen_block_a11bf55_CzyXYf.settings.ship_date`

FROM:
`August 15 | August Dubai batch almost full.`

TO:
`Next dispatch 15 August · 7 of 10 August allocations remain.`

## T4 — truthful second sticky message

JSON path:
`sections.blocks_dijJNt.blocks.ai_gen_block_55e2f8d_jEB4tB.settings.info_text`

FROM:
`ONLY AED 3,990 TODAY`

TO:
`AED 3,990 · 7 OF 10 REMAIN`

## T5 — buy-area reassurance

JSON path:
`sections.main.blocks.icon_with_text_4mxWMc.settings.heading_3`

FROM:
`30 Day Risk-free Trial`

TO:
`30 Day Risk-free Trial · Free Dubai Delivery & Returns`

Do not add another reassurance section.

## T6 — insert exact tester testimonial block

Insert this exact block into:
`sections.blocks_dijJNt.blocks`

Block ID:
`ai_gen_block_5edb068_GqHjBY`

Exact block payload:

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

Then update `sections.blocks_dijJNt.block_order` so:

`ai_gen_block_93b0085_RdFjHB`
→ `ai_gen_block_5edb068_GqHjBY`
→ `ai_gen_block_e13ab73_Bka7Mc`

Do not reorder any other blocks.

# Frozen product-media plan

**Do not execute during REVIEW_BUILD.**

The owner review packet must show these exact three already-existing Shopify CDN assets and the proposed final order.

Exact new media source URLs:

1. `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-whats-in-the-box.webp?v=1785069614`
   - alt: `KRYO complete system and included components`
2. `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-front-view.webp?v=1785069614`
   - alt: `KRYO cooling unit front view`
3. `https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-side-view.webp?v=1785069614`
   - alt: `KRYO cooling unit side view`

Current winner media snapshot expected at freeze:

1. `gid://shopify/MediaImage/39244795019572` — `ChatGPT_Image_May_12_2026_11_24_22_AM_1.webp`
2. `gid://shopify/MediaImage/39244723159348` — `kryo_v4_approved_gallery_white-studio_01_copy.webp`
3. `gid://shopify/MediaImage/39244723192116` — `ChatGPT_Image_May_12_2026_11_01_15_AM_1.webp`

Desired final media order after approval:

1. existing primary `39244795019572`
2. new `kryo-whats-in-the-box.webp`
3. new `kryo-front-view.webp`
4. new `kryo-side-view.webp`
5. existing `39244723159348`
6. existing `39244723192116`

Do not remove the three existing winner media.

## Validated mutation M1 — add exact media

Use exactly:

```graphql
mutation AddKryoBaselineMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      media(first: 20) {
        nodes {
          id
          alt
          mediaContentType
          preview { image { url } }
        }
      }
    }
    userErrors { field message }
  }
}
```

Variables:

```json
{
  "product": { "id": "gid://shopify/Product/9334472311092" },
  "media": [
    {
      "mediaContentType": "IMAGE",
      "originalSource": "https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-whats-in-the-box.webp?v=1785069614",
      "alt": "KRYO complete system and included components"
    },
    {
      "mediaContentType": "IMAGE",
      "originalSource": "https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-front-view.webp?v=1785069614",
      "alt": "KRYO cooling unit front view"
    },
    {
      "mediaContentType": "IMAGE",
      "originalSource": "https://cdn.shopify.com/s/files/1/0718/0550/1748/files/kryo-side-view.webp?v=1785069614",
      "alt": "KRYO cooling unit side view"
    }
  ]
}
```

If `userErrors` is non-empty: `LIVE_VERIFY_FAILED` and stop.

Identify the three newly attached media IDs from returned URLs/filenames. These returned IDs are the only permitted dynamic-result substitution.

## Validated mutation M2 — reorder media

Use exactly:

```graphql
mutation ReorderKryoBaselineMedia($id: ID!, $moves: [MoveInput!]!) {
  productReorderMedia(id: $id, moves: $moves) {
    job { id done }
    mediaUserErrors { field message }
  }
}
```

Variables use the three returned IDs from M1:

```json
{
  "id": "gid://shopify/Product/9334472311092",
  "moves": [
    { "id": "<NEW_WHATS_IN_BOX_ID>", "newPosition": "1" },
    { "id": "<NEW_FRONT_VIEW_ID>", "newPosition": "2" },
    { "id": "<NEW_SIDE_VIEW_ID>", "newPosition": "3" }
  ]
}
```

Moves are sequential. Poll/read until the product media order is confirmed. Do not make any other media move.

# REVIEW_BUILD procedure

1. Assert every precondition above.
2. Clone live template key to review template key with no patches and no overwrite unless the exact target already belongs to this task.
3. Fetch review-template JSON.
4. Apply T1–T6 exactly.
5. Deploy only the review template.
6. Reread review template and live template.
7. Verify review changes + protected live sentinels.
8. Do not execute M1/M2.
9. Return `REVIEW_READY` with:
   - preview URL;
   - exact T1–T6 summary;
   - exact three media URLs/order planned for approval;
   - live source unchanged PASS/FAIL;
   - direct ATC preserved in review PASS/FAIL;
   - Downpay/cart/tracking protected PASS/FAIL.
10. STOP.

# Owner review acceptance criteria

Owner should check on desktop + mobile preview:

- no `OFFER ENDS FRIDAY` remains in the changed review template locations;
- scarcity/dispatch wording is premium and readable;
- hero headline/subheadline are unchanged;
- Add to Cart remains visually dominant and direct;
- reassurance fits cleanly near buying decision;
- testimonial section appears directly after `What makes KRYO different?`;
- testimonial formatting is premium/readable;
- no unexpected spacing/layout regression;
- no extra WhatsApp/Chatway changes;
- media review packet shows the exact three intended assets/order.

# Approval gate

Production mutation requires explicit owner message:

`DEPLOY_APPROVED KRYO-BASELINE-20260806-01-CONTROL-V2`

Anything else = `APPROVAL_REQUIRED`.

# DEPLOY_APPROVED procedure

1. Rerun all preconditions against live state, including inventory still exactly `7`, original template sentinels, and current media snapshot still matching the expected three original media in relative order.
2. If drift: `PRECONDITION_DRIFT`, stop. Research operator must issue a revised manifest.
3. Capture exact rollback snapshot:
   - current live template bytes;
   - live template update timestamp;
   - product/variant/inventory state;
   - current media IDs/URLs/order;
   - UTC timestamp.
4. Confirm review artifact exactly satisfies frozen T1–T6.
5. Copy the exact approved review-template bytes to `templates/product.kryo-2-2-track-cta2.json`.
6. Reread live template and verify T1–T6 plus protected sentinels.
7. Execute media M1 exactly.
8. Execute M2 using only the three returned M1 media IDs.
9. Reread product media until final order is exactly the desired six-item order above.
10. Reconfirm product ACTIVE, variant available, inventory unchanged by the page deployment, direct ATC links unchanged, Downpay/cart/tracking unchanged.
11. Record `deployed_at_utc`.
12. Return `LIVE_VERIFIED` and monitoring gates. STOP.

# Live verification checklist

Must all pass:

- live product ACTIVE
- handle `kryo2`
- one winner variant `49131658805556`
- availableForSale true
- inventory still unchanged from immediate pre-deploy snapshot
- T1 new exact value
- T2 new exact value
- T3 new exact value
- T4 new exact value
- T5 new exact value
- T6 block exists exactly once at required location
- hero headline unchanged
- hero subheadline unchanged
- hero direct ATC winner variant unchanged
- sticky direct ATC winner variant unchanged
- Downpay unchanged
- Performance Flow Upgrade/cart popup not modified
- Chatway/WhatsApp not modified
- tracking/attribution not modified
- six-item media order exact

Any failure = `LIVE_VERIFY_FAILED` and stop.

# Monitoring plan

Monitoring starts strictly at `deployed_at_utc`.

Clean paid traffic for this task means sessions attributed to the intended Meta winner/control traffic landing on `/products/kryo2`, excluding internal/test traffic and known wrong-page traffic.

Meta cost metrics may be used only when same-day delivery data is directly readable or freshness is proven.

## Gate 1 — approximately 25 clean paid LPVs

Purpose: technical/regression safety.

Healthy:
- cart/ATC works;
- no page/market/tracking errors;
- ~2–3+ ATCs/cart progressions is directionally consistent with historical control.

Investigate:
- 1 ATC/cart progression;
- tracking disagreement;
- unexpected country/market issue.

Immediate serious warning:
- 0 ATCs/cart progressions with otherwise valid traffic.

Do not revert from small-sample performance alone unless there is a technical failure.

## Gate 2 — approximately 50 clean paid LPVs

Healthy:
- ~4+ confirmed ATCs, with 5+ strong;
- checkout progression not materially worse;
- no technical regression.

Investigate strongly:
- ≤2 ATCs and no compensating checkout/revenue signal, after traffic quality is checked.

## Decision gate — approximately 100 clean paid LPVs OR 3–5 days

Historical LPV→ATC benchmark ≈ 10%.

KEEP:
- LPV→ATC roughly `>= 8%`, or lower ATC is compensated by stronger checkout/purchase/assisted outcome and no technical issue;
- traffic economics are not materially worse for reasons unrelated to page.

ENCOURAGING:
- LPV→ATC approximately `11.5–12.5%+` with downstream quality intact.

INVESTIGATE:
- LPV→ATC `6–8%` or checkout quality worsens.

REVERT to exact rollback snapshot when:
- LPV→ATC remains `< 6%` around 100 clean LPVs;
- AND there is no compensating checkout/purchase/revenue improvement;
- AND Meta traffic quality/data freshness has been checked enough to rule out a traffic-side explanation.

This package is deployed together, so do not attribute any observed uplift to an individual component.

# Minimal Codex invocation

Review build:

`Use $kryo-baseline-change. Execute marketing/baseline-changes/KRYO-BASELINE-20260806-01-CONTROL-V2.md in REVIEW_BUILD mode. Do not research or reinterpret. Stop at REVIEW_READY.`

After explicit visual approval:

`Use $kryo-baseline-change. Execute marketing/baseline-changes/KRYO-BASELINE-20260806-01-CONTROL-V2.md in DEPLOY_APPROVED mode. Deploy the exact approved review artifact, verify it, record deployed_at_utc, and stop at LIVE_VERIFIED.`
