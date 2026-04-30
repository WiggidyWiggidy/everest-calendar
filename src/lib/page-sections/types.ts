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
  | 'cryo_engine_deep_dive';

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
  | { type: 'cryo_engine_deep_dive'; props: CryoEngineDeepDiveProps };

export interface BodyHtmlSpec {
  sections: SectionSpec[];
  brand?: {
    primaryColor?: string;
    fontFamily?: string;
  };
}
