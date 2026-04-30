// Cryo-Engine deep-dive — KRYO-specific: technical diagram + spec table + caption.
// Reference: eightsleep.com "How the Pod works", Whoop "How HRV works".
// Pure HTML + scoped CSS.

import type { CryoEngineDeepDiveProps, SectionOutput } from './types';
import { escapeHtml, escapeAttr } from './_helpers';

export function renderCryoEngineDeepDive(props: CryoEngineDeepDiveProps): SectionOutput {
  const rowsHtml = props.rows
    .map(
      (r) =>
        `<div class="kryo-sec-cryo__row"><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`,
    )
    .join('');

  const html = `
<section class="kryo-sec-cryo" data-section="cryo_engine_deep_dive">
  <div class="kryo-container kryo-sec-cryo__inner">
    <div class="kryo-sec-cryo__media">
      <img src="${escapeAttr(props.diagramUrl)}" alt="${escapeAttr(props.headline)}" loading="lazy">
      ${props.caption ? `<p class="kryo-sec-cryo__caption">${escapeHtml(props.caption)}</p>` : ''}
    </div>
    <div class="kryo-sec-cryo__copy">
      <p class="kryo-eyebrow">Cryo-Engine</p>
      <h2 class="kryo-sec-cryo__headline">${escapeHtml(props.headline)}</h2>
      <dl class="kryo-sec-cryo__specs">${rowsHtml}</dl>
    </div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-cryo { padding: 96px 0; background: linear-gradient(180deg, var(--kryo-bg), #050505); }
.kryo-sec-cryo__inner { display: grid; grid-template-columns: 1.1fr 1fr; gap: 56px; align-items: center; }
.kryo-sec-cryo__media { display: flex; flex-direction: column; gap: 12px; }
.kryo-sec-cryo__media img { border-radius: var(--kryo-radius); border: 1px solid var(--kryo-line); }
.kryo-sec-cryo__caption { font-size: 12px; color: var(--kryo-muted); margin: 0; }
.kryo-sec-cryo__headline { font-size: clamp(1.8rem, 3.4vw, 2.6rem); line-height: 1.1; letter-spacing: -0.02em; font-weight: 700; margin: 8px 0 32px 0; }
.kryo-sec-cryo__specs { margin: 0; padding: 0; display: flex; flex-direction: column; }
.kryo-sec-cryo__row {
  display: grid; grid-template-columns: 40% 1fr; gap: 16px;
  padding: 16px 0; border-bottom: 1px solid var(--kryo-line);
}
.kryo-sec-cryo__row:first-child { border-top: 1px solid var(--kryo-line); }
.kryo-sec-cryo__row dt { margin: 0; color: var(--kryo-muted); font-size: 14px; font-weight: 500; }
.kryo-sec-cryo__row dd { margin: 0; color: var(--kryo-fg); font-size: 14px; font-weight: 600; }
@media (max-width: 720px) {
  .kryo-sec-cryo { padding: 64px 0; }
  .kryo-sec-cryo__inner { grid-template-columns: 1fr; gap: 32px; }
}
`.trim();

  return { html, css };
}
