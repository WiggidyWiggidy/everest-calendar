// Press logos — "As featured in" horizontal strip.
// Reference: eightsleep.com / Whoop / Oura — single dense row of publication logos to anchor authority.
// Pure HTML + scoped CSS. No JS.

import type { PressLogosProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderPressLogos(props: PressLogosProps): SectionOutput {
  const eyebrow = props.eyebrow ?? 'As featured in';
  const items = (props.logos ?? [])
    .map((logo) => {
      // If logo has imageUrl, use img; else fall back to label-only chip.
      if (logo.imageUrl) {
        return `<li class="kryo-sec-press__item">
  <img class="kryo-sec-press__logo" src="${escapeHtml(logo.imageUrl)}" alt="${escapeHtml(logo.label)}" loading="lazy">
</li>`;
      }
      return `<li class="kryo-sec-press__item">
  <span class="kryo-sec-press__label">${escapeHtml(logo.label)}</span>
</li>`;
    })
    .join('');

  const html = `
<section class="kryo-sec-press" data-section="press_logos">
  <div class="kryo-container">
    <p class="kryo-sec-press__eyebrow">${escapeHtml(eyebrow)}</p>
    <ul class="kryo-sec-press__grid">${items}</ul>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-press { padding: 56px 0; background: var(--kryo-bg); border-top: 1px solid var(--kryo-line); border-bottom: 1px solid var(--kryo-line); }
.kryo-sec-press__eyebrow { margin: 0 0 24px 0; text-align: center; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); }
.kryo-sec-press__grid { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 32px 56px; }
.kryo-sec-press__item { display: inline-flex; align-items: center; height: 32px; }
.kryo-sec-press__logo { height: 28px; width: auto; opacity: 0.6; filter: grayscale(1) contrast(0.9); transition: opacity 200ms; }
.kryo-sec-press__logo:hover { opacity: 1; }
.kryo-sec-press__label { font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 700; color: var(--kryo-muted); letter-spacing: -0.01em; opacity: 0.7; }
@media (max-width: 720px) {
  .kryo-sec-press { padding: 40px 0; }
  .kryo-sec-press__grid { gap: 20px 32px; }
  .kryo-sec-press__logo { height: 22px; }
  .kryo-sec-press__label { font-size: 14px; }
}
`.trim();

  return { html, css };
}
