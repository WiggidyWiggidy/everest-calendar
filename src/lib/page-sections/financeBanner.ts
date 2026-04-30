// Finance banner — full price + installment breakdown + provider list + optional risk copy.
// Reference: eightsleep.com Affirm/HSA banner, Whoop "0% APR" prominence.
// Pure HTML + scoped CSS.

import type { FinanceBannerProps, SectionOutput } from './types';
import { escapeHtml, strokeIcon, ICONS } from './_helpers';

export function renderFinanceBanner(props: FinanceBannerProps): SectionOutput {
  const providers = props.providers ?? [];

  const html = `
<section class="kryo-sec-fin" data-section="finance_banner">
  <div class="kryo-container kryo-sec-fin__inner">
    <div class="kryo-sec-fin__main">
      <p class="kryo-eyebrow">Flexible payment</p>
      <p class="kryo-sec-fin__headline">
        <span class="kryo-sec-fin__price">${escapeHtml(props.fullPrice)}</span>
        <span class="kryo-sec-fin__or">or</span>
        <span class="kryo-sec-fin__installment">${escapeHtml(String(props.installmentCount))} × ${escapeHtml(props.installmentPrice)}</span>
      </p>
      ${props.riskCopy ? `<p class="kryo-sec-fin__risk">${strokeIcon(ICONS.shield, 14, 2)} ${escapeHtml(props.riskCopy)}</p>` : ''}
    </div>
    ${
      providers.length > 0
        ? `<ul class="kryo-sec-fin__providers" aria-label="Available payment plans">${providers
            .map((p) => `<li class="kryo-sec-fin__provider">${escapeHtml(p)}</li>`)
            .join('')}</ul>`
        : ''
    }
  </div>
</section>`.trim();

  const css = `
.kryo-sec-fin { padding: 56px 0; background: linear-gradient(180deg, #050505, var(--kryo-bg)); border-top: 1px solid var(--kryo-line); border-bottom: 1px solid var(--kryo-line); }
.kryo-sec-fin__inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 32px; }
.kryo-sec-fin__main { display: flex; flex-direction: column; gap: 8px; }
.kryo-sec-fin__headline {
  font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 700; letter-spacing: -0.01em; margin: 0;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px;
}
.kryo-sec-fin__price { color: var(--kryo-fg); }
.kryo-sec-fin__or { font-size: 14px; font-weight: 500; color: var(--kryo-muted); text-transform: lowercase; }
.kryo-sec-fin__installment { color: var(--kryo-accent); }
.kryo-sec-fin__risk { font-size: 13px; color: var(--kryo-muted); display: inline-flex; align-items: center; gap: 6px; margin: 0; }
.kryo-sec-fin__providers { list-style: none; padding: 0; margin: 0; display: flex; gap: 8px; flex-wrap: wrap; }
.kryo-sec-fin__provider {
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600;
  padding: 8px 14px; border: 1px solid var(--kryo-line); border-radius: 999px;
  color: var(--kryo-fg); background: rgba(255,255,255,0.04);
}
`.trim();

  return { html, css };
}
