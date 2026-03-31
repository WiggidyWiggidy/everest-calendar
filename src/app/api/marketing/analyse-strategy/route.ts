import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const STRATEGY_SYSTEM_PROMPT = `You are a data-driven DTC marketing strategist. You analyse marketing data and propose ICE-scored experiments.

You will receive:
- 60 days of marketing metrics (Meta ads, Shopify orders, Clarity UX data)
- Campaign-level performance data
- Active learnings (business context, constraints, market insights from the founder)
- Current/past experiment results

Your job: Propose 3-5 experiments ranked by ICE score.

ICE Scoring:
- Impact (1-10): How much will this move the primary metric if it works?
- Confidence (1-10): How sure are you this will work? Based on data, not opinion.
- Ease (1-10): How easy is this to implement? (10 = toggle/copy change, 1 = full rebuild)
- Score = (Impact * Confidence * Ease) / 10

For each experiment, specify an execution_spec that maps to our builders:
- For landing_page type: provide sections array with type, headline, body, cta_text
- For creative type: provide creatives array with headline, body_copy, cta_text, format
- For copy type: provide the landing_page_id and what to change

Section types available: hero, key_benefits, how_it_works, science_proof, social_proof, comparison, faq, cta_banner, setup_3col, email_capture, countdown_timer

CRITICAL RULES:
- Every hypothesis MUST cite specific data points (dates, numbers, percentages)
- Every ICE score MUST have a rationale explaining why each number was chosen
- Execution specs must contain SPECIFIC copy, not placeholders
- Respect all constraints from the learnings
- Do NOT propose experiments that duplicate running/completed ones

Respond with valid JSON only. No markdown, no commentary. Return exactly:
{
  "experiments": [
    {
      "name": "Short descriptive name",
      "type": "landing_page|creative|copy|offer|audience|ux",
      "hypothesis": "Specific hypothesis citing data",
      "primary_metric": "metric_name",
      "baseline_value": 1.71,
      "target_metric_value": 2.5,
      "expected_lift_pct": 46,
      "ice_impact": 8,
      "ice_confidence": 7,
      "ice_ease": 8,
      "rationale": "Impact 8: [why]. Confidence 7: [why]. Ease 8: [why].",
      "data_sources": ["marketing_metrics_daily", "clarity_engagement"],
      "execution_spec": { ... },
      "notes": "Additional context"
    }
  ],
  "analysis_summary": "2-3 sentence summary of the overall marketing situation"
}`;

