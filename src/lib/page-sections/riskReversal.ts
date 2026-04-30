// Risk reversal — "30-day performance guarantee" badge + body + bullets.
// Reference: eightsleep.com 30-night trial, Whoop 30-day money back.
// Pure HTML + scoped CSS.

import type { RiskReversalProps, SectionOutput } from './types';
import { escapeHtml, strokeIcon, ICONS } from './_helpers';

export function renderRiskReversal(props: RiskReversalProps): SectionOutput {
  const bullets = props.bullets ?? [];
  const bulletsHtml = bullets.length
    ? `<ul class="kryo-sec-risk__bullets">${bullets.map((b) => `<li><span class="kryo-sec-risk__bullet-dot">${strokeIcon(ICONS.check, 14, 2.5)}</span>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';

  const html = `
<section class="kryo-sec-risk" data-section="risk_reversal">
  <div class="kryo-container kryo-sec-risk__inner">
    <div class="kryo-sec-risk__badge">
      <span class="kryo-sec-risk__shield">${strokeIcon(ICONS.shield, 32, 1.6)}</span>
      ${props.badge ? `<p class="kryo-sec-risk__badge-text">${escapeHtml(props.badge)}</p>` : ''}
    </div>
    <div class="kryo-sec-risk__body">
      <h2 class="kryo-sec-risk__headline">${escapeHtml(props.headline)}</h2>
      <p class="kryo-sec-risk__copy">${escapeHtml(props.body)}</p>
      ${bulletsHtml}
    </div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-risk { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-risk__inner {
  display: grid; grid-template-columns: 200px 1fr; gap: 56px; align-items: center;
  padding: 48px; border: 1px solid var(--kryo-line); border-radius: var(--kryo-radius);
  background: linear-gradient(180deg, rgba(76,201,240,0.06), rgba(76,201,240,0.01));
}
.kryo-sec-risk__badge { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.kryo-sec-risk__shield {
  display: inline-flex; width: 72px; height: 72px;
  align-items: center; justify-content: center;
  border-radius: 999px; border: 1px solid rgba(76,201,240,0.4);
  color: var(--kryo-accent); background: rgba(76,201,240,0.08);
}
.kryo-sec-risk__badge-text {
  margin: 0; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; color: var(--kryo-accent);
  line-height: 1.4;
}
.kryo-sec-risk__headline { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 16px 0; }
.kryo-sec-risk__copy { margin: 0 0 20px 0; font-size: 16px; line-height: 1.55; color: var(--kryo-muted); max-width: 60ch; }
.kryo-sec-risk__bullets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.kryo-sec-risk__bullets li { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; }
.kryo-sec-risk__bullet-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 999px; flex-shrink: 0;
  background: rgba(76,201,240,0.18); color: var(--kryo-accent);
}
@media (max-width: 720px) {
  .kryo-sec-risk { padding: 64px 0; }
  .kryo-sec-risk__inner { grid-template-columns: 1fr; gap: 24px; padding: 32px; }
}
`.trim();

  return { html, css };
}
