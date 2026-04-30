// /dev/section-preview — visual QA route for the page-sections library.
// Renders a representative BodyHtmlSpec (all 10 sections) inside the local Next.js dev server
// so Tom can eyeball each section before shipping.
// Not deployed-facing: this lives under /dev so it's clear it's internal tooling.

import { composeBodyHtml } from '@/lib/page-composer';
import type { BodyHtmlSpec } from '@/lib/page-sections';

const KRYO_HERO = 'https://everestlabs.co/cdn/shop/files/Side_angle_1.webp?v=1771837613&width=1920';

const sampleSpec: BodyHtmlSpec = {
  sections: [
    {
      type: 'hero_video',
      props: {
        eyebrow: 'KRYO V4 · Limited March allocation',
        headline: 'A 1°C cold plunge inside your shower.',
        subheadline:
          'Compression-cooled water on demand. No ice, no industrial tub, no installation. Engineered to fit a 60×60 cm bathroom footprint.',
        posterUrl: KRYO_HERO,
        ctaText: 'Reserve a unit',
        ctaHref: '#order',
        badges: ['Ships globally', 'AED 3,990 starting', '30-day performance guarantee'],
        height: 'tall',
      },
    },
    {
      type: 'metrics_scroll',
      props: {
        headline: 'The performance you build with sub-2-minute exposure',
        metrics: [
          { value: '1°C', label: 'Water temperature', sub: 'Cold-shock-tier without ice' },
          { value: '37%', label: 'Lower morning cortisol', sub: 'Søberg et al., 2021' },
          { value: '250%', label: 'Dopamine baseline lift', sub: 'Šrámek et al., 2000' },
        ],
      },
    },
    {
      type: 'comparison_split',
      props: {
        headline: 'KRYO vs. the AED 18,000 way.',
        leftLabel: 'Industrial cold tub',
        leftBullets: [
          'Plumbed install, dedicated room',
          'AED 18,000+ hardware',
          '30-min temperature recovery',
          'Daily ice top-up or chiller maintenance',
        ],
        rightLabel: 'KRYO',
        rightBullets: [
          'Drops into a standard shower',
          'AED 3,990 start, 4 × 997.50 plan',
          '90-second readiness',
          'Sealed Cryo-Engine, zero maintenance',
        ],
      },
    },
    {
      type: 'cryo_engine_deep_dive',
      props: {
        headline: 'A vapor-compression Cryo-Engine, sized for a bathroom.',
        diagramUrl: KRYO_HERO,
        rows: [
          { label: 'Cooling capacity', value: '1,200 W continuous' },
          { label: 'Min water temp', value: '1°C ± 0.5' },
          { label: 'Footprint', value: '60 × 60 × 110 cm' },
          { label: 'Power draw', value: '230 V · 8 A peak' },
          { label: 'Refrigerant', value: 'R290 (low-GWP)' },
        ],
        caption: 'Cutaway: cold-side heat exchanger and 24-V diaphragm pump assembly.',
      },
    },
    {
      type: 'review_aggregate',
      props: {
        productName: 'KRYO Cold Plunge Shower',
        ratingValue: 4.78,
        reviewCount: 312,
        reviews: [
          { author: 'Mohammed A., Dubai', rating: 5, text: 'I expected ice baths to be miserable. KRYO turns it into a 90-second ritual that actually fits my morning.', date: '2026-03-08' },
          { author: 'Layla S., Abu Dhabi', rating: 5, text: 'Bought it because of the design. Kept it because the post-plunge focus is real.', date: '2026-02-22' },
          { author: 'Ahmed R., Riyadh', rating: 5, text: 'Cheaper than my last gym membership and I use it twice a day.', date: '2026-02-12' },
        ],
      },
    },
    {
      type: 'founder_quote',
      props: {
        name: 'Tom Brookman',
        role: 'Founder, Everest Labs',
        photoUrl: KRYO_HERO,
        quote:
          'I tried the industrial setups. They cost what a car costs and live in a garage. KRYO is the version that fits a real life.',
      },
    },
    {
      type: 'finance_banner',
      props: {
        fullPrice: 'AED 3,990',
        installmentPrice: 'AED 997.50',
        installmentCount: 4,
        providers: ['Tabby', 'Tamara', 'Postpay'],
        riskCopy: '0% APR · 30-day performance guarantee',
      },
    },
    {
      type: 'risk_reversal',
      props: {
        badge: '30-day performance guarantee',
        headline: 'Cold-plunge for 30 days. If your mornings don\'t shift, ship it back.',
        body:
          'Every KRYO ships with a 30-day performance window. Use it daily. If your sleep, focus, or recovery scores don\'t move, return for a full refund. We pay return shipping.',
        bullets: [
          'Full refund inside 30 days, no friction',
          'Free pickup from anywhere in the GCC',
          '2-year warranty on the Cryo-Engine assembly',
        ],
      },
    },
    {
      type: 'faq_with_schema',
      props: {
        headline: 'Frequently asked',
        items: [
          { question: 'Will it fit a Dubai apartment shower?', answer: 'Yes. KRYO is engineered to a 60×60 cm footprint and the standalone column is 110 cm tall. It fits inside a typical UAE apartment shower without modification.' },
          { question: 'Does it need plumbing changes?', answer: 'No. KRYO uses your existing water inlet and drain. The Cryo-Engine is sealed; no refilling, no ice.' },
          { question: 'Is 1°C safe for daily use?', answer: '1°C is the floor; most users run sessions at 4–8°C. The display shows live water temperature so you control the dose.' },
          { question: 'How soon can I get it?', answer: 'March allocation is 50 units shipping globally. Reservation deposits are fully refundable up to dispatch.' },
        ],
      },
    },
    {
      type: 'sticky_cta_bar',
      props: {
        productName: 'KRYO V4',
        price: 'AED 3,990',
        pricePer: 'or 4 × 997.50',
        ctaText: 'Reserve unit',
        ctaHref: '#order',
        shipNote: 'Ships March allocation · 16 / 50 left',
      },
    },
  ],
};

export default function SectionPreviewPage() {
  const composed = composeBodyHtml(sampleSpec);

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: '#000',
          color: '#fff',
          padding: '8px 16px',
          fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
          borderBottom: '1px solid #222',
          display: 'flex',
          gap: 16,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>/dev/section-preview · {composed.sectionCount} sections · {composed.schemaCount} JSON-LD blocks · {(composed.byteLength / 1024).toFixed(1)} KB</span>
        <span style={{ opacity: 0.5 }}>internal QA — not for production</span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: composed.body_html }} />
    </div>
  );
}
