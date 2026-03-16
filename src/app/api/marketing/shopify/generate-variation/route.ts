import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AVAILABLE_SECTION_TYPES = [
  'hero — Bold headline, body copy, CTA button, optional image (dark background)',
  'key_benefits — 3-column numbered benefit cards',
  'how_it_works — Numbered steps with text',
  'science_proof — Dark background with stat callouts (format: "95%: Users report X" per line)',
  'social_proof — Quote cards with star ratings (format: "Quote text — Name" per card, double-newline between cards)',
  'comparison — Table vs alternatives (format: "Feature | Product value | Alternative value" per row)',
  'faq — Accordion FAQ (format: Q per first line, A on following lines, double-newline between Q&As)',
  'cta_banner — Full-width dark closing CTA with button',
  'setup_3col — 3-column setup/installation steps (format: "Step title | Step description" per line)',
];

interface VariationChange {
  element: string;
  before: string;
  after: string;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { landing_page_id, proposal_id } = await request.json() as {
      landing_page_id: string;
      proposal_id: string;
    };

    if (!landing_page_id || !proposal_id) {
      return NextResponse.json({ error: 'landing_page_id and proposal_id are required' }, { status: 400 });
    }

    // 1. Fetch landing page from Supabase
    const { data: page, error: pageErr } = await supabase
      .from('landing_pages')
      .select('*')
      .eq('id', landing_page_id)
      .eq('user_id', user.id)
      .single();

    if (pageErr || !page) {
      return NextResponse.json({ error: 'Landing page not found' }, { status: 404 });
    }

    if (!page.shopify_page_id) {
      return NextResponse.json({
        error: 'This page has not been pushed to Shopify yet. Create a draft from scratch first, then you can generate AI variations of it.',
      }, { status: 400 });
    }

    // 2. Fetch the existing page HTML from Shopify Admin API
    const shopifyUrl = process.env.SHOPIFY_STORE_URL;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopifyUrl || !shopifyToken) {
      return NextResponse.json({ error: 'Shopify credentials not configured' }, { status: 400 });
    }

    const shopifyRes = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/pages/${page.shopify_page_id}.json`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );

    if (!shopifyRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch existing page from Shopify' }, { status: 500 });
    }

    const { page: shopifyPage } = await shopifyRes.json();
    const existingHtml: string = shopifyPage?.body_html ?? '';

    if (!existingHtml || existingHtml.length < 100) {
      return NextResponse.json({
        error: 'The existing Shopify page has no HTML content to build a variation from.',
      }, { status: 400 });
    }

    // 3. Fetch the approved proposal
    const { data: proposal, error: propErr } = await supabase
      .from('page_proposals')
      .select('*')
      .eq('id', proposal_id)
      .eq('user_id', user.id)
      .single();

    if (propErr || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // 4. Call Claude to generate variation
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const systemPrompt = `You are an expert conversion rate optimisation specialist for DTC e-commerce brands.
Your task: generate an improved variation of an existing landing page HTML based on an analytics diagnosis.

STRICT RULES — you MUST follow these exactly:
1. Preserve ALL CSS class names (never change any class="..." attributes)
2. Preserve ALL HTML structural elements (section, div, ul, table structure)
3. Preserve ALL image URLs (src="..." attributes — never change)
4. Preserve ALL href attributes on <a> tags (buy/cart URLs must not change)
5. ONLY modify text content inside tags: h1, h2, h3, p, span, td, summary, li text
6. You MAY add brand new complete sections if the diagnosis strongly recommends them
7. When adding new sections, follow these HTML patterns for each type:
${AVAILABLE_SECTION_TYPES.map(t => `   - ${t}`).join('\n')}
8. New sections should use the same CSS classes as the existing page (lp-section, lp-h2, lp-benefit-card, etc.)
9. Insert new sections at the logically correct position in the page

Return ONLY valid JSON — no markdown, no \`\`\`json, no explanation outside the JSON:
{
  "body_html": "...the complete modified HTML string...",
  "changes": [
    { "element": "Hero h1", "before": "original text", "after": "new text", "reason": "why this improves conversion" }
  ]
}`;

    const userMessage = `EXISTING PAGE HTML:
${existingHtml}

---
DIAGNOSIS (what's underperforming and why):
${proposal.diagnosis ?? 'No diagnosis available'}

ROOT CAUSES:
${(proposal.user_plan ? [proposal.user_plan] : (proposal as { proposed_sections?: Array<{ notes?: string }> }).proposed_sections?.map((s: { notes?: string }) => s.notes).filter(Boolean) ?? []).join('\n') || 'See diagnosis above'}

PROPOSED CHANGES (from the analyst):
${proposal.user_plan ?? JSON.stringify(proposal.proposed_sections ?? [], null, 2)}

AVAILABLE SECTION TYPES you can add if needed:
${AVAILABLE_SECTION_TYPES.join('\n')}

Generate a conversion-optimised variation. Rewrite headlines and copy to address the root causes. Add any missing sections from the proposal. Return the full modified HTML and a list of every change made.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('Claude API error:', claudeRes.status, err);
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData.content?.[0]?.text ?? '';

    // Log token usage
    const usage = claudeData.usage ?? { input_tokens: 0, output_tokens: 0 };
    const costUsd = (usage.input_tokens / 1_000_000) * 3.0 + (usage.output_tokens / 1_000_000) * 15.0;
    void supabase.from('ai_usage_log').insert({
      user_id: user.id,
      operation: 'page_variation_generation',
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd,
    });

    // Parse JSON response
    let parsed: { body_html: string; changes: VariationChange[] };
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse variation JSON. Raw:', rawText.slice(0, 500));
      return NextResponse.json({ error: 'AI returned invalid JSON. Try again.' }, { status: 500 });
    }

    if (!parsed.body_html) {
      return NextResponse.json({ error: 'AI did not return valid HTML. Try again.' }, { status: 500 });
    }

    return NextResponse.json({
      body_html: parsed.body_html,
      changes: parsed.changes ?? [],
    });
  } catch (err) {
    console.error('generate-variation error:', err);
    return NextResponse.json({ error: 'Failed to generate variation' }, { status: 500 });
  }
}
