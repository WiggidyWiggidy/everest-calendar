import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PageSection, SectionType } from '@/types';

// ── Section HTML generators ─────────────────────────────────────────────────

function generateHeroHTML(s: PageSection): string {
  return `
  <section class="lp-hero">
    <div class="lp-hero-content">
      <h1 class="lp-h1">${s.headline}</h1>
      <p class="lp-lead">${s.body}</p>
      ${s.cta_text ? `<a href="${s.cta_url || '#'}" class="lp-btn-primary">${s.cta_text}</a>` : ''}
    </div>
    ${s.image_url ? `<div class="lp-hero-img"><img src="${s.image_url}" alt="${s.headline}" loading="eager" /></div>` : ''}
  </section>`;
}

function generateKeyBenefitsHTML(s: PageSection): string {
  const points = s.body.split('\n').filter(Boolean);
  const cards = points.slice(0, 3).map((p, i) => `
    <div class="lp-benefit-card">
      <div class="lp-benefit-num">${String(i + 1).padStart(2, '0')}</div>
      <p>${p.replace(/^[-•]\s*/, '')}</p>
    </div>`).join('');
  return `
  <section class="lp-section lp-benefits">
    <h2 class="lp-h2">${s.headline}</h2>
    <div class="lp-benefits-grid">${cards || `<div class="lp-benefit-card"><p>${s.body}</p></div>`}</div>
  </section>`;
}

function generateHowItWorksHTML(s: PageSection): string {
  const steps = s.body.split('\n').filter(Boolean);
  const stepsHTML = steps.map((step, i) => `
    <div class="lp-step">
      <div class="lp-step-num">${i + 1}</div>
      <div class="lp-step-text">
        <p>${step.replace(/^[\d]+\.\s*/, '')}</p>
      </div>
      ${s.image_url && i === 0 ? `<div class="lp-step-img"><img src="${s.image_url}" alt="Step ${i + 1}" /></div>` : ''}
    </div>`).join('');
  return `
  <section class="lp-section lp-how">
    <h2 class="lp-h2">${s.headline}</h2>
    <div class="lp-steps">${stepsHTML || `<div class="lp-step"><p>${s.body}</p></div>`}</div>
  </section>`;
}

function generateScienceProofHTML(s: PageSection): string {
  const stats = s.body.split('\n').filter(Boolean);
  const statsHTML = stats.slice(0, 3).map(stat => {
    const [num, ...rest] = stat.split(':');
    return `<div class="lp-stat"><span class="lp-stat-num">${num.trim()}</span><span class="lp-stat-label">${rest.join(':').trim() || ''}</span></div>`;
  }).join('');
  return `
  <section class="lp-section lp-science">
    <h2 class="lp-h2 lp-h2-light">${s.headline}</h2>
    <div class="lp-stats-row">${statsHTML || `<div class="lp-stat"><span class="lp-stat-label">${s.body}</span></div>`}</div>
    ${s.cta_text ? `<a href="${s.cta_url || '#'}" class="lp-btn-secondary">${s.cta_text}</a>` : ''}
  </section>`;
}

function generateSocialProofHTML(s: PageSection): string {
  const quotes = s.body.split('\n\n').filter(Boolean);
  const cards = quotes.slice(0, 3).map(q => {
    const [quote, name] = q.split('—');
    return `
    <div class="lp-quote-card">
      <div class="lp-stars">★★★★★</div>
      <p class="lp-quote-text">"${(quote || q).trim()}"</p>
      ${name ? `<p class="lp-quote-name">— ${name.trim()}</p>` : ''}
    </div>`;
  }).join('');
  return `
  <section class="lp-section lp-social-proof">
    <h2 class="lp-h2">${s.headline}</h2>
    <div class="lp-quotes-grid">${cards || `<div class="lp-quote-card"><p>"${s.body}"</p></div>`}</div>
  </section>`;
}

