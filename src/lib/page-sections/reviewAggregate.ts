// Review aggregate — star rating + count + inline review quotes + JSON-LD AggregateRating + Review.
// Reference: eightsleep.com 4.65★/19,984 reviews block.
// Pure HTML + scoped CSS. Stars are SVG with width-clip for partial fill.

import type { ReviewAggregateProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderReviewAggregate(props: ReviewAggregateProps): SectionOutput {
  const rating = Math.max(0, Math.min(5, Number(props.ratingValue) || 0));
  const fillPct = (rating / 5) * 100;

  const starsRow = (filled: boolean) => {
    const stroke = filled ? 'currentColor' : 'currentColor';
    const fill = filled ? 'currentColor' : 'none';
    return Array.from({ length: 5 })
      .map(
        () =>
          `<svg viewBox="0 0 24 24" width="20" height="20" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
      )
      .join('');
  };

  const reviewCards = props.reviews
    .slice(0, 6)
    .map((r) => {
      const userStars = Math.max(0, Math.min(5, Math.round(r.rating)));
      const filledStars = Array.from({ length: 5 })
        .map(
          (_, i) =>
            `<svg viewBox="0 0 24 24" width="14" height="14" fill="${i < userStars ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        )
        .join('');
      return `<figure class="kryo-sec-rev__card">
        <div class="kryo-sec-rev__card-stars">${filledStars}</div>
        <blockquote class="kryo-sec-rev__card-text">${escapeHtml(r.text)}</blockquote>
        <figcaption class="kryo-sec-rev__card-author">${escapeHtml(r.author)}${r.date ? ` · <span>${escapeHtml(r.date)}</span>` : ''}</figcaption>
      </figure>`;
    })
    .join('');

  const html = `
<section class="kryo-sec-rev" data-section="review_aggregate" aria-label="Customer reviews">
  <div class="kryo-container">
    <div class="kryo-sec-rev__summary">
      <div class="kryo-sec-rev__starwrap" aria-hidden="true">
        <div class="kryo-sec-rev__stars-bg">${starsRow(false)}</div>
        <div class="kryo-sec-rev__stars-fg" style="width: ${fillPct.toFixed(1)}%">${starsRow(true)}</div>
      </div>
      <p class="kryo-sec-rev__rating">
        <span class="kryo-sec-rev__rating-value">${rating.toFixed(2)}</span>
        <span class="kryo-sec-rev__rating-meta">out of 5 · ${props.reviewCount.toLocaleString('en-US')} reviews</span>
      </p>
    </div>
    <div class="kryo-sec-rev__grid">${reviewCards}</div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-rev { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-rev__summary { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 56px; text-align: center; }
.kryo-sec-rev__starwrap { position: relative; display: inline-block; color: #f5b400; line-height: 0; }
.kryo-sec-rev__stars-bg { display: inline-flex; gap: 4px; opacity: 0.25; }
.kryo-sec-rev__stars-fg { display: inline-flex; gap: 4px; position: absolute; left: 0; top: 0; overflow: hidden; white-space: nowrap; }
.kryo-sec-rev__rating { margin: 0; font-size: 14px; }
.kryo-sec-rev__rating-value { font-weight: 700; font-size: 22px; margin-right: 6px; }
.kryo-sec-rev__rating-meta { color: var(--kryo-muted); }
.kryo-sec-rev__grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;
}
.kryo-sec-rev__card {
  margin: 0; padding: 24px;
  border: 1px solid var(--kryo-line); border-radius: var(--kryo-radius);
  background: rgba(255,255,255,0.02);
  display: flex; flex-direction: column; gap: 12px;
}
.kryo-sec-rev__card-stars { color: #f5b400; display: inline-flex; gap: 2px; }
.kryo-sec-rev__card-text { margin: 0; font-size: 15px; line-height: 1.55; color: rgba(255,255,255,0.92); }
.kryo-sec-rev__card-text::before { content: "\\201C"; margin-right: 0.05em; }
.kryo-sec-rev__card-text::after { content: "\\201D"; margin-left: 0.05em; }
.kryo-sec-rev__card-author { font-size: 13px; color: var(--kryo-muted); margin-top: auto; }
@media (max-width: 720px) {
  .kryo-sec-rev { padding: 64px 0; }
  .kryo-sec-rev__grid { grid-template-columns: 1fr; }
}
`.trim();

  const schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: props.productName,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(2),
      reviewCount: props.reviewCount,
      bestRating: '5',
      worstRating: '1',
    },
    review: props.reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: String(Math.max(1, Math.min(5, Math.round(r.rating)))), bestRating: '5' },
      author: { '@type': 'Person', name: r.author },
      reviewBody: r.text,
      ...(r.date ? { datePublished: r.date } : {}),
    })),
  };

  return { html, css, schemaJsonLd };
}
