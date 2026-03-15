import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AnalystProposalPayload } from '@/types';

const ANALYST_SYSTEM_PROMPT = `You are an expert e-commerce marketing analyst specialising in direct-to-consumer health and performance products. You are advising Everest Labs, an Australian company selling Ice Showers — a premium cold therapy shower product targeting health-conscious, performance-oriented consumers (athletes, biohackers, wellness enthusiasts).

Your benchmark for landing page design, copy, and structure is eightsleep.com. Their pages use:
- Bold, benefit-led headlines (outcome-first, not feature-first)
- Scientific/research-backed claims with specific numbers
- Social proof with names, faces, and measurable results
- Clean sections with clear visual hierarchy
- Strong emotional and aspirational copy
- Multiple CTAs throughout the page

Your job:
1. Diagnose why the current landing page is underperforming based on the metrics provided
2. Identify the root causes (not just symptoms)
3. Propose specific page sections for a new variant to test
4. Explain the expected impact

You MUST respond with valid JSON only — no markdown, no commentary, no code fences. Return exactly this structure:
{
  "diagnosis": "2-3 paragraph narrative explaining what the data tells you about user behaviour and where the page is failing",
  "root_causes": ["specific cause 1", "specific cause 2", "specific cause 3"],
  "proposed_sections": [
    {
      "type": "hero",
      "headline": "specific headline copy",
      "body": "specific body copy for this section",
      "cta_text": "CTA button text",
      "notes": "why this section / what hypothesis it tests"
    }
  ],
  "priority": "high",
  "expected_lift": "15-25% improvement in add-to-cart rate based on improved above-the-fold messaging",
  "key_metrics": ["shopify_add_to_cart_rate", "ga_bounce_rate"]
}

Section types available: hero, key_benefits, how_it_works, science_proof, social_proof, comparison, faq, cta_banner
Propose 4-7 sections in the order they should appear on the page.
Make all copy specific and compelling — not generic placeholders.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { landing_page_id } = await request.json();
    if (!landing_page_id) {
      return NextResponse.json({ error: 'landing_page_id is required' }, { status: 400 });
    }

    // Fetch landing page
    const { data: page, error: pageError } = await supabase
      .from('landing_pages')
      .select('*')
      .eq('id', landing_page_id)
      .eq('user_id', user.id)
      .single();
    if (pageError || !page) {
      return NextResponse.json({ error: 'Landing page not found' }, { status: 404 });
    }

    // Fetch last 30 days of metrics
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: metrics } = await supabase
      .from('marketing_metrics_daily')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: true });

    // Build metrics summary for the prompt
    const metricsData = metrics ?? [];
    const latestMetrics = metricsData[metricsData.length - 1];

    const metricsSummary = metricsData.length === 0
      ? 'No metrics data available yet.'
      : `
Latest day (${latestMetrics?.date}):
- Shopify Revenue: $${latestMetrics?.shopify_revenue ?? 'N/A'}
- Shopify Orders: ${latestMetrics?.shopify_orders ?? 'N/A'}
- Add-to-Cart Rate: ${latestMetrics?.shopify_add_to_cart_rate != null ? (latestMetrics.shopify_add_to_cart_rate * 100).toFixed(1) + '%' : 'N/A'}
- Conversion Rate: ${latestMetrics?.shopify_conversion_rate != null ? (latestMetrics.shopify_conversion_rate * 100).toFixed(1) + '%' : 'N/A'}
- Checkout Rate: ${latestMetrics?.shopify_checkout_rate != null ? (latestMetrics.shopify_checkout_rate * 100).toFixed(1) + '%' : 'N/A'}
- Meta Spend: $${latestMetrics?.meta_spend ?? 'N/A'}
- Meta CTR: ${latestMetrics?.meta_ctr != null ? (latestMetrics.meta_ctr * 100).toFixed(2) + '%' : 'N/A'}
- Meta ROAS: ${latestMetrics?.meta_roas ?? 'N/A'}x
- Meta Cost per Purchase: $${latestMetrics?.meta_cost_per_purchase ?? 'N/A'}
- GA Bounce Rate: ${latestMetrics?.ga_bounce_rate != null ? (latestMetrics.ga_bounce_rate * 100).toFixed(1) + '%' : 'N/A'}
- GA Avg Session Duration: ${latestMetrics?.ga_avg_session_duration ?? 'N/A'}s
- Clarity Engagement Score: ${latestMetrics?.clarity_engagement_score ?? 'N/A'}
- Clarity Rage Clicks: ${latestMetrics?.clarity_rage_clicks ?? 'N/A'}
- Customers Acquired: ${latestMetrics?.customers_acquired ?? 'N/A'}

