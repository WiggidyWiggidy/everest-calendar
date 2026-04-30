// Comparison split — two-column "Old way vs KRYO" with right column highlighted.
// Reference: eightsleep.com "Pod vs other mattresses", Tonal "vs gym membership".
// Pure HTML + scoped CSS.

import type { ComparisonSplitProps, SectionOutput } from './types';
import { escapeHtml, strokeIcon, ICONS } from './_helpers';

export function renderComparisonSplit(props: ComparisonSplitProps): SectionOutput {
  const highlight = props.rightHighlight !== false;

  const xIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const renderBullets = (bullets: string[], variant: 'left' | 'right') =>
    bullets
      .map(
        (b) =>
          `<li class="kryo-sec-cmp__bullet kryo-sec-cmp__bullet--${variant}"><span class="kryo-sec-cmp__icon">${variant === 'right' ? strokeIcon(ICONS.check, 14, 2.5) : xIcon}</span>${escapeHtml(b)}</li>`,
      )
      .join('');

  const html = `
<section class="kryo-sec-cmp" data-section="comparison_split">
  <div class="kryo-container">
    ${props.headline ? `<h2 class="kryo-sec-cmp__headline">${escapeHtml(props.headline)}</h2>` : ''}
    <div class="kryo-sec-cmp__grid">
      <div class="kryo-sec-cmp__col kryo-sec-cmp__col--muted">
        <p class="kryo-sec-cmp__col-label">${escapeHtml(props.leftLabel)}</p>
        <ul class="kryo-sec-cmp__list">${renderBullets(props.leftBullets, 'left')}</ul>
      </div>
      <div class="kryo-sec-cmp__col${highlight ? ' kryo-sec-cmp__col--hero' : ''}">
        <p class="kryo-sec-cmp__col-label">${escapeHtml(props.rightLabel)}</p>
        <ul class="kryo-sec-cmp__list">${renderBullets(props.rightBullets, 'right')}</ul>
      </div>
    </div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-cmp { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-cmp__headline {
  font-size: clamp(2rem, 4vw, 3rem); line-height: 1.08; letter-spacing: -0.02em;
  font-weight: 700; margin: 0 0 56px 0; max-width: 22ch;
}
.kryo-sec-cmp__grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.kryo-sec-cmp__col {
  border: 1px solid var(--kryo-line); border-radius: var(--kryo-radius);
  padding: 32px; min-height: 280px; background: rgba(255,255,255,0.02);
}
.kryo-sec-cmp__col--muted { opacity: 0.72; }
.kryo-sec-cmp__col--hero {
  background: linear-gradient(180deg, rgba(76,201,240,0.08), rgba(76,201,240,0.02));
  border-color: rgba(76,201,240,0.35);
}
.kryo-sec-cmp__col-label {
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--kryo-muted); margin: 0 0 24px 0; font-weight: 600;
}
.kryo-sec-cmp__col--hero .kryo-sec-cmp__col-label { color: var(--kryo-accent); }
.kryo-sec-cmp__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
.kryo-sec-cmp__bullet { display: flex; align-items: flex-start; gap: 12px; font-size: 16px; line-height: 1.45; }
.kryo-sec-cmp__icon {
  flex-shrink: 0; width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px;
  background: rgba(255,255,255,0.06); color: var(--kryo-muted);
}
.kryo-sec-cmp__bullet--right .kryo-sec-cmp__icon {
  background: rgba(76,201,240,0.18); color: var(--kryo-accent);
}
@media (max-width: 720px) {
  .kryo-sec-cmp { padding: 64px 0; }
  .kryo-sec-cmp__grid { grid-template-columns: 1fr; }
  .kryo-sec-cmp__col { min-height: 0; padding: 24px; }
}
`.trim();

  return { html, css };
}
