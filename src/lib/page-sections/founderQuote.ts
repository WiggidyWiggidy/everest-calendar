// Founder quote — photo + 1-line origin story + signature. Premium credibility block.
// Reference: eightsleep.com "Letter from our CEO", Allbirds founders, Whoop's CEO blocks.
// Pure HTML + scoped CSS.

import type { FounderQuoteProps, SectionOutput } from './types';
import { escapeHtml, escapeAttr } from './_helpers';

export function renderFounderQuote(props: FounderQuoteProps): SectionOutput {
  const html = `
<section class="kryo-sec-founder" data-section="founder_quote">
  <div class="kryo-container kryo-sec-founder__inner">
    <figure class="kryo-sec-founder__media">
      <img src="${escapeAttr(props.photoUrl)}" alt="${escapeAttr(props.name)}" loading="lazy">
    </figure>
    <blockquote class="kryo-sec-founder__quote">
      <p>${escapeHtml(props.quote)}</p>
      <footer class="kryo-sec-founder__byline">
        ${props.signatureUrl ? `<img class="kryo-sec-founder__signature" src="${escapeAttr(props.signatureUrl)}" alt="${escapeAttr(props.name + ' signature')}" loading="lazy">` : ''}
        <div>
          <p class="kryo-sec-founder__name">${escapeHtml(props.name)}</p>
          <p class="kryo-sec-founder__role">${escapeHtml(props.role)}</p>
        </div>
      </footer>
    </blockquote>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-founder { padding: 96px 0; background: linear-gradient(180deg, var(--kryo-bg), #050505); }
.kryo-sec-founder__inner {
  display: grid; grid-template-columns: 280px 1fr; gap: 56px; align-items: center;
}
.kryo-sec-founder__media {
  margin: 0;
  border-radius: var(--kryo-radius); overflow: hidden;
  border: 1px solid var(--kryo-line);
  aspect-ratio: 4 / 5;
}
.kryo-sec-founder__media img { width: 100%; height: 100%; object-fit: cover; }
.kryo-sec-founder__quote {
  margin: 0; font-size: clamp(1.4rem, 2.4vw, 2rem); line-height: 1.35; letter-spacing: -0.01em;
  font-weight: 500; color: var(--kryo-fg);
}
.kryo-sec-founder__quote > p { margin: 0 0 32px 0; }
.kryo-sec-founder__quote > p::before { content: "\\201C"; margin-right: 0.05em; }
.kryo-sec-founder__quote > p::after { content: "\\201D"; margin-left: 0.05em; }
.kryo-sec-founder__byline { display: flex; align-items: center; gap: 16px; font-size: 14px; }
.kryo-sec-founder__signature { height: 40px; width: auto; opacity: 0.85; }
.kryo-sec-founder__name { font-weight: 700; margin: 0; font-size: 15px; }
.kryo-sec-founder__role { color: var(--kryo-muted); margin: 2px 0 0 0; font-size: 13px; }
@media (max-width: 720px) {
  .kryo-sec-founder { padding: 64px 0; }
  .kryo-sec-founder__inner { grid-template-columns: 1fr; gap: 32px; }
  .kryo-sec-founder__media { max-width: 220px; }
}
`.trim();

  return { html, css };
}
