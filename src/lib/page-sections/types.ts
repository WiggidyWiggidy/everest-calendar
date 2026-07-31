// Types for the page-sections library.
//
// Each section is a pure function that takes typed props and returns a SectionOutput
// (html + optional scoped css + optional schema.org JSON-LD fragment).
// The composer joins sections into a single self-contained body_html string suitable
// for Shopify product description / page body_html. No JS — Shopify strips <script>.

export interface SectionOutput {
  html: string;
  css?: string;
  schemaJsonLd?: Record<string, unknown>;
}

export type PremiumSectionType =
  | 'hero_video'
  | 'sticky_cta_bar'
  | 'comparison_split'
  | 'founder_quote'
  | 'review_aggregate'
  | 'finance_banner'
  | 'faq_with_schema'
  | 'metrics_scroll'
  | 'risk_reversal'
  | 'cryo_engine_deep_dive'
  | 'press_logos'
  | 'lifestyle_strip'
  | 'marquee_band'
  | 'bento_grid'
  | 'sticky_scrollytelling'
  | 'comparison_slider'
  | 'scroll_reveal_metrics';

export interface HeroVideoProps {
  eyebrow?: string;
  headline: string;
  subheadline?: string;
  posterUrl: string;
  videoUrl?: string;
  ctaText: string;
  ctaHref: string;
  badges?: string[];
  height?: 'tall' | 'standard';
}

export interface StickyCtaBarProps {
  productName: string;
  price: string;
  pricePer?: string;
  ctaText: string;
  ctaHref: string;
  shipNote?: string;
}

export interface ComparisonSplitProps {
  headline?: string;
  leftLabel: string;
  leftBullets: string[];
  rightLabel: string;
  rightBullets: string[];
  rightHighlight?: boolean;
}

export interface FounderQuoteProps {
  name: string;
  role: string;
  photoUrl: string;
  quote: string;
  signatureUrl?: string;
}

export interface ReviewAggregateProps {
  ratingValue: number;
  reviewCount: number;
  productName: string;
  reviews: { author: string; rating: number; text: string; date?: string }[];
}

export interface FinanceBannerProps {
  fullPrice: string;
  installmentPrice: string;
  installmentCount: number;
  providers?: string[];
  riskCopy?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}
export interface FaqWithSchemaProps {
  headline?: string;
  items: FaqItem[];
}

export interface MetricsScrollProps {
  headline?: string;
  metrics: { value: string; label: string; sub?: string }[];
}

export interface RiskReversalProps {
  badge?: string;
  headline: string;
  body: string;
  bullets?: string[];
}

export interface CryoEngineDeepDiveProps {
  headline: string;
  diagramUrl: string;
  rows: { label: string; value: string }[];
  caption?: string;
}

export interface PressLogosProps {
  eyebrow?: string;
  logos: Array<{ label: string; imageUrl?: string }>;
}

export interface LifestyleStripProps {
  headline?: string;
  sub?: string;
  layout?: '3up' | '2up' | 'full';
  images: Array<{ url: string; alt?: string; caption?: string }>;
}

// ── New premium-quality sections (CSS-only, body_html-safe) ──

export interface MarqueeBandProps {
  items: string[];
  speed?: number;          // seconds per loop, default 40
  direction?: 'left' | 'right';
  variant?: 'dark' | 'light' | 'accent';
  separator?: string;      // default '·'
  aria_label?: string;
}

export interface BentoCardProps {
  size?: 'large' | 'medium' | 'small';
  eyebrow?: string;
  headline?: string;
  body?: string;
  metric_value?: string;
  metric_label?: string;
  accent_image?: string;
  accent_alt?: string;
  cta_text?: string;
  cta_href?: string;
}

export interface BentoGridProps {
  eyebrow?: string;
  headline?: string;
  sub?: string;
  cards: BentoCardProps[];   // up to 5 (hero + 2 medium + 2 small)
}

export interface StickyScrollytellingPanel {
  eyebrow?: string;
  headline?: string;
  body?: string;
  metric_value?: string;
  metric_label?: string;
}

export interface StickyScrollytellingProps {
  eyebrow?: string;
  headline?: string;
  hero_media_url: string;
  hero_media_alt?: string;
  hero_media_is_video?: boolean;
  panels: StickyScrollytellingPanel[];
  media_position?: 'left' | 'right';
}

export interface ComparisonSliderProps {
  eyebrow?: string;
  headline?: string;
  sub?: string;
  before_image_url: string;
  before_alt?: string;
  before_label?: string;
  after_image_url: string;
  after_alt?: string;
  after_label?: string;
  initial_position?: number;   // 0-100, default 50
}

export interface ScrollRevealMetric {
  value: string;                  // displayed string ('1°C', 'AED 3,990')
  label: string;
  sub?: string;
  numeric_target?: number;        // optional: animate count from 0 → this number
  decimals?: number;              // for numeric_target rounding
  value_prefix?: string;          // e.g. 'AED ' before counter
  value_suffix?: string;          // e.g. '°C' after counter
}

export interface ScrollRevealMetricsProps {
  eyebrow?: string;
  headline?: string;
  layout?: 'horizontal' | 'stacked';
  metrics: ScrollRevealMetric[];
}

export type SectionSpec =
  | { type: 'hero_video'; props: HeroVideoProps }
  | { type: 'sticky_cta_bar'; props: StickyCtaBarProps }
  | { type: 'comparison_split'; props: ComparisonSplitProps }
  | { type: 'founder_quote'; props: FounderQuoteProps }
  | { type: 'review_aggregate'; props: ReviewAggregateProps }
  | { type: 'finance_banner'; props: FinanceBannerProps }
  | { type: 'faq_with_schema'; props: FaqWithSchemaProps }
  | { type: 'metrics_scroll'; props: MetricsScrollProps }
  | { type: 'risk_reversal'; props: RiskReversalProps }
  | { type: 'cryo_engine_deep_dive'; props: CryoEngineDeepDiveProps }
  | { type: 'press_logos'; props: PressLogosProps }
  | { type: 'lifestyle_strip'; props: LifestyleStripProps }
  | { type: 'marquee_band'; props: MarqueeBandProps }
  | { type: 'bento_grid'; props: BentoGridProps }
  | { type: 'sticky_scrollytelling'; props: StickyScrollytellingProps }
  | { type: 'comparison_slider'; props: ComparisonSliderProps }
  | { type: 'scroll_reveal_metrics'; props: ScrollRevealMetricsProps };

export interface BodyHtmlSpec {
  sections: SectionSpec[];
  brand?: {
    primaryColor?: string;
    fontFamily?: string;
  };
}
