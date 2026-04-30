// Sticky CTA bar — fixed bottom-of-viewport bar with price + CTA. Mobile-first.
// Reference: eightsleep.com Pod sticky bar, Allbirds product sticky add-to-cart.
// Pure HTML + scoped CSS, no JS.

import type { StickyCtaBarProps, SectionOutput } from './types';
import { escapeHtml, escapeAttr, strokeIcon, ICONS } from './_helpers';

export function renderStickyCtaBar(props: StickyCtaBarProps): SectionOutput {
  const html = `
<aside class="kryo-sec-stickybar" data-section="sticky_cta_bar" aria-label="Persistent buy bar">
  <div class="kryo-sec-stickybar__inner">
    <div class="kryo-sec-stickybar__info">
      <p class="kryo-sec-stickybar__name">${escapeHtml(props.productName)}</p>
      <p class="kryo-sec-stickybar__price">
        <span class="kryo-sec-stickybar__amount">${escapeHtml(props.price)}</span>
        ${props.pricePer ? `<span class="kryo-sec-stickybar__per">${escapeHtml(props.pricePer)}</span>` : ''}
      </p>
      ${props.shipNote ? `<p class="kryo-sec-stickybar__ship">${strokeIcon(ICONS.zap, 12, 2.5)} ${escapeHtml(props.shipNote)}</p>` : ''}
    </div>
    <a href="${escapeAttr(props.ctaHref)}" class="kryo-cta kryo-sec-stickybar__cta">${escapeHtml(props.ctaText)} ${strokeIcon(ICONS.arrowRight, 16)}</a>
  </div>
</aside>`.trim();

  const css = `
.kryo-sec-stickybar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  background: rgba(10,10,10,0.94);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--kryo-line);
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}
.kryo-sec-stickybar__inner {
  max-width: 1200px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.kryo-sec-stickybar__info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kryo-sec-stickybar__name { font-size: 12px; color: var(--kryo-muted); margin: 0; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600; }
.kryo-sec-stickybar__price { font-size: 18px; font-weight: 700; margin: 0; display: flex; align-items: baseline; gap: 8px; }
.kryo-sec-stickybar__per { font-size: 12px; font-weight: 500; color: var(--kryo-muted); }
.kryo-sec-stickybar__ship { font-size: 11px; color: var(--kryo-accent); margin: 2px 0 0 0; display: inline-flex; align-items: center; gap: 4px; }
.kryo-sec-stickybar__cta { padding: 12px 22px; font-size: 14px; flex-shrink: 0; }
@media (max-width: 480px) {
  .kryo-sec-stickybar__name { display: none; }
  .kryo-sec-stickybar__price { font-size: 16px; }
}
`.trim();

  return { html, css };
}