30-day averages (${metricsData.length} days of data):
- Avg Add-to-Cart: ${metricsData.filter(m => m.shopify_add_to_cart_rate != null).length > 0
    ? (metricsData.reduce((s: number, m: { shopify_add_to_cart_rate: number | null }) => s + (m.shopify_add_to_cart_rate ?? 0), 0) / metricsData.filter((m: { shopify_add_to_cart_rate: number | null }) => m.shopify_add_to_cart_rate != null).length * 100).toFixed(1) + '%'
    : 'N/A'}
- Avg ROAS: ${metricsData.filter((m: { meta_roas: number | null }) => m.meta_roas != null).length > 0
    ? (metricsData.reduce((s: number, m: { meta_roas: number | null }) => s + (m.meta_roas ?? 0), 0) / metricsData.filter((m: { meta_roas: number | null }) => m.meta_roas != null).length).toFixed(2) + 'x'
    : 'N/A'}
- Avg Bounce Rate: ${metricsData.filter((m: { ga_bounce_rate: number | null }) => m.ga_bounce_rate != null).length > 0
    ? (metricsData.reduce((s: number, m: { ga_bounce_rate: number | null }) => s + (m.ga_bounce_rate ?? 0), 0) / metricsData.filter((m: { ga_bounce_rate: number | null }) => m.ga_bounce_rate != null).length * 100).toFixed(1) + '%'
    : 'N/A'}
`;

    const userMessage = `Analyse this landing page and provide a diagnosis and improvement plan.

Page: ${page.name}
URL: ${page.shopify_url}
Status: ${page.status}
${page.notes ? `Notes: ${page.notes}` : ''}

${metricsSummary}

Based on this data, diagnose the underperformance and propose specific page sections for a variant to split test.`;

    // Call Anthropic API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: ANALYST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error('Anthropic error:', errText);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const anthropicData = await anthropicResponse.json();
    const rawContent = anthropicData.content?.[0]?.text ?? '';
    const usage = anthropicData.usage ?? { input_tokens: 0, output_tokens: 0 };

    // Parse JSON response
    let parsed: AnalystProposalPayload;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error('Failed to parse analyst JSON:', rawContent);
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 });
    }

    // Save proposal to DB
    const { data: proposal, error: insertError } = await supabase
      .from('page_proposals')
      .insert({
        user_id: user.id,
        landing_page_id,
        diagnosis: parsed.diagnosis,
        proposed_sections: parsed.proposed_sections,
        status: 'pending',
      })
      .select()
      .single();
    if (insertError) throw insertError;

    // Log token usage
    const costUsd =
      (usage.input_tokens / 1_000_000) * 3.0 +
      (usage.output_tokens / 1_000_000) * 15.0;
    void supabase.from('ai_usage_log').insert({
      user_id: user.id,
      operation: 'marketing_analyst',
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd,
    });

    return NextResponse.json({
      proposal,
      priority: parsed.priority,
      expected_lift: parsed.expected_lift,
      root_causes: parsed.root_causes,
      key_metrics: parsed.key_metrics,
    });
  } catch (err) {
    console.error('analyse POST error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
