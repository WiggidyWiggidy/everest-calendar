// Marquee band — infinite horizontal-scroll text strip (eight-sleep + Whoop pattern).
// Pure CSS @keyframes translateX, no JS. Respects prefers-reduced-motion.
// Doubles the items in DOM so the loop seam is invisible.

import type { MarqueeBandProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderMarqueeBand(props: MarqueeBandProps): SectionOutput {
  const items = props.items ?? [];
  if (items.length === 0) return { html: '', css: '' };

  const speed = props.speed ?? 40; // seconds per loop
  const direction = props.direction === 'right' ? 'reverse' : 'normal';
  const variant = props.variant ?? 'dark'; // 'dark' | 'light' | 'accent'
  const separator = props.separator ?? '·';

  // Render twice for seamless loop — animation translates by -50% which lands the second copy at start
  const renderItem = (item: string) =>
    `<span class="kryo-sec-marquee__item">${escapeHtml(item)}</span><span class="kryo-sec-marquee__sep" aria-hidden="true">${escapeHtml(separator)}</span>`;
  const trackHtml = items.map(renderItem).join('');

  const html = `
<section class="kryo-sec-marquee kryo-sec-marquee--${variant}" data-section="marquee_band" aria-label="${escapeHtml(props.aria_label ?? 'Highlights')}">
  <div class="kryo-sec-marquee__viewport">
    <div class="kryo-sec-marquee__track" style="--kryo-marquee-speed:${speed}s; --kryo-marquee-dir:${direction};">
      <div class="kryo-sec-marquee__group" aria-hidden="false">${trackHtml}</div>
      <div class="kryo-sec-marquee__group" aria-hidden="true">${trackHtml}</div>
    </div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-marquee {
  --kryo-marquee-bg-dark: #0a0a0a;
  --kryo-marquee-fg-dark: rgba(255,255,255,0.78);
  --kryo-marquee-bg-light: #f5f5f5;
  --kryo-marquee-fg-light: #0a0a0a;
  --kryo-marquee-bg-accent: #4cc9f0;
  --kryo-marquee-fg-accent: #0a0a0a;
  border-top: 1px solid var(--kryo-line);
  border-bottom: 1px solid var(--kryo-line);
  overflow: hidden;
  user-select: none;
}
.kryo-sec-marquee--dark   { background: var(--kryo-marquee-bg-dark);   color: var(--kryo-marquee-fg-dark); }
.kryo-sec-marquee--light  { background: var(--kryo-marquee-bg-light);  color: var(--kryo-marquee-fg-light); }
.kryo-sec-marquee--accent { background: var(--kryo-marquee-bg-accent); color: var(--kryo-marquee-fg-accent); }
.kryo-sec-marquee__viewport { overflow: hidden; padding: 14px 0; }
.kryo-sec-marquee__track {
  display: flex;
  width: max-content;
  animation: kryo-marquee-scroll var(--kryo-marquee-speed, 40s) linear infinite;
  animation-direction: var(--kryo-marquee-dir, normal);
}
.kryo-sec-marquee__group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-right: 32px;
}
.kryo-sec-marquee__item {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
  padding: 0 24px;
}
.kryo-sec-marquee__sep {
  font-size: 16px;
  opacity: 0.55;
  flex-shrink: 0;
}
@keyframes kryo-marquee-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .kryo-sec-marquee__track { animation: none; transform: none; }
  .kryo-sec-marquee__group:last-child { display: none; }
}
@media (max-width: 720px) {
  .kryo-sec-marquee__item { font-size: 11px; letter-spacing: 0.14em; padding: 0 16px; }
  .kryo-sec-marquee__sep { font-size: 12px; }
}
`.trim();

  return { html, css };
}
