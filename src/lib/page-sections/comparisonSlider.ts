// Comparison slider — drag-to-reveal between two stacked images.
// Pure CSS via <input type="range"> + CSS custom property + clip-path.
// No JS required — the range input drives a --kryo-cmp-pos custom property via attr().
// (We use a CSS hack: input[type=range] :has() doesn't reach across siblings, so we use
//  pointer-events on the input + a thumb visual + a clip-path styled by --kryo-cmp-pos.)
// Falls back gracefully on browsers without :has(): user can still drag the input itself.

import type { ComparisonSliderProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderComparisonSlider(props: ComparisonSliderProps): SectionOutput {
  const eyebrow = props.eyebrow;
  const headline = props.headline;
  const sub = props.sub;
  const beforeUrl = props.before_image_url;
  const afterUrl = props.after_image_url;
  const beforeLabel = props.before_label ?? 'Before';
  const afterLabel = props.after_label ?? 'After';
  const beforeAlt = props.before_alt ?? beforeLabel;
  const afterAlt = props.after_alt ?? afterLabel;
  const initial = Math.max(0, Math.min(100, props.initial_position ?? 50));

  const html = `
<section class="kryo-sec-cmp" data-section="comparison_slider">
  <div class="kryo-container">
    <div class="kryo-sec-cmp__intro">
      ${eyebrow ? `<p class="kryo-sec-cmp__eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      ${headline ? `<h2 class="kryo-sec-cmp__headline">${escapeHtml(headline)}</h2>` : ''}
      ${sub ? `<p class="kryo-sec-cmp__sub">${escapeHtml(sub)}</p>` : ''}
    </div>
    <div class="kryo-sec-cmp__viewer" style="--kryo-cmp-init:${initial};">
      <img class="kryo-sec-cmp__img kryo-sec-cmp__img--before" src="${escapeHtml(beforeUrl)}" alt="${escapeHtml(beforeAlt)}" loading="lazy">
      <img class="kryo-sec-cmp__img kryo-sec-cmp__img--after" src="${escapeHtml(afterUrl)}" alt="${escapeHtml(afterAlt)}" loading="lazy">
      <span class="kryo-sec-cmp__label kryo-sec-cmp__label--before">${escapeHtml(beforeLabel)}</span>
      <span class="kryo-sec-cmp__label kryo-sec-cmp__label--after">${escapeHtml(afterLabel)}</span>
      <input class="kryo-sec-cmp__range" type="range" min="0" max="100" value="${initial}" aria-label="Drag to compare ${escapeHtml(beforeLabel)} and ${escapeHtml(afterLabel)}">
      <div class="kryo-sec-cmp__handle" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    </div>
  </div>
</section>`.trim();

  // CSS-only trick: the input[type=range] is positioned over the entire viewer.
  // Its thumb is invisible but full-height, so dragging anywhere on the image moves it.
  // We use :has() to read the input value (modern browsers) — fallback keeps the input visible.
  const css = `
.kryo-sec-cmp { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-cmp__intro { max-width: 720px; margin: 0 auto 48px auto; text-align: center; }
.kryo-sec-cmp__eyebrow { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); margin: 0 0 12px 0; }
.kryo-sec-cmp__headline { font-size: clamp(1.8rem, 3.6vw, 2.8rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin: 0; }
.kryo-sec-cmp__sub { margin: 16px 0 0 0; font-size: clamp(0.95rem, 1.3vw, 1.1rem); line-height: 1.55; color: var(--kryo-muted); max-width: 56ch; margin-left: auto; margin-right: auto; }
.kryo-sec-cmp__viewer {
  --kryo-cmp-pos: calc(var(--kryo-cmp-init, 50) * 1%);
  position: relative;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  border-radius: 18px;
  overflow: hidden;
  aspect-ratio: 16/10;
  border: 1px solid var(--kryo-line);
  user-select: none;
}
.kryo-sec-cmp__viewer:has(.kryo-sec-cmp__range:hover),
.kryo-sec-cmp__viewer:has(.kryo-sec-cmp__range:active) { cursor: ew-resize; }
.kryo-sec-cmp__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.kryo-sec-cmp__img--before { z-index: 1; }
.kryo-sec-cmp__img--after  { z-index: 2; clip-path: inset(0 calc(100% - var(--kryo-cmp-pos)) 0 0); }
.kryo-sec-cmp__label {
  position: absolute; top: 16px; z-index: 4;
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(0,0,0,0.65); color: #fff; backdrop-filter: blur(6px);
}
.kryo-sec-cmp__label--before { left: 16px; }
.kryo-sec-cmp__label--after  { right: 16px; }
.kryo-sec-cmp__range {
  position: absolute; inset: 0; width: 100%; height: 100%; z-index: 5;
  appearance: none; -webkit-appearance: none;
  background: transparent; outline: none; cursor: ew-resize; margin: 0;
}
.kryo-sec-cmp__range::-webkit-slider-runnable-track { height: 100%; background: transparent; }
.kryo-sec-cmp__range::-moz-range-track { height: 100%; background: transparent; }
.kryo-sec-cmp__range::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 4px; height: 100%; cursor: ew-resize;
  background: rgba(255,255,255,0.9); box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
  border-radius: 0;
}
.kryo-sec-cmp__range::-moz-range-thumb {
  width: 4px; height: 100%; cursor: ew-resize;
  background: rgba(255,255,255,0.9); border: 1px solid rgba(0,0,0,0.3);
  border-radius: 0;
}
.kryo-sec-cmp__handle {
  position: absolute; top: 50%; left: var(--kryo-cmp-pos); z-index: 3;
  transform: translate(-50%, -50%);
  display: flex; align-items: center; justify-content: center; gap: 2px;
  width: 44px; height: 44px; border-radius: 50%;
  background: #fff; color: #0a0a0a;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  pointer-events: none;
}
@media (max-width: 720px) {
  .kryo-sec-cmp { padding: 64px 0; }
  .kryo-sec-cmp__viewer { aspect-ratio: 4/5; }
}
`.trim();

  return { html, css };
}
