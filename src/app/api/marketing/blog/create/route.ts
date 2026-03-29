import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PageSection } from '@/types';

// Blog-specific section generators
function generateArticleBodyHTML(s: PageSection): string {
  // Convert markdown-style content to HTML
  const paragraphs = s.body.split('\n\n').filter(Boolean).map(p => {
    // Bold
    let html = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Lists
    if (html.startsWith('- ') || html.startsWith('* ')) {
      const items = html.split('\n').map(li => `<li>${li.replace(/^[-*]\s*/, '')}</li>`).join('');
      return `<ul class="lp-article-list">${items}</ul>`;
    }
    return `<p class="lp-article-p">${html}</p>`;
  }).join('\n');

  return `
  <section class="lp-section lp-article">
    ${s.headline ? `<h2 class="lp-h2">${s.headline}</h2>` : ''}
    <div class="lp-article-content">${paragraphs}</div>
  </section>`;
}

function generateAuthorBioHTML(s: PageSection): string {
  const [name, ...bioParts] = s.body.split('\n');
  const bio = bioParts.join(' ').trim() || name;
  return `
  <section class="lp-section lp-author">
    <div class="lp-author-card">
      ${s.image_url ? `<img src="${s.image_url}" alt="${name}" class="lp-author-avatar" />` : ''}
      <div>
        <p class="lp-author-name">${name}</p>
        <p class="lp-author-bio">${bio}</p>
      </div>
    </div>
  </section>`;
}

function generateRelatedProductsHTML(s: PageSection): string {
  return `
  <section class="lp-section lp-related">
    <h2 class="lp-h2">${s.headline}</h2>
    <div class="lp-related-card">
      ${s.image_url ? `<img src="${s.image_url}" alt="ISU-001" class="lp-related-img" />` : ''}
      <div class="lp-related-body">
        <p>${s.body}</p>
        ${s.cta_text ? `<a href="${s.cta_url || '/products/isu-001'}" class="lp-btn-primary">${s.cta_text}</a>` : ''}
      </div>
    </div>
  </section>`;
}

function generateEmailCaptureHTML(s: PageSection): string {
  return `
  <section class="lp-section lp-email-capture">
    <div class="lp-email-box">
      <h2 class="lp-h2">${s.headline}</h2>
      <p class="lp-lead">${s.body}</p>
      <form class="lp-email-form" action="#" method="post">
        <input type="email" placeholder="Enter your email" class="lp-email-input" required />
        <button type="submit" class="lp-btn-primary">${s.cta_text || 'Subscribe'}</button>
      </form>
    </div>
  </section>`;
}

const BLOG_STYLES = `
<style>
  .lp-article-content { max-width: 720px; }
  .lp-article-p { font-size: 1.1rem; line-height: 1.8; color: #374151; margin: 0 0 24px; }
  .lp-article-list { padding-left: 24px; margin: 0 0 24px; }
  .lp-article-list li { font-size: 1.1rem; line-height: 1.8; color: #374151; margin-bottom: 8px; }
  .lp-author-card { display: flex; align-items: center; gap: 20px; padding: 24px; border: 1px solid #e8ecf0; border-radius: 16px; background: #f9fafb; }
  .lp-author-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
  .lp-author-name { font-weight: 700; font-size: 1rem; margin: 0 0 4px; }
  .lp-author-bio { font-size: 0.9rem; color: #6b7280; margin: 0; line-height: 1.5; }
  .lp-related-card { display: flex; gap: 32px; align-items: center; padding: 32px; border: 1px solid #e8ecf0; border-radius: 16px; background: #fff; }
  .lp-related-img { width: 200px; border-radius: 12px; }
  .lp-related-body { flex: 1; }
  .lp-related-body p { font-size: 1rem; line-height: 1.7; color: #4a5568; margin: 0 0 20px; }
  .lp-email-box { text-align: center; max-width: 560px; margin: 0 auto; }
  .lp-email-form { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .lp-email-input { padding: 14px 20px; border: 2px solid #e8ecf0; border-radius: 40px; font-size: 1rem; width: 280px; outline: none; }
  .lp-email-input:focus { border-color: #0d47a1; }
  @media (max-width: 768px) {
    .lp-related-card { flex-direction: column; }
    .lp-related-img { width: 100%; }
    .lp-email-form { flex-direction: column; align-items: center; }
    .lp-email-input { width: 100%; }
  }
</style>`;

