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
.kryo-sec-hero--tall { min-height: 88vh; }
.kryo-sec-hero--standard { min-height: 64vh; }
.kryo-sec-hero__media-wrap { position: absolute; inset: 0; z-index: -1; }
.kryo-sec-hero__media { width: 100%; height: 100%; object-fit: cover; }
.kryo-sec-hero__scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%);
}
.kryo-sec-hero__content {
  display: flex; flex-direction: column; gap: 18px;
  min-height: inherit; justify-content: flex-end; padding-top: 80px; padding-bottom: 64px;
}
.kryo-sec-hero__eyebrow { color: rgba(255,255,255,0.78); margin: 0; }
.kryo-sec-hero__headline {
  font-size: clamp(2.4rem, 5.5vw, 4.5rem);
  line-height: 1.02; letter-spacing: -0.02em; font-weight: 700; margin: 0;
  max-width: 18ch;
}
.kryo-sec-hero__sub {
  font-size: clamp(1rem, 1.4vw, 1.18rem);
  color: rgba(255,255,255,0.82); max-width: 56ch; margin: 4px 0 0 0;
}
.kryo-sec-hero__badges { list-style: none; padding: 0; margin: 8px 0 0 0; display: flex; flex-wrap: wrap; gap: 12px 22px; }
.kryo-sec-hero__badges li { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: rgba(255,255,255,0.85); }
.kryo-sec-hero__badge-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 999px;
  background: rgba(255,255,255,0.12); color: var(--kryo-fg);
}
.kryo-sec-hero__cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
@media (max-width: 640px) {
  .kryo-sec-hero--tall { min-height: 78vh; }
  .kryo-sec-hero__content { padding-bottom: 96px; }
}
`.trim();

  return { html, css };
}
