// Shared helpers for the page-sections library.

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]);
}

export function escapeAttr(input: unknown): string {
  return escapeHtml(input);
}

// Inline a Lucide-style stroke SVG. Pass currentColor for color inheritance.
export function strokeIcon(
  pathD: string,
  size = 24,
  strokeWidth = 2,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    pathD +
    '</svg>'
  );
}

// Common Lucide icons inlined (avoids any external fetch).
export const ICONS = {
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
  thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>',
  clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  award: '<circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>',
};

// Shared base CSS — typography system, motion polish, and brand variables — emitted once at compose time.
//
// IMPORTANT: full-bleed CSS escape on the .kryo-page wrapper. Shopify's product template wraps
// body_html in a `.product__description` column (~373px on standard themes). Without this escape,
// every section renders column-narrow on the live storefront (the 30 Apr broken-page bug).
// The `width: 100vw; margin-left: calc(50% - 50vw)` trick breaks out of any parent container
// while preserving horizontal centering. Tested on Dawn + Symmetry + Sense themes.
//
// QUALITY LIFT (3 May 2026): typography rhythm, motion polish, deeper background, bigger CTA,
// section breathing utility, hairline dividers, scroll-reveal hook (data-reveal="up").
export const BASE_CSS = `
.kryo-page {
  --kryo-bg: #0a0a0a;
  --kryo-bg-soft: #121212;
  --kryo-fg: #ffffff;
  --kryo-fg-soft: rgba(255,255,255,0.92);
  --kryo-muted: rgba(255,255,255,0.62);
  --kryo-faint: rgba(255,255,255,0.42);
  --kryo-line: rgba(255,255,255,0.10);
  --kryo-line-strong: rgba(255,255,255,0.20);
  --kryo-accent: #6ad4ff;
  --kryo-accent-warm: #ff7a59;
  --kryo-radius: 14px;
  --kryo-radius-lg: 22px;
  --kryo-shadow-cta: 0 4px 24px rgba(0,0,0,0.28);
  --kryo-shadow-cta-hover: 0 12px 36px rgba(0,0,0,0.40);
  --kryo-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --kryo-font: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
  font-family: var(--kryo-font);
  font-feature-settings: "ss01", "cv11", "cv02";
  color: var(--kryo-fg);
  background:
    radial-gradient(ellipse 120% 60% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 60%),
    linear-gradient(180deg, #0e0e10 0%, #0a0a0a 40%, #050505 100%);
  line-height: 1.55;
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  /* Full-bleed escape: break out of any product__description column wrapper */
  position: relative;
  left: 50%;
  right: 50%;
  margin-left: -50vw;
  margin-right: -50vw;
  width: 100vw;
  max-width: 100vw;
  overflow-x: hidden;
}
.kryo-page *, .kryo-page *::before, .kryo-page *::after { box-sizing: border-box; }
.kryo-page img, .kryo-page video { max-width: 100%; height: auto; display: block; }
.kryo-page p { margin: 0; }

/* Heading rhythm — sections may override font-size, but inherit weight/spacing/leading */
.kryo-page h1, .kryo-page h2, .kryo-page h3, .kryo-page h4 {
  margin: 0;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.04;
  color: var(--kryo-fg);
  text-wrap: balance;
}
.kryo-page h3, .kryo-page h4 { letter-spacing: -0.018em; line-height: 1.15; }

.kryo-page .kryo-container { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 24px; }
@media (min-width: 1280px) { .kryo-page .kryo-container { padding: 0 40px; } }

.kryo-page .kryo-eyebrow {
  font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--kryo-muted); font-weight: 600; margin: 0;
}

.kryo-page .kryo-cta {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 20px 36px;
  border-radius: 999px;
  background: var(--kryo-fg);
  color: var(--kryo-bg);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.01em;
  text-decoration: none;
  transition: transform 280ms var(--kryo-ease), box-shadow 280ms var(--kryo-ease);
  box-shadow: var(--kryo-shadow-cta);
  white-space: nowrap;
}
.kryo-page .kryo-cta:hover {
  transform: translateY(-2px);
  box-shadow: var(--kryo-shadow-cta-hover);
}
.kryo-page .kryo-cta--ghost {
  background: transparent;
  color: var(--kryo-fg);
  border: 1px solid var(--kryo-line-strong);
  box-shadow: none;
}
.kryo-page .kryo-cta--ghost:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.40);
}

/* Section breathing utility — opt-in via class. Existing sections keep their hardcoded padding. */
.kryo-page .kryo-section { padding: clamp(72px, 10vw, 144px) 0; position: relative; }

/* Hairline divider between consecutive top-level sections — keeps the long-form scroll readable */
.kryo-page > section + section,
.kryo-page section + section {
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* Scroll-reveal hook — sections opt in by adding data-reveal="up". No-op fallback when unsupported. */
@supports (animation-timeline: view()) {
  .kryo-page [data-reveal="up"] {
    animation: kryoFadeUp 1.1s var(--kryo-ease) both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
  @keyframes kryoFadeUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}

.kryo-page ::selection { background: rgba(255,255,255,0.20); color: var(--kryo-fg); }

@media (prefers-reduced-motion: reduce) {
  .kryo-page * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
`.trim();
