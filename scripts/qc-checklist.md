# Eight Sleep Parity QC Checklist

The bar Tom set: "compare against eightsleep.com — our north star of website brand feel. If it doesn't closely align then you are not complete." Use this to score every Shopify product page deploy. Score must hit **≥38/48** to claim "parity"; below 35 means rework.

How to use:
1. After every theme/product change, run `scripts/verify-shopify-page.sh <url>` (Playwright at desktop + mobile).
2. Read both PNGs via Read tool.
3. For each item below, observe the live page + score it 1 (matches) or 0 (doesn't).
4. Sum the score. Surface to Tom with screenshots.

## A. Brand identity (15 items)

| # | Item | Eight Sleep target | KRYO check |
|---|---|---|---|
| 1 | Hero background | near-black (`#0a0a0a` or darker) | computed style |
| 2 | Body text on dark | white | `color: #ffffff` |
| 3 | Body text on light | near-black `#2c2c2c`–`#1a1a1a` | computed |
| 4 | Accent/CTA bg | white pill on dark, or branded blue | match scheme |
| 5 | Border/divider | subtle (`rgba(255,255,255,0.12)` on dark) | computed |
| 6 | Font stack | system: `-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial` | match |
| 7 | Body size | 16–18px | computed |
| 8 | H1 size | clamp(36px, 8vw, 56px) — fluid | computed |
| 9 | H1 letter-spacing | `-0.02em` to `-0.04em` | computed |
| 10 | H2 size | clamp(24px, 5vw, 36px) | computed |
| 11 | Eyebrow text | uppercase, `letter-spacing 0.18em`, `font-size 12px`, `font-weight 600` | computed |
| 12 | Section padding desktop | 80–120px vertical | computed |
| 13 | Section padding mobile | 40–60px vertical | computed |
| 14 | CTA button padding | `16px 32px`, height ~48px | computed |
| 15 | CTA radius | 999px (pill) per Eight Sleep, OR 8–12px (Whoop). Pick one and stick to it. | computed |

## B. Hero section (8 items)

| # | Item | Eight Sleep target | KRYO check |
|---|---|---|---|
| 16 | Eyebrow above headline | yes, uppercase 12px | present |
| 17 | Headline ≤ 35 chars | yes, max 18ch line | present |
| 18 | Sub-headline ≤ 150 chars | concise | present |
| 19 | Hero media | `<video autoplay muted loop playsinline>` OR full-bleed image with poster fallback | source tag check |
| 20 | Hero height desktop | 60–88vh | bounding box |
| 21 | Hero height mobile | 50–78vh | bounding box at 375 |
| 22 | Scrim gradient | `linear-gradient(180deg, rgba(0,0,0,0.20–0.25) 0%, rgba(0,0,0,0.85–0.88) 100%)` | computed |
| 23 | CTA copy + clear primary action | "Reserve your unit" / "Order Now" — one primary action | text |

## C. Section sequence (10 items)

| # | Section | Required? | Position |
|---|---|---|---|
| 24 | Hero | Required | First |
| 25 | Trust/scarcity strip (e.g. "16/50 left") | High value for $3,990 | Above-fold or sticky |
| 26 | Primary product info (title, price, buy form) | Required (theme `main-product`) | Within first 1.5 viewports |
| 27 | Comparison vs old way | Required for premium hardware | After hero or after main |
| 28 | Cryo-Engine / How It Works deep-dive | KRYO-specific premium | Mid-page |
| 29 | Risk reversal (30-day guarantee) | Required for $3,990 | Within 2 scrolls of CTA |
| 30 | FAQ accordion (3–8 items) | Required (FAQPage schema bonus) | Bottom of page |
| 31 | Founder/credibility block | High value | Mid-page |
| 32 | Review aggregate + AggregateRating schema | Required for SEO + CR | Bottom-mid |
| 33 | Sticky CTA bar (mobile + desktop) | Required for CR | Always visible |

## D. Cart drawer UX (7 items — CRITICAL per Tom's CR concern)

| # | Item | Target | KRYO check |
|---|---|---|---|
| 34 | Buy button trigger | "Reserve your unit" / "Add to cart" | text + selector |
| 35 | Drawer behavior | slides in from right (or modal) — NOT page redirect | observation |
| 36 | Drawer open animation | 200–350ms `cubic-bezier(0.4, 0, 0.2, 1)` | timing |
| 37 | Drawer width desktop | 400–450px right-aligned | width |
| 38 | Drawer contents | item, price, qty, subtotal, "Checkout" CTA, "Continue shopping" | content present |
| 39 | Drawer mobile | full-screen or bottom sheet, safe-area padding | viewport check |
| 40 | Time-to-drawer-open | ≤200ms INP per Web Vitals; ≤300ms acceptable | Lighthouse INP |

## E. Premium patterns (8 items)

| # | Item | Target | KRYO check |
|---|---|---|---|
| 41 | Sticky CTA bar | `position: fixed; bottom: 0` mobile, sticky desktop after hero scroll | computed |
| 42 | Sticky bar contents | product name + price + "Reserve unit" CTA | content |
| 43 | Risk reversal copy exact | "30-day performance guarantee" or similar | text match |
| 44 | Comparison structure | 2-col grid, ✗ left vs ✓ right | DOM |
| 45 | Schema.org Product JSON-LD | Product { name, offers, aggregateRating? } | view-source |
| 46 | Schema.org FAQPage JSON-LD | FAQPage { mainEntity: [{Question, Answer}] } | view-source |
| 47 | Animations | CSS-only (no GSAP/Framer/Lottie bundles) | bundle check |
| 48 | Hero video autoplay | `autoplay muted loop playsinline` if video, otherwise `<picture>` with WebP | DOM check |

## Tier ranking

- **38–48: Eight-sleep parity.** Ship.
- **35–37: Acceptable.** Ship with explicit gap list to Tom.
- **<35: Rework.** Don't ship; revert and re-author the failing items.

## Post-deploy parity scoring template

After running `verify-shopify-page.sh`:
- `/tmp/qc-desktop.png` — full-page desktop screenshot
- `/tmp/qc-mobile.png` — full-page mobile screenshot
- `/tmp/qc-diagnostics.json` — Playwright JSON dump

Score 1 line per item. Total. Surface to Tom.
