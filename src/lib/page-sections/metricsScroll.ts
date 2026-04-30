// Metrics block — large numbers with labels. Optional scroll-driven count-up via animation-timeline (graceful fallback).
// Reference: eightsleep.com HRV/REM metrics, Whoop "32% more REM".
// Pure HTML + scoped CSS, no JS.

import type { MetricsScrollProps, SectionOutput } from './types';
import { escapeHtml } from './_helpers';

export function renderMetricsScroll(props: MetricsScrollProps): SectionOutput {
  const headline = props.headline;
  const cards = props.metrics
    .map(
      (m) => `<div class="kryo-sec-metrics__card">
  <p class="kryo-sec-metrics__value">${escapeHtml(m.value)}</p>
  <p class="kryo-sec-metrics__label">${escapeHtml(m.label)}</p>
  ${m.sub ? `<p class="kryo-sec-metrics__sub">${escapeHtml(m.sub)}</p>` : ''}
</div>`,
    )
    .join('');

  const html = `
<section class="kryo-sec-metrics" data-section="metrics_scroll">
  <div class="kryo-container">
    ${headline ? `<h2 class="kryo-sec-metrics__headline">${escapeHtml(headline)}</h2>` : ''}
    <div class="kryo-sec-metrics__grid">${cards}</div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-metrics { padding: 96px 0; background: var(--kryo-bg); }
.kryo-sec-metrics__headline { font-size: clamp(1.8rem, 3.6vw, 2.6rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 56px 0; max-width: 22ch; }
.kryo-sec-metrics__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
.kryo-sec-metrics__card {
  padding: 32px 24px; border-top: 1px solid var(--kryo-line);
  display: flex; flex-direction: column; gap: 8px;
}
.kryo-sec-metrics__value {
  margin: 0; font-size: clamp(2.6rem, 5vw, 4rem); font-weight: 700; letter-spacing: -0.03em; line-height: 0.95;
  background: linear-gradient(180deg, var(--kryo-fg), rgba(255,255,255,0.6));
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  animation: kryo-metric-rise 800ms ease both;
  animation-timeline: view();
  animation-range: cover 0% cover 30%;
}
.kryo-sec-metrics__label { margin: 0; font-size: 14px; color: var(--kryo-fg); font-weight: 500; }
.kryo-sec-metrics__sub { margin: 0; font-size: 13px; color: var(--kryo-muted); }
@keyframes kryo-metric-rise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 720px) { .kryo-sec-metrics { padding: 64px 0; } }
`.trim();

  return { html, css };
}
