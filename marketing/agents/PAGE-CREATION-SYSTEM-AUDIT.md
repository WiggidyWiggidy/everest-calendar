# How page creation actually works today — audit

**2026-08-01. Analysis only, no changes made.** You were right that Codex built this: the pipeline
you described already exists end to end, is deployed, and is authenticating. It is closer to
working than anything else in this repo.

---

## The pipeline that exists

Four production Vercel routes, all **verified live** (HTTP 400 on empty body = auth passed,
validation rejected; a wrong secret returns **401**, so auth is genuinely enforced):

| Step | Route | Does |
|---|---|---|
| 1 | `POST /api/marketing/theme/clone-template` | bit-copies the source template to a new file, **optionally applying patches** |
| 2 | `POST /api/marketing/launch/clone-page` | Shopify `productDuplicate`, sets target handle, copies metafields, publishes ACTIVE to all markets |
| 3 | `POST /api/marketing/theme/configure-product` | binds the new template to the new product |
| 4 | `POST /api/marketing/launch/publish-product` | publication control |

Driven by the registered command **`/clone-product <source> <target>`** — validated by you on
2026-05-14 (kryo-2-0 → kryo_2-0, PASS WITH NOTES).

`MARKETING_SYNC_SECRET` is present (26 chars). Auth works.

## How code changes to the template are made

`clone-template` accepts a `patches` array in **two shapes**:

**Raw shape — text, copy, layout, any setting. No database dependency.**
```json
{ "section": "blocks_dijJNt",
  "block": "ai_gen_block_55e2f8d_jEB4tB",
  "settings": { "cta_text": "Add to cart — Standard | 12L" } }
```
Section-level works too (omit `block`).

**Slot shape — images only.** Resolves `slot_name` → address via Supabase, then swaps the image ref.

This is the "make changes to the code of the page templates" step, and it already does exactly
what you described — **change one variable, keep the same chrome as the control.**

## The QC gate that exists

Three inspectors, all with Playwright installed and working:

| Inspector | Checks |
|---|---|
| `qc-visual.mjs` | full-page screenshots desktop/tablet/mobile · hero loaded · H1 present · console errors · JSON-LD parse · **sticky CTA visible on mobile** · narrow-column regression |
| `qc-functional.mjs` | link checks · image 200s · **ATC flow** · cart drawer · mobile responsiveness · **tap-target sizing** · LCP |
| `qc-benchmark.mjs` | scores the page against a captured **Eight Sleep** profile |

Plus **`qc-checklist.md`** — a 48-point brand-parity checklist against eightsleep.com as north
star, with a hard bar: **≥38/48 to claim parity, <35 means rework.** It scores hero background,
text colours, font stack, H1 fluid sizing, letter-spacing, eyebrow treatment, dividers.

**That is precisely your "copy and style matches the rest of the page and aligns with overall
branding" requirement — already specified, already measurable.** 4 benchmark profiles are on disk.

---

## What is actually missing

### 1. The image-slot map is stale — images cannot be patched on the live page
`kryo_image_slots` holds **15 slots, all for template `nue-uae1`**. The live page `kryo2_` uses
template suffix **`kryo2_`**. A slot-shape patch against the live template resolves to nothing and
throws `Slot "..." not found. Available: (none)`.

**Text patches are unaffected** — the raw shape needs no table. So copy changes work today;
image swaps do not.

### 2. `kryo_copy_slots` is an orphan
50 rows, also `nue-uae1`. **Nothing in the pipeline reads it** — the resolver reads
`kryo_image_slots`. It is a dead table that looks authoritative, which is worse than absent.
*(I misread this earlier in the session and said the pipeline depended on it. It does not.)*

### 3. No brand/style contract for NEW copy
The QC checklist scores the page **after** it is built. Nothing tells the writing agent the brand
rules **before** it writes — tone, sentence length, claim limits, banned patterns. So an agent
writes copy, and QC catches style drift late and expensively.
`marketing/source-of-truth/brand-voice.md` exists but is not referenced by any page-creation step.

### 4. The QC gate is not wired to the pipeline
`/clone-product` does "lightweight QC" — handle, template_suffix, body_html length, image count,
metafield count. **It never invokes the three inspectors.** They are run manually, if at all.
So a clone can pass and still be visually broken.

### 5. No new-page path — only cloning
Every route clones an existing product. There is no "create a page from a brief" flow. That is
right for A/B variants and wrong for genuinely new pages/products. Worth knowing before you ask
for a new page today.

### 6. Two competing edit paths now exist
`clone-template patches` (Codex, deployed, clones-then-patches) and `scripts/kryo-slot-edit.mjs`
(mine, today, patches in place). They overlap. **The Codex route is the more mature and should be
primary**; mine is only better for editing an *existing live* page without cloning it, which the
Codex route does not do.

---

## Simplification proposal (not implemented — your call)

**Keep Codex's pipeline as the spine.** Do not rebuild it. Four changes make it a working system:

1. **Regenerate the slot maps against `kryo2_`.** Read the live template (163 editable slots found),
   write `kryo_image_slots` rows for it. Unblocks image patching. Delete or clearly retire
   `kryo_copy_slots`.
2. **Wire the three inspectors into `/clone-product` as a blocking gate** — clone is not "done"
   until qc-visual + qc-functional pass and qc-benchmark scores ≥38/48.
3. **Give the writing agent the brand contract up front** — point page-builder at
   `brand-voice.md` + the checklist *before* it writes, not after.
4. **Pick one edit path.** Codex's for clone-and-patch; keep mine only for in-place edits to a live
   page, and say so explicitly so agents do not choose randomly.

## Bottom line
You have ~80% of a working system, built and deployed. The gaps are a stale lookup table, an
unwired QC gate, and a missing pre-write brand contract — not missing capability.
**Nothing needs rebuilding.**
