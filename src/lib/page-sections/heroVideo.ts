// Hero video section — Eight-Sleep-tier hero with full-bleed video (falls back to poster image).
// Reference patterns: eightsleep.com Pod 4 hero, allbirds product hero, Whoop landing.
// Pure HTML + scoped CSS. No JS.

import type { HeroVideoProps, SectionOutput } from './types';
import { escapeHtml, escapeAttr, strokeIcon, ICONS } from './_helpers';

export function renderHeroVideo(props: HeroVideoProps): SectionOutput {
  const eyebrow = props.eyebrow?.trim();
  const sub = props.subheadline?.trim();
  const badges = props.badges ?? [];
  const isTall = props.height !== 'standard';

  const mediaTag = props.videoUrl
    ? `<video class="kryo-sec-hero__media" autoplay muted loop playsinline poster="${escapeAttr(props.posterUrl)}">
        <source src="${escapeAttr(props.videoUrl)}" type="video/mp4">
      </video>`
    : `<img class="kryo-sec-hero__media" src="${escapeAttr(props.posterUrl)}" alt="${escapeAttr(props.headline)}" loading="eager" fetchpriority="high">`;

  const badgesHtml =
    badges.length > 0
      ? `<ul class="kryo-sec-hero__badges">${badges
          .map(
            (b) =>
              `<li><span class="kryo-sec-hero__badge-dot">${strokeIcon(ICONS.check, 14, 2.5)}</span>${escapeHtml(b)}</li>`,
          )
          .join('')}</ul>`
      : '';

  const html = `
<section class="kryo-sec-hero kryo-sec-hero--${isTall ? 'tall' : 'standard'}" data-section="hero_video">
  <div class="kryo-sec-hero__media-wrap">${mediaTag}<div class="kryo-sec-hero__scrim"></div></div>
  <div class="kryo-container kryo-sec-hero__content">
    ${eyebrow ? `<p class="kryo-eyebrow kryo-sec-hero__eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
    <h1 class="kryo-sec-hero__headline">${escapeHtml(props.headline)}</h1>
    ${sub ? `<p class="kryo-sec-hero__sub">${escapeHtml(sub)}</p>` : ''}
    ${badgesHtml}
    <div class="kryo-sec-hero__cta-row">
      <a href="${escapeAttr(props.ctaHref)}" class="kryo-cta kryo-sec-hero__cta">${escapeHtml(props.ctaText)} ${strokeIcon(ICONS.arrowRight, 18)}</a>
    </div>
  </div>
</section>`.trim();

  const css = `
.kryo-sec-hero { position: relative; overflow: hidden; isolation: isolate; }
.kryo-sec-hero--tall { min-height: 92vh; }
.kryo-sec-hero--standard { min-height: 70vh; }
.kryo-sec-hero__media-wrap { position: absolute; inset: 0; z-index: -1; }
.kryo-sec-hero__media {
  width: 100%; height: 100%; object-fit: cover;
  transform: scale(1.04);
  transition: transform 1200ms var(--kryo-ease);
}
.kryo-sec-hero:hover .kryo-sec-hero__media { transform: scale(1.0); }
.kryo-sec-hero__scrim {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse at 30% 60%, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.40) 60%, rgba(0,0,0,0.70) 100%),
    linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.60) 55%, rgba(0,0,0,0.92) 100%);
}
.kryo-sec-hero__content {
  display: flex; flex-direction: column; gap: 22px;
  min-height: inherit; justify-content: flex-end;
  padding-top: clamp(80px, 14vh, 160px);
  padding-bottom: clamp(48px, 8vh, 96px);
  max-width: 1100px;
}
.kryo-sec-hero__eyebrow { color: rgba(255,255,255,0.85); margin: 0; }
.kryo-sec-hero__headline {
  font-size: clamp(2.8rem, 7.5vw, 6.5rem);
  line-height: 0.98;
  letter-spacing: -0.035em;
  font-weight: 700;
  margin: 0;
  max-width: 16ch;
  text-wrap: balance;
}
.kryo-sec-hero__sub {
  font-size: clamp(1.05rem, 1.6vw, 1.4rem);
  line-height: 1.4;
  color: rgba(255,255,255,0.86);
  max-width: 56ch;
  margin: 8px 0 0 0;
  text-wrap: pretty;
}
.kryo-sec-hero__badges {
  list-style: none; padding: 0; margin: 12px 0 0 0;
  display: flex; flex-wrap: wrap; gap: 14px 28px;
}
.kryo-sec-hero__badges li {
  display: inline-flex; align-items: center; gap: 10px;
  font-size: 14px; font-weight: 500;
  color: rgba(255,255,255,0.92);
  letter-spacing: -0.005em;
}
.kryo-sec-hero__badge-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 999px;
  background: rgba(255,255,255,0.14);
  color: var(--kryo-fg);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.kryo-sec-hero__cta-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
.kryo-sec-hero__cta {
  padding: 22px 40px;
  font-size: 17px;
  font-weight: 600;
}
@supports (animation-timeline: view()) {
  .kryo-sec-hero__eyebrow,
  .kryo-sec-hero__headline,
  .kryo-sec-hero__sub,
  .kryo-sec-hero__badges,
  .kryo-sec-hero__cta-row {
    animation: kryoHeroIn 1.2s var(--kryo-ease) both;
  }
  .kryo-sec-hero__headline { animation-delay: 80ms; }
  .kryo-sec-hero__sub { animation-delay: 200ms; }
  .kryo-sec-hero__badges { animation-delay: 320ms; }
  .kryo-sec-hero__cta-row { animation-delay: 440ms; }
  @keyframes kryoHeroIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}
@media (max-width: 640px) {
  .kryo-sec-hero--tall { min-height: 82vh; }
  .kryo-sec-hero__content { padding-bottom: 96px; gap: 18px; }
  .kryo-sec-hero__headline { letter-spacing: -0.028em; }
}
`.trim();

  return { html, css };
}
