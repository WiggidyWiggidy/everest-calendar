// Lifestyle strip — full-bleed photo grid (3-up or 2-up).
// Reference: eightsleep.com — they pad pages with many lifestyle/in-context shots between content sections.
// Pure HTML + scoped CSS. No JS.

import type { LifestyleStripProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderLifestyleStrip(props: LifestyleStripProps): SectionOutput {
  const layout = props.layout ?? '3up';
  const headline = props.headline;
  const sub = props.sub;
  const items = props.images
    .map(
      (img) => `<figure class="kryo-sec-lifestyle__item">
  <img class="kryo-sec-lifestyle__img" src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt ?? '')}" loading="lazy">
  ${img.caption ? `<figcaption class="kryo-sec-lifestyle__caption">${escapeHtml(img.caption)}</figcaption>` : ''}
</figure>`,
    )
    .join('');

  const html = `
<section class="kryo-sec-lifestyle kryo-sec-lifestyle--${layout}" data-section="lifestyle_strip">
  ${headline || sub ? `<div class="kryo-container">
    ${headline ? `<h2 class="kryo-sec-lifestyle__headline">${escapeHtml(headline)}</h2>` : ''}
    ${sub ? `<p class="kryo-sec-lifestyle__sub">${escapeHtml(sub)}</p>` : ''}
  </div>` : ''}
  <div class="kryo-sec-lifestyle__grid">${items}</div>
</section>`.trim();

  const css = `
.kryo-sec-lifestyle { padding: 80px 0; background: var(--kryo-bg); }
.kryo-sec-lifestyle__headline { font-size: clamp(1.8rem, 3.6vw, 2.8rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 12px 0; max-width: 26ch; }
.kryo-sec-lifestyle__sub { margin: 0 0 48px 0; font-size: clamp(0.95rem, 1.3vw, 1.1rem); line-height: 1.5; color: var(--kryo-muted); max-width: 56ch; }
.kryo-sec-lifestyle__grid { display: grid; gap: 4px; padding: 0; margin: 0; }
.kryo-sec-lifestyle--3up .kryo-sec-lifestyle__grid { grid-template-columns: repeat(3, 1fr); }
.kryo-sec-lifestyle--2up .kryo-sec-lifestyle__grid { grid-template-columns: repeat(2, 1fr); }
.kryo-sec-lifestyle--full .kryo-sec-lifestyle__grid { grid-template-columns: 1fr; }
.kryo-sec-lifestyle__item { margin: 0; position: relative; overflow: hidden; aspect-ratio: 4/5; }
.kryo-sec-lifestyle--full .kryo-sec-lifestyle__item { aspect-ratio: 16/9; }
.kryo-sec-lifestyle__img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 600ms ease; }
.kryo-sec-lifestyle__item:hover .kryo-sec-lifestyle__img { transform: scale(1.03); }
.kryo-sec-lifestyle__caption { position: absolute; left: 16px; bottom: 16px; right: 16px; margin: 0; color: #fff; font-size: 13px; font-weight: 500; text-shadow: 0 1px 8px rgba(0,0,0,0.6); }
@media (max-width: 720px) {
  .kryo-sec-lifestyle { padding: 56px 0; }
  .kryo-sec-lifestyle--3up .kryo-sec-lifestyle__grid,
  .kryo-sec-lifestyle--2up .kryo-sec-lifestyle__grid { grid-template-columns: 1fr; }
  .kryo-sec-lifestyle__item { aspect-ratio: 4/3; }
}
`.trim();

  return { html, css };
}