function generateComparisonHTML(s: PageSection): string {
  return `
  <section class="lp-section lp-comparison">
    <h2 class="lp-h2">${s.headline}</h2>
    <p class="lp-body">${s.body}</p>
    <table class="lp-table">
      <thead>
        <tr><th></th><th class="lp-th-highlight">Ice Shower</th><th>Alternatives</th></tr>
      </thead>
      <tbody>
        <tr><td>Recovery time</td><td class="lp-td-highlight">✓ Faster</td><td>Slower</td></tr>
        <tr><td>Cost per session</td><td class="lp-td-highlight">✓ Lower</td><td>Higher</td></tr>
        <tr><td>At-home use</td><td class="lp-td-highlight">✓ Yes</td><td>Limited</td></tr>
        <tr><td>Temperature control</td><td class="lp-td-highlight">✓ Precise</td><td>Variable</td></tr>
      </tbody>
    </table>
    ${s.cta_text ? `<a href="${s.cta_url || '#'}" class="lp-btn-primary">${s.cta_text}</a>` : ''}
  </section>`;
}

function generateFAQHTML(s: PageSection): string {
  const faqs = s.body.split('\n\n').filter(Boolean);
  const items = faqs.map(faq => {
    const [q, ...aParts] = faq.split('\n');
    const a = aParts.join(' ') || q;
    return `
    <details class="lp-faq-item">
      <summary class="lp-faq-q">${q.replace(/^Q:\s*/i, '')}</summary>
      <p class="lp-faq-a">${a.replace(/^A:\s*/i, '')}</p>
    </details>`;
  }).join('');
  return `
  <section class="lp-section lp-faq">
    <h2 class="lp-h2">${s.headline}</h2>
    <div class="lp-faq-list">${items || `<details class="lp-faq-item"><summary>${s.headline}</summary><p>${s.body}</p></details>`}</div>
  </section>`;
}

function generateCTABannerHTML(s: PageSection): string {
  return `
  <section class="lp-cta-banner">
    <h2 class="lp-h2 lp-h2-light">${s.headline}</h2>
    <p class="lp-lead-light">${s.body}</p>
    ${s.cta_text ? `<a href="${s.cta_url || '#'}" class="lp-btn-large">${s.cta_text}</a>` : ''}
  </section>`;
}

function generateSectionHTML(section: PageSection): string {
  const generators: Record<SectionType, (s: PageSection) => string> = {
    hero: generateHeroHTML,
    key_benefits: generateKeyBenefitsHTML,
    how_it_works: generateHowItWorksHTML,
    science_proof: generateScienceProofHTML,
    social_proof: generateSocialProofHTML,
    comparison: generateComparisonHTML,
    faq: generateFAQHTML,
    cta_banner: generateCTABannerHTML,
  };
  return (generators[section.type] ?? generateHeroHTML)(section);
}

