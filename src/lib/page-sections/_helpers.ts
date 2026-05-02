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

// Shared base CSS — typography reset and brand variables — emitted once at compose time.
//
// IMPORTANT: full-bleed CSS escape on the .kryo-page wrapper. Shopify's product template wraps
// body_html in a `.product__description` column (~373px on standard themes). Without this escape,
// every section renders column-narrow on the live storefront (the 30 Apr broken-page bug).
// The `width: 100vw; margin-left: calc(50% - 50vw)` trick breaks out of any parent container
// while preserving horizontal centering. Tested on Dawn + Symmetry + Sense themes.
export const BASE_CSS = `
.kryo-page {
  --kryo-bg: #0a0a0a;
  --kryo-fg: #ffffff;
  --kryo-muted: rgba(255,255,255,0.65);
  --kryo-line: rgba(255,255,255,0.12);
  --kryo-accent: #4cc9f0;
  --kryo-radius: 12px;
  --kryo-font: -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif;
  font-family: var(--kryo-font);
  color: var(--kryo-fg);
  background: var(--kryo-bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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
.kryo-page .kryo-container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.kryo-page .kryo-eyebrow { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--kryo-muted); font-weight: 600; }
.kryo-page .kryo-cta {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 16px 32px; border-radius: 999px;
  background: var(--kryo-fg); color: var(--kryo-bg);
  font-weight: 600; font-size: 16px; text-decoration: none;
  transition: transform 160ms ease, opacity 160ms ease;
}
.kryo-page .kryo-cta:hover { transform: translateY(-1px); opacity: 0.92; }
.kryo-page .kryo-cta--ghost { background: transparent; color: var(--kryo-fg); border: 1px solid var(--kryo-line); }
@media (prefers-reduced-motion: reduce) {
  .kryo-page * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
`.trim();