export async function POST(request: NextRequest) {
  try {
    // Support both user session and sync secret auth
    let userId: string;
    const syncSecret = request.headers.get('x-sync-secret');

    if (syncSecret === process.env.MARKETING_SYNC_SECRET) {
      userId = '174f2dff-7a96-464c-a919-b473c328d531';
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      userId = user.id;
    }

    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const days = Math.min(body.days || 60, 90);

    // 1. Pull marketing metrics
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data: metrics } = await supabase
      .from('marketing_metrics_daily')
      .select('*')
      .eq('user_id', userId)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: true });

    // 2. Pull learnings
    const { data: learnings } = await supabase
      .from('marketing_learnings')
      .select('category, learning')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('category');

    // 3. Pull existing experiments
    const { data: experiments } = await supabase
      .from('marketing_experiments')
      .select('name, type, status, hypothesis, primary_metric, baseline_value, result_value, lift_percent, result, ice_score')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    // 4. Pull campaign data (ads with metrics)
    const { data: adRows } = await supabase
      .from('meta_ad_metrics_daily')
      .select(`
        meta_ad_id, date, impressions, clicks, spend, ctr, cpc, purchases, revenue, roas,
        meta_ads!inner(name, headline, body, image_url, cta_type, link_url, meta_adsets!inner(name, meta_campaigns!inner(name)))
      `)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(200);

    // 5. Pull product context
    const { data: productContext } = await supabase
      .from('product_context')
      .select('title, content, category')
      .eq('is_active', true)
      .in('category', ['product', 'business', 'launch'])
      .limit(10);

    // Build data summaries for the prompt
    const metricsData = metrics ?? [];
    const daysWithSpend = metricsData.filter(m => parseFloat(m.meta_spend) > 1);
    const daysWithOrders = metricsData.filter(m => m.shopify_orders > 0);
    const daysWithClarity = metricsData.filter(m => m.clarity_engagement_score != null);

    const totalSpend = daysWithSpend.reduce((s, m) => s + parseFloat(m.meta_spend), 0);
    const totalRevenue = metricsData.reduce((s, m) => s + parseFloat(m.shopify_revenue || '0'), 0);
    const totalOrders = metricsData.reduce((s, m) => s + (m.shopify_orders || 0), 0);
    const totalClicks = daysWithSpend.reduce((s, m) => s + (m.meta_clicks || 0), 0);
    const totalImpressions = daysWithSpend.reduce((s, m) => s + (m.meta_impressions || 0), 0);
    const avgClarity = daysWithClarity.length > 0
      ? daysWithClarity.reduce((s, m) => s + parseFloat(m.clarity_engagement_score), 0) / daysWithClarity.length
      : null;
    const avgATC = metricsData.filter(m => m.shopify_add_to_cart_rate != null);
    const avgATCRate = avgATC.length > 0
      ? avgATC.reduce((s, m) => s + parseFloat(m.shopify_add_to_cart_rate), 0) / avgATC.length
      : null;
    const avgCheckout = metricsData.filter(m => m.shopify_checkout_rate != null);
    const avgCheckoutRate = avgCheckout.length > 0
      ? avgCheckout.reduce((s, m) => s + parseFloat(m.shopify_checkout_rate), 0) / avgCheckout.length
      : null;

    // Build top days and worst days for context
    const orderDays = daysWithOrders.map(m => ({
      date: m.date,
      revenue: parseFloat(m.shopify_revenue),
      orders: m.shopify_orders,
      aov: parseFloat(m.shopify_aov),
      spend: parseFloat(m.meta_spend),
      clarity: m.clarity_engagement_score ? parseFloat(m.clarity_engagement_score) : null,
      rage_clicks: m.clarity_rage_clicks,
    }));

    // Ad performance summary
    type AdMetricRow = NonNullable<typeof adRows>[number];
    const adSummary = (adRows ?? []).slice(0, 50).map((r: AdMetricRow) => ({
      ad: r.meta_ad_id,
      date: r.date,
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      roas: r.roas,
      purchases: r.purchases,
    }));

    const userMessage = `Analyse the following marketing data and propose 3-5 ICE-scored experiments.

## METRICS SUMMARY (${days} days, ${metricsData.length} rows)
- Total spend: $${totalSpend.toFixed(2)} across ${daysWithSpend.length} days
- Total revenue: $${totalRevenue.toFixed(2)} from ${totalOrders} orders
- Blended ROAS: ${totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : 'N/A'}x
- Total impressions: ${totalImpressions.toLocaleString()}, clicks: ${totalClicks.toLocaleString()}
- CTR: ${totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : 'N/A'}%
- Click-to-purchase: ${totalClicks > 0 ? ((totalOrders / totalClicks) * 100).toFixed(2) : 'N/A'}%
- Avg Clarity engagement: ${avgClarity?.toFixed(1) ?? 'N/A'}/100
- Avg ATC rate: ${avgATCRate ? (avgATCRate * 100).toFixed(1) : 'N/A'}%
- Avg checkout rate: ${avgCheckoutRate ? (avgCheckoutRate * 100).toFixed(1) : 'N/A'}%
- ATC-to-checkout drop: ${avgATCRate && avgCheckoutRate ? ((1 - avgCheckoutRate / avgATCRate) * 100).toFixed(0) : 'N/A'}%

## ORDER DAYS (revenue-generating days)
${JSON.stringify(orderDays, null, 2)}

## AD PERFORMANCE (recent)
${JSON.stringify(adSummary.slice(0, 20), null, 2)}

## ACTIVE LEARNINGS (founder's context -- RESPECT THESE AS CONSTRAINTS)
${(learnings ?? []).map(l => `[${l.category}] ${l.learning}`).join('\n')}

## EXISTING EXPERIMENTS (avoid duplicates)
${(experiments ?? []).map(e => `[${e.status}] ${e.name} (${e.type}) - ${e.result || 'no result yet'}`).join('\n') || 'None'}

## PRODUCT CONTEXT
${(productContext ?? []).map(p => `[${p.category}] ${p.title}: ${p.content?.substring(0, 200)}`).join('\n') || 'Cold plunge brand, $1,990 AUD, UAE target market'}

Propose experiments that will have the highest impact on revenue. Be specific with copy and execution specs.`;

    // Call Claude API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        system: STRATEGY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error('Anthropic error:', errText);
      return NextResponse.json({ error: 'AI analysis failed', details: errText }, { status: 500 });
    }

    const anthropicData = await anthropicResponse.json();
    const rawContent = anthropicData.content?.[0]?.text ?? '';
    const usage = anthropicData.usage ?? { input_tokens: 0, output_tokens: 0 };

    // Parse response
    let parsed: { experiments: Array<Record<string, unknown>>; analysis_summary: string };
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse strategy JSON:', rawContent.substring(0, 500));
      return NextResponse.json({ error: 'AI returned invalid JSON', raw: rawContent.substring(0, 200) }, { status: 500 });
    }

    // Insert experiments into DB
    const insertedExperiments = [];
    for (const exp of parsed.experiments) {
      const { data: inserted, error: insertErr } = await supabase
        .from('marketing_experiments')
        .insert({
          user_id: userId,
          name: exp.name as string,
          type: exp.type as string,
          hypothesis: exp.hypothesis as string,
          primary_metric: exp.primary_metric as string,
          baseline_value: exp.baseline_value as number ?? null,
          target_metric_value: exp.target_metric_value as number ?? null,
          expected_lift_pct: exp.expected_lift_pct as number ?? null,
          ice_impact: exp.ice_impact as number,
          ice_confidence: exp.ice_confidence as number,
          ice_ease: exp.ice_ease as number,
          rationale: exp.rationale as string,
          execution_spec: exp.execution_spec as Record<string, unknown>,
          data_sources: exp.data_sources as string[],
          notes: exp.notes as string ?? null,
          status: 'draft',
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Insert experiment error:', insertErr);
        continue;
      }
      insertedExperiments.push(inserted);
    }

    // Log token usage
    const costUsd =
      (usage.input_tokens / 1_000_000) * 3.0 +
      (usage.output_tokens / 1_000_000) * 15.0;
    void supabase.from('ai_usage_log').insert({
      user_id: userId,
      operation: 'marketing_strategy_analysis',
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd,
    });

    return NextResponse.json({
      success: true,
      analysis_summary: parsed.analysis_summary,
      experiments: insertedExperiments,
      token_usage: usage,
    });
  } catch (err) {
    console.error('analyse-strategy POST error:', err);
    return NextResponse.json({ error: 'Strategy analysis failed' }, { status: 500 });
  }
}