const LP_STYLES = `
<style>
  .lp-wrapper { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; max-width: 1200px; margin: 0 auto; }
  .lp-section { padding: 80px 40px; }
  .lp-h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.1; margin: 0 0 24px; letter-spacing: -0.02em; }
  .lp-h2 { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 700; line-height: 1.2; margin: 0 0 32px; letter-spacing: -0.02em; }
  .lp-h2-light { color: #fff; }
  .lp-lead { font-size: 1.25rem; line-height: 1.6; color: #444; margin: 0 0 32px; max-width: 560px; }
  .lp-lead-light { font-size: 1.25rem; line-height: 1.6; color: rgba(255,255,255,0.85); margin: 0 0 32px; }
  .lp-body { font-size: 1rem; line-height: 1.7; color: #555; }
  .lp-btn-primary { display: inline-block; background: #111; color: #fff; padding: 16px 36px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: background 0.2s; }
  .lp-btn-primary:hover { background: #333; }
  .lp-btn-secondary { display: inline-block; background: #fff; color: #111; padding: 14px 32px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 1rem; margin-top: 32px; }
  .lp-btn-large { display: inline-block; background: #fff; color: #111; padding: 20px 48px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 1.1rem; }
  /* Hero */
  .lp-hero { display: flex; align-items: center; gap: 64px; padding: 100px 40px; }
  .lp-hero-content { flex: 1; }
  .lp-hero-img { flex: 1; } .lp-hero-img img { width: 100%; border-radius: 8px; }
  /* Benefits */
  .lp-benefits-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 32px; }
  .lp-benefit-card { padding: 32px; border: 1px solid #e5e5e5; border-radius: 8px; }
  .lp-benefit-num { font-size: 2.5rem; font-weight: 800; color: #e5e5e5; margin-bottom: 16px; }
  /* Steps */
  .lp-steps { display: flex; flex-direction: column; gap: 48px; }
  .lp-step { display: flex; align-items: flex-start; gap: 24px; }
  .lp-step-num { width: 48px; height: 48px; background: #111; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
  .lp-step-img img { width: 100%; max-width: 400px; border-radius: 8px; }
  /* Science */
  .lp-science { background: #111; color: #fff; }
  .lp-stats-row { display: flex; gap: 48px; flex-wrap: wrap; margin-bottom: 40px; }
  .lp-stat { display: flex; flex-direction: column; }
  .lp-stat-num { font-size: 3rem; font-weight: 800; color: #fff; }
  .lp-stat-label { font-size: 0.9rem; color: rgba(255,255,255,0.65); margin-top: 4px; }
  /* Social proof */
  .lp-quotes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
  .lp-quote-card { padding: 28px; border: 1px solid #e5e5e5; border-radius: 8px; }
  .lp-stars { color: #f59e0b; font-size: 1.1rem; margin-bottom: 12px; }
  .lp-quote-text { font-size: 1rem; line-height: 1.6; color: #333; margin: 0 0 12px; }
  .lp-quote-name { font-size: 0.85rem; color: #888; margin: 0; }
  /* Comparison */
  .lp-table { width: 100%; border-collapse: collapse; margin-top: 32px; }
  .lp-table th, .lp-table td { padding: 14px 20px; border: 1px solid #e5e5e5; text-align: left; }
  .lp-table thead { background: #f9f9f9; }
  .lp-th-highlight { background: #111; color: #fff; }
  .lp-td-highlight { background: #f0fdf4; font-weight: 600; color: #166534; }
  /* FAQ */
  .lp-faq-list { display: flex; flex-direction: column; gap: 4px; }
  .lp-faq-item { border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; }
  .lp-faq-q { padding: 20px 24px; font-weight: 600; cursor: pointer; list-style: none; }
  .lp-faq-q::-webkit-details-marker { display: none; }
  .lp-faq-a { padding: 0 24px 20px; color: #555; line-height: 1.6; }
  /* CTA Banner */
  .lp-cta-banner { background: #111; color: #fff; padding: 100px 40px; text-align: center; }
  @media (max-width: 768px) {
    .lp-hero { flex-direction: column; padding: 60px 20px; }
    .lp-section { padding: 60px 20px; }
    .lp-cta-banner { padding: 60px 20px; }
    .lp-stats-row { flex-direction: column; gap: 24px; }
  }
</style>`;

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { landing_page_id, page_title, sections } = await request.json() as {
      landing_page_id: string;
      page_title: string;
      sections: PageSection[];
    };

    if (!landing_page_id || !page_title || !sections?.length) {
      return NextResponse.json({ error: 'landing_page_id, page_title, and sections are required' }, { status: 400 });
    }

    // Check Shopify credentials
    const shopifyUrl = process.env.SHOPIFY_STORE_URL;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopifyUrl || !shopifyToken) {
      return NextResponse.json({
        error: 'Shopify credentials not configured. Add SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN to Vercel environment variables.',
      }, { status: 400 });
    }

    // Generate HTML
    const sectionsHTML = sections.map(generateSectionHTML).join('\n');
    const bodyHtml = `<div class="lp-wrapper">${LP_STYLES}\n${sectionsHTML}\n</div>`;

    // Create Shopify draft page
    const shopifyResponse = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/pages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyToken,
        },
        body: JSON.stringify({
          page: {
            title: page_title,
            body_html: bodyHtml,
            published: false,
          },
        }),
      }
    );

    if (!shopifyResponse.ok) {
      const errText = await shopifyResponse.text();
      console.error('Shopify error:', shopifyResponse.status, errText);
      return NextResponse.json({ error: 'Shopify API error: ' + shopifyResponse.status }, { status: 500 });
    }

    const shopifyData = await shopifyResponse.json();
    const shopifyPageId = String(shopifyData.page?.id ?? '');
    const adminUrl = `https://${shopifyUrl}/admin/pages/${shopifyPageId}`;

    // Update landing_pages record
    if (shopifyPageId) {
      await supabase
        .from('landing_pages')
        .update({ shopify_page_id: shopifyPageId, status: 'testing', updated_at: new Date().toISOString() })
        .eq('id', landing_page_id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      shopify_page_id: shopifyPageId,
      admin_url: adminUrl,
      preview_url: `https://${shopifyUrl}/pages/${shopifyData.page?.handle ?? ''}`,
    });
  } catch (err) {
    console.error('shopify route error:', err);
    return NextResponse.json({ error: 'Failed to create Shopify page' }, { status: 500 });
  }
}