// Import the existing section generators from the shopify route
// We reuse the existing LP_STYLES + section generators for non-blog sections
const BLOG_SECTION_MAP: Record<string, (s: PageSection) => string> = {
  article_body: generateArticleBodyHTML,
  author_bio: generateAuthorBioHTML,
  related_products: generateRelatedProductsHTML,
  email_capture: generateEmailCaptureHTML,
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, sections, meta_title, meta_description, proposal_id } = await request.json() as {
      title: string;
      sections: PageSection[];
      meta_title?: string;
      meta_description?: string;
      proposal_id?: string;
    };

    if (!title || !sections?.length) {
      return NextResponse.json({ error: 'title and sections required' }, { status: 400 });
    }

    const shopifyUrl = process.env.SHOPIFY_STORE_URL;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopifyUrl || !shopifyToken) {
      return NextResponse.json({ error: 'Shopify credentials not configured' }, { status: 400 });
    }

    // Generate HTML for each section
    const sectionsHTML = sections.map(s => {
      const generator = BLOG_SECTION_MAP[s.type];
      if (generator) return generator(s);
      // Fall back to importing the section from the main shopify route pattern
      // For now, generate a basic section
      return `<section class="lp-section"><h2 class="lp-h2">${s.headline}</h2><p class="lp-lead">${s.body}</p>${s.cta_text ? `<a href="${s.cta_url || '#'}" class="lp-btn-primary">${s.cta_text}</a>` : ''}</section>`;
    }).join('\n');

    const bodyHtml = `<div class="lp-wrapper">${BLOG_STYLES}\n${sectionsHTML}\n</div>`;

    // Create as Shopify page (blog-style)
    const shopifyRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/pages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyToken,
        },
        body: JSON.stringify({
          page: {
            title: title,
            body_html: bodyHtml,
            published: false,
            metafields: [
              ...(meta_title ? [{ namespace: 'global', key: 'title_tag', value: meta_title, type: 'single_line_text_field' }] : []),
              ...(meta_description ? [{ namespace: 'global', key: 'description_tag', value: meta_description, type: 'single_line_text_field' }] : []),
            ],
          },
        }),
      }
    );

    if (!shopifyRes.ok) {
      const err = await shopifyRes.text();
      return NextResponse.json({ error: 'Shopify API error: ' + shopifyRes.status, detail: err }, { status: 500 });
    }

    const shopifyData = await shopifyRes.json();
    const shopifyPageId = String(shopifyData.page?.id ?? '');
    const handle = shopifyData.page?.handle ?? '';

    // Create landing_pages record
    const { data: landingPage, error: insertError } = await supabase
      .from('landing_pages')
      .insert({
        user_id: user.id,
        name: title,
        shopify_url: `https://${shopifyUrl}/pages/${handle}`,
        shopify_page_id: shopifyPageId,
        status: 'testing',
        page_type: 'blog',
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // If this came from a proposal, update its status
    if (proposal_id) {
      await supabase
        .from('page_proposals')
        .update({ status: 'building', updated_at: new Date().toISOString() })
        .eq('id', proposal_id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      landing_page: landingPage,
      shopify_page_id: shopifyPageId,
      admin_url: `https://${shopifyUrl}/admin/pages/${shopifyPageId}`,
      preview_url: `https://${shopifyUrl}/pages/${handle}`,
    });
  } catch (err) {
    console.error('blog/create error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
