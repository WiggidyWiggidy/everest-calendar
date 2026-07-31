// Scroll-reveal metrics — Apple-spec-page-style numeric reveals.
// Pure CSS via @property (registered custom properties for numeric tweening) +
// animation-timeline: view() (scroll-driven keyframes).
// Falls back gracefully on browsers without @property/animation-timeline (numbers just show).

import type { ScrollRevealMetricsProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderScrollRevealMetrics(props: ScrollRevealMetricsProps): SectionOutput {
  const eyebrow = props.eyebrow;
  const headline = props.headline;
  const layout = props.layout ?? 'horizontal'; // 'horizontal' | 'stacked'

  const cardsHtml = (props.metrics ?? [])
    .map((m, i) => {
      const target = m.numeric_target ?? null;
      // Determine if we can animate the count: numeric_target is required.
      const fromValue = 0;
      const toValue = target;
      const decimals = m.decimals ?? 0;
      const useAnimatedCounter = toValue !== null && toValue !== undefined;
      const valueDisplay = useAnimatedCounter
        ? `<span class="kryo-sec-srm__num" style="--kryo-srm-from:${fromValue}; --kryo-srm-to:${toValue}; --kryo-srm-decimals:${decimals};" data-target="${toValue}">${escapeHtml(m.value_prefix ?? '')}<span class="kryo-sec-srm__num-tween">${toValue}</span>${escapeHtml(m.value_suffix ?? '')}</span>`
        : `<span class="kryo-sec-srm__num">${escapeHtml(m.value)}</span>`;

      return `
<div class="kryo-sec-srm__card" style="--kryo-srm-delay:${i * 80}ms;">
  <p class="kryo-sec-srm__value">${valueDisplay}</p>
  <p class="kryo-sec-srm__label">${escapeHtml(m.label)}</p>
  ${m.sub ? `<p class="kryo-sec-srm__sub">${escapeHtml(m.sub)}</p>` : ''}
</div>`.trim();
    })
    .join('');

  const html = `
<section class="kryo-sec-srm kryo-sec-srm--${layout}" data-section="scroll_reveal_metrics">
  <div class="kryo-container">
    <div class="kryo-sec-srm__intro">
      ${eyebrow ? `<p class="kryo-sec-srm__eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      ${headline ? `<h2 class="kryo-sec-srm__headline">${escapeHtml(headline)}</h2>` : ''}
    </div>
    <div class="kryo-sec-srm__grid">${cardsHtml}</div>
  </div>
</section>`.trim();

  // @property numeric tween — modern Chrome/Safari support; fallback shows static value.
  const css = `
@property --kryo-srm-counter {
  syntax: '<integer>';
  initial-value: 0;
  inherits: false;
}
.kryo-sec-srm { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-srm__intro { max-width: 720px; margin: 0 0 56px 0; }
.kryo-sec-srm__eyebrow { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--kryo-muted); margin: 0 0 12px 0; }
.kryo-sec-srm__headline { font-size: clamp(1.8rem, 3.6vw, 2.8rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin: 0; max-width: 22ch; }
.kryo-sec-srm__grid {
  display: grid;
  gap: 32px;
}
.kryo-sec-srm--horizontal .kryo-sec-srm__grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.kryo-sec-srm--stacked    .kryo-sec-srm__grid { grid-template-columns: 1fr; max-width: 720px; }
.kryo-sec-srm__card {
  padding: 32px 24px;
  border-top: 1px solid var(--kryo-line);
  display: flex; flex-direction: column; gap: 8px;
  opacity: 0; transform: translateY(16px);
  animation: kryo-srm-rise 700ms ease both;
  animation-delay: var(--kryo-srm-delay, 0ms);
  animation-timeline: view();
  animation-range: cover 0% cover 35%;
}
.kryo-sec-srm__value {
  margin: 0; font-size: clamp(2.6rem, 5.2vw, 4.2rem); font-weight: 700; letter-spacing: -0.03em; line-height: 0.95;
  background: linear-gradient(180deg, var(--kryo-fg), rgba(255,255,255,0.6));
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  display: inline-flex; align-items: baseline;
}
.kryo-sec-srm__num { display: inline-flex; align-items: baseline; gap: 0; }
/* Animated counter via @property — counts from 0 to numeric_target on scroll into view */
.kryo-sec-srm__num-tween {
  --kryo-srm-counter: var(--kryo-srm-from, 0);
  animation: kryo-srm-count 1400ms cubic-bezier(0.2, 0.8, 0.3, 1) both;
  animation-timeline: view();
  animation-range: cover 0% cover 30%;
  counter-reset: krm var(--kryo-srm-counter);
}
.kryo-sec-srm__num-tween::after {
  content: counter(krm);
}
.kryo-sec-srm__num-tween {
  /* Hide the original target text, replaced by counter. Fallback shows the target value. */
  font-size: 0;
}
.kryo-sec-srm__num-tween::after {
  font-size: 1rem;
}
.kryo-sec-srm__label { margin: 0; font-size: 14px; color: var(--kryo-fg); font-weight: 500; }
.kryo-sec-srm__sub { margin: 0; font-size: 13px; color: var(--kryo-muted); }
@keyframes kryo-srm-rise {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kryo-srm-count {
  from { --kryo-srm-counter: var(--kryo-srm-from, 0); }
  to   { --kryo-srm-counter: var(--kryo-srm-to, 100); }
}
@media (prefers-reduced-motion: reduce) {
  .kryo-sec-srm__card, .kryo-sec-srm__num-tween {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .kryo-sec-srm__num-tween { font-size: 1em; }
  .kryo-sec-srm__num-tween::after { content: ''; }
}
@media (max-width: 720px) { .kryo-sec-srm { padding: 64px 0; } }
`.trim();

  return { html, css };
}
