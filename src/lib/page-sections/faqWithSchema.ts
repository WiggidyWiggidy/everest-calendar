// FAQ section — native <details>/<summary> accordion + JSON-LD FAQPage schema for rich snippets.
// Reference: eightsleep.com FAQ, Whoop FAQ structured data.
// Pure HTML + scoped CSS, no JS.

import type { FaqWithSchemaProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderFaqWithSchema(props: FaqWithSchemaProps): SectionOutput {
  const items = props.items;

  const itemsHtml = items
    .map(
      (item) => `<details class="kryo-sec-faq__item">
  <summary class="kryo-sec-faq__q">
    <span>${escapeHtml(item.question)}</span>
    <span class="kryo-sec-faq__chev" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </span>
  </summary>
  <div class="kryo-sec-faq__a">${escapeHtml(item.answer)}</div>
</details>`,
    )
    .join('');

  const html = `
<section class="kryo-sec-faq" data-section="faq_with_schema">
  <div class="kryo-container">
    ${props.headline ? `<h2 class="kryo-sec-faq__headline">${escapeHtml(props.headline)}</h2>` : '<h2 class="kryo-sec-faq__headline">Frequently asked questions</h2>'}
    <div class="kryo-sec-faq__list">${itemsHtml}</div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-faq { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-faq__headline {
  font-size: clamp(1.8rem, 3.6vw, 2.6rem); line-height: 1.1; letter-spacing: -0.02em;
  font-weight: 700; margin: 0 0 40px 0;
}
.kryo-sec-faq__list { display: flex; flex-direction: column; border-top: 1px solid var(--kryo-line); }
.kryo-sec-faq__item { border-bottom: 1px solid var(--kryo-line); }
.kryo-sec-faq__q {
  list-style: none; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 22px 0; font-size: 17px; font-weight: 500; color: var(--kryo-fg);
}
.kryo-sec-faq__q::-webkit-details-marker { display: none; }
.kryo-sec-faq__chev {
  display: inline-flex; transition: transform 200ms ease;
  width: 28px; height: 28px; align-items: center; justify-content: center;
  border-radius: 999px; border: 1px solid var(--kryo-line);
  color: var(--kryo-muted); flex-shrink: 0;
}
.kryo-sec-faq__item[open] .kryo-sec-faq__chev { transform: rotate(180deg); color: var(--kryo-fg); border-color: var(--kryo-fg); }
.kryo-sec-faq__a {
  padding: 0 0 24px 0;
  font-size: 16px; line-height: 1.6; color: var(--kryo-muted); max-width: 70ch;
}
@media (max-width: 720px) {
  .kryo-sec-faq { padding: 64px 0; }
  .kryo-sec-faq__q { font-size: 15px; padding: 18px 0; }
}
`.trim();

  const schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return { html, css, schemaJsonLd };
}
