// Bento grid — non-uniform feature card layout (Apple iPad / Tesla / Whoop pattern).
// CSS Grid with named areas. Default: 1 large hero card + 2 medium + 2 small (5 total).
// Each card supports optional accent_image, headline, body, and cta. Pure CSS, no JS.

import type { BentoGridProps, BentoCardProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

const SIZE_TO_AREA = ['hero', 'mid-a', 'mid-b', 'small-a', 'small-b'] as const;

export function renderBentoGrid(props: BentoGridProps): SectionOutput {
  const eyebrow = props.eyebrow;
  const headline = props.headline;
  const sub = props.sub;
  const cards = (props.cards ?? []).slice(0, 5);

  const cardHtml = cards
    .map((card: BentoCardProps, i: number) => {
      const area = SIZE_TO_AREA[i] ?? 'small-b';
      const sizeClass = card.size ?? (i === 0 ? 'large' : i < 3 ? 'medium' : 'small');
      const accentImg = card.accent_image
        ? `<img class="kryo-sec-bento__media" src="${escapeHtml(card.accent_image)}" alt="${escapeHtml(card.accent_alt ?? '')}" loading="lazy">`
        : '';
      const eyebrowEl = card.eyebrow
        ? `<p class="kryo-sec-bento__eyebrow">${escapeHtml(card.eyebrow)}</p>`
        : '';
      const headEl = card.headline
        ? `<h3 class="kryo-sec-bento__card-headline">${escapeHtml(card.headline)}</h3>`
        : '';
      const bodyEl = card.body ? `<p class="kryo-sec-bento__body">${escapeHtml(card.body)}</p>` : '';
      const metricEl = card.metric_value
        ? `<p class="kryo-sec-bento__metric">${escapeHtml(card.metric_value)}<span class="kryo-sec-bento__metric-sub">${escapeHtml(card.metric_label ?? '')}</span></p>`
        : '';
      const ctaEl = card.cta_text && card.cta_href
        ? `<a class="kryo-sec-bento__cta" href="${escapeHtml(card.cta_href)}">${escapeHtml(card.cta_text)} <span aria-hidden="true">→</span></a>`
        : '';
      return `
<article class="kryo-sec-bento__card kryo-sec-bento__card--${sizeClass}" style="grid-area: ${area};">
  ${accentImg}
  <div class="kryo-sec-bento__card-body">
    ${eyebrowEl}
    ${headEl}
    ${metricEl}
    ${bodyEl}
    ${ctaEl}
  </div>
</article>`.trim();
    })
    .join('');

  const html = `
<section class="kryo-sec-bento" data-section="bento_grid">
  <div class="kryo-container">
    ${eyebrow ? `<p class="kryo-sec-bento__eyebrow-top">${escapeHtml(eyebrow)}</p>` : ''}
    ${headline ? `<h2 class="kryo-sec-bento__headline">${escapeHtml(headline)}</h2>` : ''}
    ${sub ? `<p class="kryo-sec-bento__sub">${escapeHtml(sub)}</p>` : ''}
    <div class="kryo-sec-bento__grid">${cardHtml}</div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-bento { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-bento__eyebrow-top { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); margin: 0 0 12px 0; }
.kryo-sec-bento__headline { font-size: clamp(1.8rem, 3.6vw, 2.6rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin: 0; max-width: 22ch; }
.kryo-sec-bento__sub { margin: 16px 0 48px 0; font-size: clamp(0.95rem, 1.3vw, 1.1rem); line-height: 1.55; color: var(--kryo-muted); max-width: 56ch; }
.kryo-sec-bento__grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: minmax(280px, auto) minmax(220px, auto);
  grid-template-areas:
    "hero hero mid-a mid-a"
    "hero hero mid-b mid-b"
    "small-a small-a small-b small-b";
}
.kryo-sec-bento__card {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--kryo-line);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 220px;
  transition: transform 280ms ease, border-color 280ms ease;
}
.kryo-sec-bento__card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.20); }
.kryo-sec-bento__card--large { min-height: 480px; }
.kryo-sec-bento__media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.45; mask-image: linear-gradient(180deg, transparent 0%, #000 60%); -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 60%); }
.kryo-sec-bento__card-body { position: relative; padding: 28px; display: flex; flex-direction: column; gap: 8px; }
.kryo-sec-bento__eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); margin: 0; }
.kryo-sec-bento__card-headline { margin: 0; font-size: clamp(1.2rem, 2vw, 1.6rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; color: var(--kryo-fg); }
.kryo-sec-bento__card--large .kryo-sec-bento__card-headline { font-size: clamp(1.8rem, 3.2vw, 2.6rem); }
.kryo-sec-bento__metric { margin: 4px 0 0 0; font-size: clamp(2.4rem, 5vw, 4rem); font-weight: 700; letter-spacing: -0.03em; line-height: 0.95; color: var(--kryo-fg); display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.kryo-sec-bento__metric-sub { font-size: 13px; font-weight: 500; letter-spacing: 0.02em; color: var(--kryo-muted); }
.kryo-sec-bento__body { margin: 4px 0 0 0; font-size: 0.95rem; line-height: 1.5; color: var(--kryo-muted); }
.kryo-sec-bento__cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 14px; font-weight: 600; color: var(--kryo-fg); text-decoration: none; opacity: 0.92; transition: gap 200ms ease; }
.kryo-sec-bento__cta:hover { gap: 12px; }
@media (max-width: 900px) {
  .kryo-sec-bento { padding: 72px 0; }
  .kryo-sec-bento__grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-template-areas:
      "hero"
      "mid-a"
      "mid-b"
      "small-a"
      "small-b";
  }
  .kryo-sec-bento__card--large { min-height: 360px; }
}
`.trim();

  return { html, css };
}
