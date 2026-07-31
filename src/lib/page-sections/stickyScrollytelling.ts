// Sticky scrollytelling — fixed media + scrolling text panels (Apple "what's inside" pattern).
// Pure CSS via position: sticky + animation-timeline: view() for panel reveals.
// Image stays anchored on the right while text panels scroll past on the left.

import type { StickyScrollytellingProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderStickyScrollytelling(props: StickyScrollytellingProps): SectionOutput {
  const eyebrow = props.eyebrow;
  const headline = props.headline;
  const heroMediaUrl = props.hero_media_url;
  const heroAlt = props.hero_media_alt ?? '';
  const heroIsVideo = props.hero_media_is_video ?? false;
  const panels = props.panels ?? [];
  const mediaPosition = props.media_position ?? 'right'; // 'right' | 'left'

  const heroMedia = heroIsVideo
    ? `<video class="kryo-sec-sticky__media" autoplay muted loop playsinline preload="metadata"><source src="${escapeHtml(heroMediaUrl)}" type="video/mp4"></video>`
    : `<img class="kryo-sec-sticky__media" src="${escapeHtml(heroMediaUrl)}" alt="${escapeHtml(heroAlt)}" loading="lazy">`;

  const panelHtml = panels
    .map((panel) => `
<div class="kryo-sec-sticky__panel">
  ${panel.eyebrow ? `<p class="kryo-sec-sticky__eyebrow">${escapeHtml(panel.eyebrow)}</p>` : ''}
  ${panel.headline ? `<h3 class="kryo-sec-sticky__panel-headline">${escapeHtml(panel.headline)}</h3>` : ''}
  ${panel.body ? `<p class="kryo-sec-sticky__body">${escapeHtml(panel.body)}</p>` : ''}
  ${panel.metric_value ? `<p class="kryo-sec-sticky__metric"><span class="kryo-sec-sticky__metric-num">${escapeHtml(panel.metric_value)}</span><span class="kryo-sec-sticky__metric-label">${escapeHtml(panel.metric_label ?? '')}</span></p>` : ''}
</div>`.trim())
    .join('');

  const html = `
<section class="kryo-sec-sticky kryo-sec-sticky--media-${mediaPosition}" data-section="sticky_scrollytelling">
  <div class="kryo-container">
    <div class="kryo-sec-sticky__intro">
      ${eyebrow ? `<p class="kryo-sec-sticky__intro-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      ${headline ? `<h2 class="kryo-sec-sticky__intro-headline">${escapeHtml(headline)}</h2>` : ''}
    </div>
    <div class="kryo-sec-sticky__grid">
      <div class="kryo-sec-sticky__media-col">
        <div class="kryo-sec-sticky__media-frame">
          ${heroMedia}
        </div>
      </div>
      <div class="kryo-sec-sticky__panels-col">
        ${panelHtml}
      </div>
    </div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-sticky { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-sticky__intro { max-width: 720px; margin: 0 0 56px 0; }
.kryo-sec-sticky__intro-eyebrow { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); margin: 0 0 12px 0; }
.kryo-sec-sticky__intro-headline { font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.08; margin: 0; max-width: 24ch; }
.kryo-sec-sticky__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: start; }
.kryo-sec-sticky--media-left .kryo-sec-sticky__media-col { order: -1; }
.kryo-sec-sticky__media-col { position: relative; }
.kryo-sec-sticky__media-frame {
  position: sticky;
  top: 80px;
  border-radius: 18px;
  overflow: hidden;
  aspect-ratio: 4/5;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--kryo-line);
}
.kryo-sec-sticky__media { width: 100%; height: 100%; object-fit: cover; display: block; }
.kryo-sec-sticky__panels-col { display: flex; flex-direction: column; gap: 80px; }
.kryo-sec-sticky__panel {
  display: flex; flex-direction: column; gap: 12px;
  min-height: 50vh; justify-content: center;
  opacity: 1;
  animation: kryo-sticky-panel-rise 800ms ease both;
  animation-timeline: view();
  animation-range: cover 0% cover 35%;
}
.kryo-sec-sticky__eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); margin: 0; }
.kryo-sec-sticky__panel-headline { font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; margin: 0; color: var(--kryo-fg); max-width: 18ch; }
.kryo-sec-sticky__body { font-size: 1rem; line-height: 1.6; margin: 0; color: var(--kryo-muted); max-width: 36ch; }
.kryo-sec-sticky__metric { margin: 8px 0 0 0; display: flex; align-items: baseline; gap: 12px; }
.kryo-sec-sticky__metric-num { font-size: clamp(2.4rem, 5vw, 4rem); font-weight: 700; letter-spacing: -0.03em; color: var(--kryo-fg); }
.kryo-sec-sticky__metric-label { font-size: 13px; color: var(--kryo-muted); }
@keyframes kryo-sticky-panel-rise {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .kryo-sec-sticky__panel { animation: none !important; opacity: 1 !important; transform: none !important; }
}
@media (max-width: 900px) {
  .kryo-sec-sticky { padding: 64px 0; }
  .kryo-sec-sticky__grid { grid-template-columns: 1fr; gap: 32px; }
  .kryo-sec-sticky__media-frame { position: relative; top: 0; aspect-ratio: 16/10; }
  .kryo-sec-sticky__panel { min-height: auto; gap: 8px; }
  .kryo-sec-sticky__panels-col { gap: 40px; }
}
`.trim();

  return { html, css };
}
