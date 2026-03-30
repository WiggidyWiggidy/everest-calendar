import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CampaignIntelligenceData, SplitTestResult, SplitTestVerdict } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 90);

    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    // ── 1. Campaigns with aggregated metrics ──────────────────────────────────
    const { data: campaigns } = await supabase
      .from('meta_campaigns')
      .select('meta_campaign_id, name, status, objective')
      .eq('user_id', user.id);

    const { data: adsetRows } = await supabase
      .from('meta_adsets')
      .select('meta_adset_id, meta_campaign_id, name, status')
      .eq('user_id', user.id);

    const { data: adRows } = await supabase
      .from('meta_ads')
      .select('meta_ad_id, meta_adset_id, name, status, headline, body, image_url, thumbnail_url, link_url, cta_type, is_dynamic_creative, asset_feed_spec')
      .eq('user_id', user.id);

    const { data: metricsRows } = await supabase
      .from('meta_ad_metrics_daily')
      .select('meta_ad_id, date, impressions, clicks, spend, ctr, purchases, revenue, roas, cost_per_purchase')
      .gte('date', since);

    // ── 2. Build lookup maps ──────────────────────────────────────────────────
    const adsetByCampaign = new Map<string, typeof adsetRows>(); // campaign_id → adsets
    for (const a of adsetRows ?? []) {
      const arr = adsetByCampaign.get(a.meta_campaign_id) ?? [];
      arr.push(a);
      adsetByCampaign.set(a.meta_campaign_id, arr);
    }

    const adByAdset = new Map<string, typeof adRows>(); // adset_id → ads
    for (const ad of adRows ?? []) {
      const arr = adByAdset.get(ad.meta_adset_id) ?? [];
      arr.push(ad);
      adByAdset.set(ad.meta_adset_id, arr);
    }

    // Aggregate metrics per ad over the period
    const adMetrics = new Map<string, {
      spend: number; impressions: number; clicks: number;
      purchases: number; revenue: number; days: number;
    }>();
    for (const m of metricsRows ?? []) {
      const cur = adMetrics.get(m.meta_ad_id) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: 0 };
      cur.spend += m.spend ?? 0;
      cur.impressions += m.impressions ?? 0;
      cur.clicks += m.clicks ?? 0;
      cur.purchases += m.purchases ?? 0;
      cur.revenue += m.revenue ?? 0;
      cur.days++;
      adMetrics.set(m.meta_ad_id, cur);
    }

    // ── 3. Campaign rankings ──────────────────────────────────────────────────
    const campaignRankings = (campaigns ?? []).map(c => {
      const adsets = adsetByCampaign.get(c.meta_campaign_id) ?? [];
      let spend = 0, revenue = 0, purchases = 0, impressions = 0, clicks = 0, adCount = 0;

      for (const as of adsets) {
        const ads = adByAdset.get(as.meta_adset_id) ?? [];
        adCount += ads.length;
        for (const ad of ads) {
          const m = adMetrics.get(ad.meta_ad_id);
          if (m) {
            spend += m.spend;
            revenue += m.revenue;
            purchases += m.purchases;
            impressions += m.impressions;
            clicks += m.clicks;
          }
        }
      }

      return {
        meta_campaign_id: c.meta_campaign_id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
        purchases,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cost_per_purchase: purchases > 0 ? spend / purchases : 0,
        adset_count: adsets.length,
        ad_count: adCount,
      };
    }).sort((a, b) => b.roas - a.roas);

    // ── 4. Split test results ─────────────────────────────────────────────────
    const splitTests: SplitTestResult[] = [];

    for (const [adsetId, ads] of Array.from(adByAdset)) {
      if ((ads?.length ?? 0) < 2) continue;

      const adset = adsetRows?.find(a => a.meta_adset_id === adsetId);
      const campaign = campaigns?.find(c => {
        const asets = adsetByCampaign.get(c.meta_campaign_id) ?? [];
        return asets.some(a => a.meta_adset_id === adsetId);
      });

      type AdRow = NonNullable<typeof adRows>[0];
      const adsWithMetrics = (ads ?? []).map((ad: AdRow) => {
        const m = adMetrics.get(ad.meta_ad_id) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: 0 };
        return {
          ...ad,
          metrics: {
            spend: m.spend,
            impressions: m.impressions,
            clicks: m.clicks,
            ctr: m.impressions > 0 ? m.clicks / m.impressions : 0,
            purchases: m.purchases,
            revenue: m.revenue,
            roas: m.spend > 0 ? m.revenue / m.spend : 0,
            cost_per_purchase: m.purchases > 0 ? m.spend / m.purchases : 0,
          },
        };
      }).sort((a: { metrics: { roas: number } }, b: { metrics: { roas: number } }) => b.metrics.roas - a.metrics.roas);

      // Assign verdicts
      const topRoas = adsWithMetrics[0]?.metrics.roas ?? 0;
      const withVerdicts = adsWithMetrics.map((ad: typeof adsWithMetrics[0], i: number) => {
        let verdict: SplitTestVerdict;
        if (ad.metrics.impressions < 1000) {
          verdict = 'inconclusive';
        } else if (i === 0 && topRoas > 0) {
          verdict = 'winner';
        } else {
          verdict = 'loser';
        }
        return { ...ad, verdict };
      });

      splitTests.push({
        adset_name: adset?.name ?? adsetId,
        adset_id: adsetId,
        campaign_name: campaign?.name ?? 'Unknown Campaign',
        ads: withVerdicts.map(ad => ({
          meta_ad_id: ad.meta_ad_id,
          name: ad.name,
          headline: ad.headline,
          body: ad.body,
          image_url: ad.image_url,
          cta_type: ad.cta_type,
          link_url: ad.link_url,
          verdict: ad.verdict,
          metrics: ad.metrics,
        })),
      });
    }

    // ── 5. DCE breakdown ──────────────────────────────────────────────────────
    const dceAdIds = (adRows ?? []).filter(a => a.is_dynamic_creative).map(a => a.meta_ad_id);
    const dceBreakdown: CampaignIntelligenceData['dce_breakdown'] = [];

    if (dceAdIds.length > 0) {
      const { data: dceRows } = await supabase
        .from('meta_dce_metrics')
        .select('meta_ad_id, element_type, element_value, element_label, impressions, clicks, spend, ctr, purchases, revenue')
        .in('meta_ad_id', dceAdIds)
        .gte('date', since);

      // Group by ad then by element_type
      const dceByAd = new Map<string, Map<string, Array<{
        value: string; label: string | null;
        impressions: number; clicks: number; spend: number;
        ctr: number; purchases: number; revenue: number;
      }>>>();

      for (const row of dceRows ?? []) {
        if (!dceByAd.has(row.meta_ad_id)) dceByAd.set(row.meta_ad_id, new Map());
        const byType = dceByAd.get(row.meta_ad_id)!;
        if (!byType.has(row.element_type)) byType.set(row.element_type, []);
        byType.get(row.element_type)!.push({
          value: row.element_value,
          label: row.element_label,
          impressions: row.impressions ?? 0,
          clicks: row.clicks ?? 0,
          spend: row.spend ?? 0,
          ctr: row.ctr ?? 0,
          purchases: row.purchases ?? 0,
          revenue: row.revenue ?? 0,
        });
      }

      for (const [adId, byType] of Array.from(dceByAd)) {
        const ad = adRows?.find(a => a.meta_ad_id === adId);
        const elements: Record<string, typeof dceBreakdown[0]['elements'][string]> = {};
        for (const [type, items] of Array.from(byType)) {
          elements[type] = items.sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue);
        }
        dceBreakdown.push({
          meta_ad_id: adId,
          ad_name: ad?.name ?? adId,
          elements,
        });
      }
    }

    // ── 6. Top creatives ─────────────────────────────────────────────────────
    const allAdsWithMetrics = (adRows ?? []).map(ad => {
      const m = adMetrics.get(ad.meta_ad_id);
      return { ad, metrics: m };
    }).filter(x => x.metrics && x.metrics.spend > 0)
      .sort((a, b) => (b.metrics!.revenue / Math.max(b.metrics!.spend, 0.01)) - (a.metrics!.revenue / Math.max(a.metrics!.spend, 0.01)))
      .slice(0, 5);

    const topCreatives = allAdsWithMetrics.map(({ ad, metrics: m }) => ({
      ...ad,
      is_dynamic_creative: ad.is_dynamic_creative ?? false,
      asset_feed_spec: ad.asset_feed_spec,
      created_at: '',
      updated_at: '',
      id: ad.meta_ad_id,
      user_id: user.id,
      creative_id: null,
      metrics: {
        id: '',
        meta_ad_id: ad.meta_ad_id,
        date: since,
        impressions: m!.impressions,
        clicks: m!.clicks,
        spend: m!.spend,
        ctr: m!.impressions > 0 ? m!.clicks / m!.impressions : 0,
        cpc: m!.clicks > 0 ? m!.spend / m!.clicks : null,
        cpm: m!.impressions > 0 ? (m!.spend / m!.impressions) * 1000 : null,
        purchases: m!.purchases,
        revenue: m!.revenue,
        roas: m!.spend > 0 ? m!.revenue / m!.spend : null,
        cost_per_purchase: m!.purchases > 0 ? m!.spend / m!.purchases : null,
        created_at: '',
      },
    }));

    // ── 7. Funnel data ────────────────────────────────────────────────────────
    const { data: funnelRows } = await supabase
      .from('shopify_funnel_daily')
      .select('checkouts_started, checkouts_completed, checkouts_abandoned, abandonment_rate, abandoned_value')
      .eq('user_id', user.id)
      .gte('date', since);

    let funnel: CampaignIntelligenceData['funnel'] = null;
    if (funnelRows && funnelRows.length > 0) {
      const totals = funnelRows.reduce((acc, r) => ({
        checkouts_started: acc.checkouts_started + (r.checkouts_started ?? 0),
        checkouts_completed: acc.checkouts_completed + (r.checkouts_completed ?? 0),
        checkouts_abandoned: acc.checkouts_abandoned + (r.checkouts_abandoned ?? 0),
        abandoned_value: acc.abandoned_value + (r.abandoned_value ?? 0),
      }), { checkouts_started: 0, checkouts_completed: 0, checkouts_abandoned: 0, abandoned_value: 0 });

      // Account-level totals from marketing_metrics_daily
      const { data: mktgRows } = await supabase
        .from('marketing_metrics_daily')
        .select('meta_impressions, meta_clicks')
        .eq('user_id', user.id)
        .gte('date', since);

      const impressions = (mktgRows ?? []).reduce((s, r) => s + (r.meta_impressions ?? 0), 0);
      const clicks = (mktgRows ?? []).reduce((s, r) => s + (r.meta_clicks ?? 0), 0);

      funnel = {
        impressions,
        clicks,
        ...totals,
        abandonment_rate: totals.checkouts_started > 0
          ? totals.checkouts_abandoned / totals.checkouts_started
          : 0,
      };
    }

    // ── 8. Rules-based insights ───────────────────────────────────────────────
    const insights: string[] = [];

    if (campaignRankings.length > 0) {
      const best = campaignRankings[0];
      const worst = campaignRankings[campaignRankings.length - 1];
      if (best.roas > 3) insights.push(`"${best.name}" is your top campaign at ${best.roas.toFixed(1)}x ROAS — consider increasing its budget.`);
      if (worst.roas < 1 && worst.spend > 50) insights.push(`"${worst.name}" has ${worst.roas.toFixed(1)}x ROAS with $${worst.spend.toFixed(0)} spent — pause it.`);
    }

    for (const test of splitTests) {
      const winner = test.ads.find(a => a.verdict === 'winner');
      const losers = test.ads.filter(a => a.verdict === 'loser');
      if (winner && losers.length > 0) {
        const roasDiff = ((winner.metrics.roas - losers[0].metrics.roas) / Math.max(losers[0].metrics.roas, 0.01) * 100).toFixed(0);
        insights.push(`In "${test.adset_name}", "${winner.headline ?? winner.name}" outperforms by ${roasDiff}% ROAS.`);
      }
    }

    if (funnel && funnel.abandonment_rate > 0.7) {
      insights.push(`Checkout abandonment is ${(funnel.abandonment_rate * 100).toFixed(0)}% — $${funnel.abandoned_value.toFixed(0)} left in carts. Priority: checkout optimisation.`);
    }

    const highCtrLowRoas = (adRows ?? []).filter(ad => {
      const m = adMetrics.get(ad.meta_ad_id);
      return m && (m.clicks / Math.max(m.impressions, 1)) > 0.02 && m.spend > 0 && (m.revenue / m.spend) < 1.5;
    });
    if (highCtrLowRoas.length > 0) {
      insights.push(`${highCtrLowRoas.length} ad(s) have high CTR but low ROAS — the ad is working but the landing page isn't converting. Split test the page next.`);
    }

    if (insights.length === 0) {
      insights.push('Not enough data yet. Run meta-campaigns sync then meta-ad-insights sync to populate campaign data.');
    }

    const result: CampaignIntelligenceData = {
      campaigns: campaignRankings,
      split_tests: splitTests,
      dce_breakdown: dceBreakdown,
      top_creatives: topCreatives,
      funnel,
      insights,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('campaign-intelligence error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
