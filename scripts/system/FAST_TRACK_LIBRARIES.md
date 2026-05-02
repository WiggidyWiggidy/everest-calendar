# Fast-track libraries + tools for Shopify long-form pages

**Goal:** stop hand-rolling sections; borrow from polished open-source / paid libraries to reach Eight Sleep tier faster.

---

## What's already vendored (this session)

```
vendored/dawn/         ← Shopify's official open-source theme. 52 sections of patterns to study/borrow.
                          - sections/image-with-text.liquid       (eightsleep-style alternating image+copy)
                          - sections/multicolumn.liquid            (3/4-up benefit grids)
                          - sections/featured-collection.liquid    (review aggregate patterns)
                          - sections/collapsible-content.liquid    (FAQ accordion)
                          - sections/rich-text.liquid              (typography / pull-quote)
                          - sections/image-banner.liquid           (full-bleed hero w/ overlay)
                          - sections/collage.liquid                (lifestyle 2/3-up grid)
                          - sections/slideshow.liquid              (hero carousel)
                          - sections/quick-add.liquid              (sticky ATC)
```

When clone-and-substitute generates a section, you can include relevant Dawn sections in the substituter's prompt context as structural reference. Already wired potential — just paste a section into the prompt block.

---

## High-leverage external tools

### 1. Replo (https://replo.app)
- **Why**: AI-assisted Shopify page builder. Generates clean Liquid + JSON sections.
- **Free tier**: 1 page, full export.
- **Use as**: build 1 reference page, study what they emit, port the patterns into our `page-sections/` lib.
- **Cost**: $99/mo Pro tier with API access — defer until we want programmatic generation.

### 2. PageFly (https://pagefly.io)
- **Why**: Most popular Shopify page builder. Free tier, good template library.
- **Use as**: free tier for 1 reference page, mine their section CSS.

### 3. GSAP via CDN (https://gsap.com/docs/v3/Installation)
- **Why**: Eight Sleep uses heavy scroll-triggered animations. GSAP is the industry standard.
- **Body_html sanitizer note**: Shopify strips `<script>` from body_html. So GSAP can ONLY be added via theme sections (via `{{ 'gsap.min.js' | asset_url | script_tag }}` or `<script src>` in a `.liquid` file).
- **Workaround for body_html**: use CSS-only scroll animations via `animation-timeline: view()` (already used in `metricsScroll.ts`) — works in Chrome 115+, Safari 18+ which is fine for KRYO's UAE market.

### 4. Lottie (https://airbnb.io/lottie)
- **Why**: tiny JSON animations, perfect for cryo-engine deep-dive diagrams.
- **Body_html note**: same `<script>` restriction. Embed via Liquid section:
  ```liquid
  <script src="https://cdn.jsdelivr.net/npm/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
  <lottie-player src="{{ section.settings.animation_url }}" autoplay loop></lottie-player>
  ```

### 5. Tailwind UI / Tailwind Plus
- **Why**: 500+ marketing component patterns, all CSS-based.
- **Use as**: copy their HTML+CSS for new section types. Convert Tailwind utility classes to scoped vanilla CSS for our `kryo-sec-*` namespace.

### 6. Shopify Section Marketplace (https://shopify-section-store.com)
- **Why**: pay-once Liquid sections from theme authors.
- **Use case**: when KRYO needs a section pattern we don't have (e.g. quiz / configurator), buy a section, port the HTML+CSS into our lib.

### 7. shopify-theme-check (`gem install theme-check`)
- **Why**: official Shopify Liquid linter. Catches the schema errors `validate_theme_codeblocks` MCP catches, but locally + free.
- **Use as**: pre-commit hook on `theme-assets/sections/*.liquid` files.

### 8. Shopify Theme Inspector (Chrome extension)
- **Why**: see Liquid render times, catch slow loops, debug template inheritance.
- **Use as**: when a deployed page renders weird, run Theme Inspector on the live URL to see what Liquid is doing.

---

## What's actually missing in our current page-sections lib (worth porting)

| Pattern | Source | Why |
|---|---|---|
| Sticky-ATC scroll-triggered | Dawn `featured-product.liquid` | Eightsleep has this; ours sticky_cta_bar is always-visible, not scroll-triggered |
| Image with hotspots | Dawn `image-banner.liquid` + custom | Click product image areas to reveal specs; eightsleep uses heavily |
| Bento-grid feature cards | Tailwind UI marketing | Visual rhythm, multiple sizes; we have a flat 3-col grid |
| Comparison slider (drag) | Replo / Tapita | Drag the slider to compare KRYO vs old way; eightsleep has this |
| Sticky scrollytelling | Custom CSS-only | Fixed media + scrolling text; high-end DTC pattern (Apple-style) |
| Live ticker / counter | Custom CSS animation-timeline | Scroll-triggered counters; Whoop / Eightsleep |
| Side-by-side before/after | Custom | Shower before/after KRYO install; lifestyle proof |
| FAQ with auto-numbering | Dawn `collapsible-content.liquid` | Automatic numbering + smooth expand |

---

## When to use the Liquid theme-section path vs body_html path

The system has two render paths:

### A. Body_html composition (current default for `swarm-loop`)
- Composes 12+ section types into one big HTML blob via `page-composer`.
- Injected into Shopify product description via `clone-page` `body_html_full_replace`.
- **Limitation**: Shopify's product template wraps body_html in `.product__description` column (~373px wide). Our QC catches this via `parent_column_not_narrow` check.
- **Workaround 1**: full-bleed CSS escape in our section CSS:
  ```css
  .kryo-page { width: 100vw; margin-left: calc(-50vw + 50%); }
  ```
  This breaks out of any column container. Need to add to `_helpers.ts` BASE_CSS.
- **Workaround 2**: use the Liquid theme-section path instead.

### B. Liquid theme-section path (the kryo-premium template)
- Sections live in `theme-assets/sections/kryo-*.liquid` and are deployed to the Shopify theme.
- Product uses `template_suffix: 'kryo-premium'` which renders the sections at full viewport width.
- Already built but **was reverted on main** (commit `3e63687`) — needs re-deploy.
- **This is the right long-term path.** Body_html composition is a stopgap.

---

## Recommended next steps (in priority order)

1. **Add `width: 100vw; margin-left: calc(-50vw + 50%)` escape to `BASE_CSS`** in `src/lib/page-sections/_helpers.ts`. Single-line fix, makes body_html path actually full-width on Shopify.
2. **Cherry-pick the kryo-premium template revival** from `feature/kryo-product-templates` into the main feature branch. This restores the proper section rendering.
3. **Port 2-3 Dawn sections** into `page-sections/`: `image-with-text` (alternating media+copy), `collage` (lifestyle grid), `slideshow` (hero carousel). Single-PR each.
4. **CDN-load GSAP into the Liquid section path** for scroll animations. Body_html path stays CSS-only via `animation-timeline`.
5. **Trial Replo Pro for 1 month** ($99) — generate 5 reference pages, port the strongest patterns. Cancel.

---

## What this means for the swarm

Tomorrow's swarm-loop runs body_html path (path A). It will produce live Shopify products. The pages will look mediocre because of the `.product__description` column wrap — but the QC firewall now catches it (`parent_column_not_narrow` HARD FAIL).

Two paths to fix:
- Add the full-bleed CSS escape (5 minutes, fixes path A)
- Restore + use kryo-premium template (1 hour, the right architecture)

Either way, the system will detect and reject pages that fail to render full-width. Tom won't see broken pages.
