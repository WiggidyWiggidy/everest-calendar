// Barrel — all section renderers + types.

export type {
  SectionOutput,
  PremiumSectionType,
  SectionSpec,
  BodyHtmlSpec,
  HeroVideoProps,
  StickyCtaBarProps,
  ComparisonSplitProps,
  FounderQuoteProps,
  ReviewAggregateProps,
  FinanceBannerProps,
  FaqWithSchemaProps,
  FaqItem,
  MetricsScrollProps,
  RiskReversalProps,
  CryoEngineDeepDiveProps,
  PressLogosProps,
  LifestyleStripProps,
} from './types';

export { BASE_CSS } from './_helpers';

export { renderHeroVideo } from './heroVideo';
export { renderStickyCtaBar } from './stickyCtaBar';
export { renderComparisonSplit } from './comparisonSplit';
export { renderFounderQuote } from './founderQuote';
export { renderReviewAggregate } from './reviewAggregate';
export { renderFinanceBanner } from './financeBanner';
export { renderFaqWithSchema } from './faqWithSchema';
export { renderMetricsScroll } from './metricsScroll';
export { renderRiskReversal } from './riskReversal';
export { renderCryoEngineDeepDive } from './cryoEngineDeepDive';
export { renderPressLogos } from './pressLogos';
export { renderLifestyleStrip } from './lifestyleStrip';

import type { SectionSpec, SectionOutput } from './types';
import { renderHeroVideo } from './heroVideo';
import { renderStickyCtaBar } from './stickyCtaBar';
import { renderComparisonSplit } from './comparisonSplit';
import { renderFounderQuote } from './founderQuote';
import { renderReviewAggregate } from './reviewAggregate';
import { renderFinanceBanner } from './financeBanner';
import { renderFaqWithSchema } from './faqWithSchema';
import { renderMetricsScroll } from './metricsScroll';
import { renderRiskReversal } from './riskReversal';
import { renderCryoEngineDeepDive } from './cryoEngineDeepDive';
import { renderPressLogos } from './pressLogos';
import { renderLifestyleStrip } from './lifestyleStrip';

// Dispatcher: render a section by spec.
export function renderSection(spec: SectionSpec): SectionOutput {
  switch (spec.type) {
    case 'hero_video':            return renderHeroVideo(spec.props);
    case 'sticky_cta_bar':        return renderStickyCtaBar(spec.props);
    case 'comparison_split':      return renderComparisonSplit(spec.props);
    case 'founder_quote':         return renderFounderQuote(spec.props);
    case 'review_aggregate':      return renderReviewAggregate(spec.props);
    case 'finance_banner':        return renderFinanceBanner(spec.props);
    case 'faq_with_schema':       return renderFaqWithSchema(spec.props);
    case 'metrics_scroll':        return renderMetricsScroll(spec.props);
    case 'risk_reversal':         return renderRiskReversal(spec.props);
    case 'cryo_engine_deep_dive': return renderCryoEngineDeepDive(spec.props);
    case 'press_logos':           return renderPressLogos(spec.props);
    case 'lifestyle_strip':       return renderLifestyleStrip(spec.props);
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown section type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
