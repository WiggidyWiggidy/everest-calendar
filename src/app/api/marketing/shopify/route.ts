import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import type { PageSection, SectionType } from '@/types';

// ── Section HTML generators ─────────────────────────────────────────────────

function generateHeroHTML(s: PageSection): string {
  return `
  <section class="lp-hero">
    <div class="lp-hero-content">
      <h1 class="lp-h1">${s.headline}</h1>
      <p class="lp-lead lp-lead-hero">${s.body}</p>
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

function generateComparisonHTML(s: PageSection, productName?: string): string {
  const name = productName ?? 'Our Product';
  const rows = s.body.split('\n').filter(Boolean).map(row => {
    const parts = row.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      return `<tr><td>${parts[0]}</td><td class="lp-td-highlight">✓ ${parts[1]}</td><td>${parts[2]}</td></tr>`;
    }
    // Fallback: plain row if format doesn't match
    return `<tr><td colspan="3">${row}</td></tr>`;
  }).join('');
  return `
  <section class="lp-section lp-comparison">
    <h2 class="lp-h2">${s.headline}</h2>
    <table class="lp-table">
      <thead>
        <tr><th></th><th class="lp-th-highlight">${name}</th><th>Alternatives</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td>Recovery time</td><td class="lp-td-highlight">✓ Faster</td><td>Standard</td></tr>'}
      </tbody>
    </table>
    ${s.cta_text ? `<a href="${s.cta_url || '#'}" class="lp-btn-primary" style="margin-top:32px;display:inline-block">${s.cta_text}</a>` : ''}
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
    <div class="lp-faq-list">${items || `<details class="lp-faq-item"><summary class="lp-faq-q">${s.headline}</summary><p class="lp-faq-a">${s.body}</p></details>`}</div>
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

function generateSetup3ColHTML(s: PageSection): string {
  const steps = s.body.split('\n').filter(Boolean);
  const cols = steps.slice(0, 3).map((step, i) => {
    const [title, ...bodyParts] = step.split('|');
    const body = bodyParts.join('|').trim() || title.trim();
    return `
    <div class="lp-setup-col">
      <div class="lp-setup-num">${i + 1}</div>
      <p class="lp-setup-title">${title.trim()}</p>
      <p class="lp-setup-body">${body}</p>
    </div>`;
  }).join('');
  return `
  <section class="lp-section lp-setup">
    <h2 class="lp-h2">${s.headline}</h2>
    <div class="lp-setup-grid">${cols || `<div class="lp-setup-col"><p>${s.body}</p></div>`}</div>
  </section>`;
}

function generateCountdownTimerHTML(s: PageSection): string {
  const launchDate = s.cta_url || '2026-04-15T00:00:00'; // default launch date
  return `
  <section class="lp-section lp-countdown" style="background:#0f1419;color:#fff;text-align:center;">
    <h2 class="lp-h2 lp-h2-light">${s.headline}</h2>
    <p class="lp-lead-light">${s.body}</p>
    <div id="lp-timer" style="display:flex;gap:24px;justify-content:center;margin:32px 0;">
      <div><span class="lp-timer-num" id="lp-days">--</span><span class="lp-timer-label">Days</span></div>
      <div><span class="lp-timer-num" id="lp-hours">--</span><span class="lp-timer-label">Hours</span></div>
      <div><span class="lp-timer-num" id="lp-mins">--</span><span class="lp-timer-label">Minutes</span></div>
      <div><span class="lp-timer-num" id="lp-secs">--</span><span class="lp-timer-label">Seconds</span></div>
    </div>
    ${s.cta_text ? `<a href="#lp-email-form" class="lp-btn-large">${s.cta_text}</a>` : ''}
  </section>
  <script>
  (function(){
    var end=new Date("${launchDate}").getTime();
    function u(){var n=end-Date.now();if(n<0)return;
      document.getElementById("lp-days").textContent=Math.floor(n/864e5);
      document.getElementById("lp-hours").textContent=Math.floor((n%864e5)/36e5);
      document.getElementById("lp-mins").textContent=Math.floor((n%36e5)/6e4);
      document.getElementById("lp-secs").textContent=Math.floor((n%6e4)/1e3);
    }u();setInterval(u,1000);
  })();
  </script>`;
}

function generateEmailCaptureHTML(s: PageSection): string {
  const apiUrl = 'https://everest-calendar.vercel.app/api/marketing/subscribe';
  return `
  <section class="lp-section" style="text-align:center;max-width:560px;margin:0 auto;padding:60px 20px;" id="lp-email-form">
    <h2 class="lp-h2">${s.headline}</h2>
    <p class="lp-lead">${s.body}</p>
    <form id="lp-subscribe" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px;">
      <input type="email" id="lp-email" placeholder="Enter your email" required
        style="padding:14px 20px;border:2px solid #e8ecf0;border-radius:40px;font-size:1rem;width:280px;outline:none;" />
      <button type="submit" class="lp-btn-primary">${s.cta_text || 'Join Waitlist'}</button>
    </form>
    <p id="lp-sub-msg" style="margin-top:12px;font-size:0.9rem;color:#6b7280;display:none;"></p>
  </section>
  <script>
  document.getElementById("lp-subscribe").addEventListener("submit",function(e){
    e.preventDefault();
    var em=document.getElementById("lp-email").value;
    var msg=document.getElementById("lp-sub-msg");
    var params=new URLSearchParams(window.location.search);
    fetch("${apiUrl}",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:em,source_page:window.location.pathname,
        utm_source:params.get("utm_source"),utm_medium:params.get("utm_medium"),
        utm_campaign:params.get("utm_campaign"),utm_content:params.get("utm_content")})
    }).then(function(r){return r.json()}).then(function(d){
      if(d.subscribed){msg.textContent="You're on the list!";msg.style.color="#059669";}
      else{msg.textContent="Something went wrong. Try again.";}
      msg.style.display="block";
    }).catch(function(){msg.textContent="Network error. Try again.";msg.style.display="block";});
  });
  </script>`;
}

interface GenerateContext {
  productName?: string;
}

function generateSectionHTML(section: PageSection, ctx: GenerateContext = {}): string {
  const generators: Partial<Record<SectionType, (s: PageSection) => string>> = {
    hero: generateHeroHTML,
    key_benefits: generateKeyBenefitsHTML,
    how_it_works: generateHowItWorksHTML,
    science_proof: generateScienceProofHTML,
    social_proof: generateSocialProofHTML,
    comparison: (s) => generateComparisonHTML(s, ctx.productName),
    faq: generateFAQHTML,
    cta_banner: generateCTABannerHTML,
    setup_3col: generateSetup3ColHTML,
    countdown_timer: generateCountdownTimerHTML,
    email_capture: generateEmailCaptureHTML,
  };
  return (generators[section.type] ?? generateHeroHTML)(section);
}

// ── Brand-matched CSS (Everest Labs design system) ───────────────────────────
const LP_STYLES = `
<style>
  /* ── Global ──────────────────────────────────────────────── */
  .lp-wrapper { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f141f; background: #fafbfc; max-width: 1200px; margin: 0 auto; }
  .lp-section { padding: 80px 48px; }
  /* ── Typography ──────────────────────────────────────────── */
  .lp-h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.1; margin: 0 0 24px; letter-spacing: -0.04em; }
  .lp-h2 { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 700; line-height: 1.2; margin: 0 0 32px; letter-spacing: -0.04em; color: #0f141f; }
  .lp-h2-light { color: #fff !important; }
  .lp-lead { font-size: 1.2rem; line-height: 1.7; color: #4a5568; margin: 0 0 32px; max-width: 560px; }
  .lp-lead-hero { color: rgba(255,255,255,0.78); }
  .lp-lead-light { font-size: 1.2rem; line-height: 1.7; color: rgba(255,255,255,0.85); margin: 0 0 32px; }
  .lp-body { font-size: 1rem; line-height: 1.7; color: #4a5568; }
  /* ── Buttons ─────────────────────────────────────────────── */
  .lp-btn-primary { display: inline-block; background: #0d47a1; color: #fff; padding: 16px 36px; border-radius: 40px; text-decoration: none; font-weight: 600; font-size: 1rem; transition: background 0.2s, transform 0.15s; box-shadow: 0 0 5px rgba(0,0,0,0.25); }
  .lp-btn-primary:hover { background: #1565c0; transform: translateY(-1px); }
  .lp-btn-secondary { display: inline-block; background: #fff; color: #0d47a1; padding: 14px 32px; border-radius: 40px; text-decoration: none; font-weight: 600; font-size: 1rem; margin-top: 32px; box-shadow: 0 0 5px rgba(0,0,0,0.15); }
  .lp-btn-large { display: inline-block; background: #fff; color: #0d47a1; padding: 18px 48px; border-radius: 40px; text-decoration: none; font-weight: 700; font-size: 1.1rem; box-shadow: 0 0 5px rgba(0,0,0,0.15); }
  /* ── Hero (dark) ─────────────────────────────────────────── */
  .lp-hero { display: flex; align-items: center; gap: 64px; padding: 100px 48px; background: #0f1419; }
  .lp-hero-content { flex: 1; }
  .lp-hero-img { flex: 1; }
  .lp-hero-img img { width: 100%; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  /* ── Key Benefits ────────────────────────────────────────── */
  .lp-benefits-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
  .lp-benefit-card { padding: 32px; border: 1px solid #e8ecf0; border-radius: 16px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .lp-benefit-num { font-size: 2.5rem; font-weight: 800; color: #d4e1f7; margin-bottom: 16px; letter-spacing: -0.04em; }
  .lp-benefit-card p { font-size: 1rem; line-height: 1.65; color: #4a5568; margin: 0; }
  /* ── How It Works ────────────────────────────────────────── */
  .lp-steps { display: flex; flex-direction: column; gap: 40px; }
  .lp-step { display: flex; align-items: flex-start; gap: 24px; }
  .lp-step-num { width: 48px; height: 48px; background: #0d47a1; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 1.1rem; }
  .lp-step-text p { font-size: 1rem; line-height: 1.7; color: #4a5568; margin: 0; }
  .lp-step-img img { width: 100%; max-width: 400px; border-radius: 16px; }
  /* ── Science (dark) ──────────────────────────────────────── */
  .lp-science { background: #0f1419; color: #fff; }
  .lp-stats-row { display: flex; gap: 48px; flex-wrap: wrap; margin-bottom: 40px; }
  .lp-stat { display: flex; flex-direction: column; }
  .lp-stat-num { font-size: 3rem; font-weight: 800; color: #fff; letter-spacing: -0.04em; }
  .lp-stat-label { font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-top: 6px; }
  /* ── Social Proof ────────────────────────────────────────── */
  .lp-quotes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
  .lp-quote-card { padding: 28px; border: 1px solid #e8ecf0; border-radius: 16px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .lp-stars { color: #f59e0b; font-size: 1rem; margin-bottom: 12px; }
  .lp-quote-text { font-size: 1rem; line-height: 1.65; color: #374151; margin: 0 0 12px; }
  .lp-quote-name { font-size: 0.85rem; color: #9ca3af; font-weight: 500; margin: 0; }
  /* ── Comparison ──────────────────────────────────────────── */
  .lp-table { width: 100%; border-collapse: collapse; margin-top: 32px; }
  .lp-table th, .lp-table td { padding: 16px 20px; border-bottom: 1px solid #e8ecf0; text-align: left; }
  .lp-table thead { background: #f5f7fa; }
  .lp-th-highlight { background: #0d47a1; color: #fff; }
  .lp-td-highlight { background: #eef4ff; font-weight: 600; color: #0d47a1; }
  /* ── 3-Col Setup ─────────────────────────────────────────── */
  .lp-setup { border-top: 3px solid #0d47a1; }
  .lp-setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 32px; }
  .lp-setup-col { text-align: center; padding: 16px; }
  .lp-setup-num { width: 56px; height: 56px; background: #0d47a1; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.4rem; margin: 0 auto 20px; letter-spacing: -0.04em; }
  .lp-setup-title { font-size: 1.1rem; font-weight: 700; color: #0f141f; margin: 0 0 10px; }
  .lp-setup-body { font-size: 0.95rem; line-height: 1.65; color: #4a5568; margin: 0; }
  /* ── FAQ ─────────────────────────────────────────────────── */
  .lp-faq-list { display: flex; flex-direction: column; gap: 6px; }
  .lp-faq-item { border: 1px solid #e8ecf0; border-radius: 12px; overflow: hidden; background: #fff; }
  .lp-faq-q { padding: 20px 24px; font-weight: 600; cursor: pointer; list-style: none; color: #0f141f; font-size: 1rem; }
  .lp-faq-q::-webkit-details-marker { display: none; }
  .lp-faq-a { padding: 0 24px 20px; color: #4a5568; line-height: 1.7; }
  /* ── CTA Banner (dark) ───────────────────────────────────── */
  .lp-cta-banner { background: #0f1419; color: #fff; padding: 100px 48px; text-align: center; }
  /* ── Countdown Timer ───────────────────────────────────── */
  .lp-timer-num { display: block; font-size: 3rem; font-weight: 800; letter-spacing: -0.04em; }
  .lp-timer-label { display: block; font-size: 0.75rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.1em; }
  /* ── Sticky Buy Bar ──────────────────────────────────────── */
  .lp-sticky-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #0f1419; color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 9999; box-shadow: 0 -4px 24px rgba(0,0,0,0.25); transform: translateY(100%); transition: transform 0.3s ease; }
  .lp-sticky-info { display: flex; flex-direction: column; gap: 2px; }
  .lp-sticky-name { font-size: 0.9rem; font-weight: 600; color: #fff; }
  .lp-sticky-price { font-size: 0.8rem; color: rgba(255,255,255,0.6); }
  .lp-btn-sticky { background: #0d47a1; color: #fff; padding: 12px 28px; border-radius: 40px; text-decoration: none; font-weight: 600; font-size: 0.95rem; white-space: nowrap; }
  /* ── Responsive ──────────────────────────────────────────── */
  @media (max-width: 768px) {
    .lp-hero { flex-direction: column; padding: 60px 20px; gap: 32px; }
    .lp-section { padding: 60px 20px; }
    .lp-cta-banner { padding: 60px 20px; }
    .lp-stats-row { flex-direction: column; gap: 24px; }
    .lp-setup-grid { grid-template-columns: 1fr; }
    .lp-sticky-bar { padding: 12px 16px; }
    .lp-btn-sticky { padding: 10px 20px; font-size: 0.85rem; }
  }
</style>`;

function generateStickyBar(pageTitle: string, productPrice: string | undefined, cartUrl: string): string {
  return `
<div class="lp-sticky-bar" id="lp-sticky">
  <div class="lp-sticky-info">
    <span class="lp-sticky-name">${pageTitle}</span>
    ${productPrice ? `<span class="lp-sticky-price">${productPrice}</span>` : ''}
  </div>
  <a href="${cartUrl}" class="lp-btn-sticky">Add to Cart</a>
</div>
<script>
(function(){
  var bar = document.getElementById('lp-sticky');
  if (!bar) return;
  window.addEventListener('scroll', function(){
    bar.style.transform = window.scrollY > 500 ? 'translateY(0)' : 'translateY(100%)';
  }, { passive: true });
})();
</script>`;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as {
      landing_page_id: string;
      page_title: string;
      variant_id?: string;
      product_price?: string;
      sections?: PageSection[];
      body_html?: string; // pre-generated HTML from generate-variation
    };

    const { landing_page_id, page_title, variant_id, product_price, sections, body_html: prebuiltHtml } = body;

    if (!landing_page_id || !page_title) {
      return NextResponse.json({ error: 'landing_page_id and page_title are required' }, { status: 400 });
    }
    if (!sections?.length && !prebuiltHtml) {
      return NextResponse.json({ error: 'Either sections or body_html is required' }, { status: 400 });
    }

    // Get Shopify credentials via client credentials grant
    let shopifyUrl: string;
    let shopifyToken: string;
    try {
      shopifyUrl = getShopifyStoreUrl();
      shopifyToken = await getShopifyToken();
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    // Build cart URL if variant_id provided
    const cartUrl = variant_id ? `https://${shopifyUrl}/cart/add?id=${variant_id}&quantity=1` : null;

    let bodyHtml: string;

    if (prebuiltHtml) {
      // Variation mode: use pre-built HTML, just add sticky bar if needed
      const stickyBar = cartUrl ? generateStickyBar(page_title, product_price, cartUrl) : '';
      // Inject sticky bar before closing wrapper div (or just append)
      bodyHtml = stickyBar
        ? prebuiltHtml.replace('</div>', `${stickyBar}\n</div>`)
        : prebuiltHtml;
    } else {
      // Scratch mode: generate from sections
      // Inject cart URL into sections that have CTA text
      const processedSections = (sections!).map(s => ({
        ...s,
        cta_url: cartUrl && s.cta_text ? cartUrl : s.cta_url,
      }));

      // Extract short product name from page title for comparison table header
      const productName = page_title.split('—')[0].trim() || page_title;
      const ctx: GenerateContext = { productName };

      const sectionsHTML = processedSections.map(s => generateSectionHTML(s, ctx)).join('\n');
      const stickyBar = cartUrl ? generateStickyBar(page_title, product_price, cartUrl) : '';
      bodyHtml = `<div class="lp-wrapper">${LP_STYLES}\n${sectionsHTML}\n${stickyBar}\n</div>`;
    }

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

    // Update landing_pages record with shopify_page_id
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
