import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Batch-generate blog posts from a list of keywords
// Calls blog/generate + blog/create for each keyword sequentially

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { keywords, tone, product_angle, auto_create } = await request.json() as {
      keywords: string[];
      tone?: string;
      product_angle?: string;
      auto_create?: boolean; // if true, also creates Shopify drafts
    };

    if (!keywords?.length) {
      return NextResponse.json({ error: 'keywords array is required' }, { status: 400 });
    }

    if (keywords.length > 20) {
      return NextResponse.json({ error: 'Max 20 keywords per batch' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
    const cookie = request.headers.get('cookie') || '';

    const results: Array<{
      keyword: string;
      status: 'generated' | 'created' | 'error';
      title?: string;
      sections_count?: number;
      shopify_page_id?: string;
      preview_url?: string;
      error?: string;
    }> = [];

    // Process sequentially to avoid rate limits
    for (const keyword of keywords) {
      try {
        // Step 1: Generate blog structure
        const genRes = await fetch(`${baseUrl}/api/marketing/blog/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({
            topic: keyword,
            target_keywords: [keyword],
            tone: tone || 'authoritative',
            product_angle: product_angle || 'natural mention',
          }),
        });

        if (!genRes.ok) {
          const err = await genRes.json().catch(() => ({ error: 'Generation failed' }));
          results.push({ keyword, status: 'error', error: err.error || 'Generation failed' });
          continue;
        }

        const blogData = await genRes.json();

        if (!auto_create) {
          results.push({
            keyword,
            status: 'generated',
            title: blogData.title,
            sections_count: blogData.sections?.length || 0,
          });
          continue;
        }

        // Step 2: Create on Shopify as draft
        if (blogData.title && blogData.sections?.length) {
          const createRes = await fetch(`${baseUrl}/api/marketing/blog/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', cookie },
            body: JSON.stringify({
              title: blogData.title,
              sections: blogData.sections,
              meta_title: blogData.meta_title,
              meta_description: blogData.meta_description,
            }),
          });

          if (createRes.ok) {
            const createData = await createRes.json();
            results.push({
              keyword,
              status: 'created',
              title: blogData.title,
              sections_count: blogData.sections.length,
              shopify_page_id: createData.shopify_page_id,
              preview_url: createData.preview_url,
            });
          } else {
            results.push({
              keyword,
              status: 'generated',
              title: blogData.title,
              sections_count: blogData.sections.length,
              error: 'Shopify create failed (blog generated but not published)',
            });
          }
        }
      } catch (err) {
        results.push({ keyword, status: 'error', error: String(err) });
      }
    }

    const generated = results.filter(r => r.status !== 'error').length;
    const created = results.filter(r => r.status === 'created').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      total: keywords.length,
      generated,
      created,
      errors,
      results,
    });
  } catch (err) {
    console.error('blog/batch-generate error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
