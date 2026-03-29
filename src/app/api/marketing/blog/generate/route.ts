import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { topic, target_keywords, tone, product_angle } = await request.json();
    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const systemPrompt = `You are a content strategist for Everest Labs, a cold water therapy company launching the ISU-001 portable ice shower. Your job is to write compelling, SEO-optimized blog posts that educate readers about cold water therapy benefits while positioning ISU-001 as the solution.

Brand voice: Authoritative but accessible. Science-backed claims. No hype. Direct.
Target audience: Athletes, biohackers, fitness enthusiasts, recovery-focused individuals.

Output a JSON object with:
- title: Blog post title (SEO-optimized, under 60 chars)
- meta_description: SEO meta description (under 160 chars)
- sections: Array of content sections, each with:
  - type: One of "hero", "article_body", "key_benefits", "science_proof", "social_proof", "related_products", "email_capture", "cta_banner", "faq"
  - headline: Section heading
  - body: Section content (markdown for article_body, newline-separated items for lists)
  - cta_text: Optional call-to-action text
  - cta_url: Optional CTA link

Structure the blog with:
1. A hero section with a compelling headline
2. 2-4 article_body sections (the main content, 200-400 words each)
3. A science_proof section with statistics
4. A related_products section mentioning ISU-001
5. An email_capture section
6. A CTA banner at the end

Return ONLY valid JSON. No markdown code fences.`;

    const userPrompt = `Write a blog post about: ${topic}
${target_keywords ? `Target keywords: ${target_keywords}` : ''}
${tone ? `Tone: ${tone}` : ''}
${product_angle ? `Product angle: ${product_angle}` : ''}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return NextResponse.json({ error: 'Anthropic API error', detail: errText }, { status: 500 });
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text ?? '';
    const usage = anthropicData.usage ?? { input_tokens: 0, output_tokens: 0 };

    // Parse AI response
    let blogData;
    try {
      blogData = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        blogData = JSON.parse(jsonMatch[1]);
      } else {
        return NextResponse.json({ error: 'Failed to parse AI response', raw: rawText }, { status: 500 });
      }
    }

    // Log AI usage
    await supabase.from('ai_usage_log').insert({
      user_id: user.id,
      operation: 'blog_generate',
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: (usage.input_tokens * 0.0000008 + usage.output_tokens * 0.000004),
    });

    return NextResponse.json({
      blog: blogData,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
    });
  } catch (err) {
    console.error('blog/generate error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
