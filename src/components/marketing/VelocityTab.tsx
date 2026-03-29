'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Pause, Zap } from 'lucide-react';

interface VelocityData {
  ads_live: number;
  ads_paused: number;
  total_spend_7d: number;
  total_revenue_7d: number;
  overall_roas: number;
  pages_testing: number;
  blogs_published_7d: number;
  proposals_pending: number;
  experiments_running: number;
  top_ad: { headline: string; roas: number } | null;
  worst_ad: { headline: string; roas: number } | null;
}

export function VelocityTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VelocityData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch velocity metrics from multiple endpoints
        const [adsRes, metricsRes, pagesRes, proposalsRes, experimentsRes] = await Promise.all([
          fetch('/api/marketing/ads/create').then(r => r.json()).catch(() => ({ creatives: [] })),
          fetch('/api/marketing/metrics?days=7').then(r => r.json()).catch(() => ({ metrics: [] })),
          fetch('/api/marketing/landing-pages').then(r => r.json()).catch(() => ({ pages: [] })),
          fetch('/api/marketing/proposals').then(r => r.json()).catch(() => ({ proposals: [] })),
          fetch('/api/marketing/experiments').then(r => r.json()).catch(() => ({ experiments: [] })),
        ]);

        const creatives = adsRes.creatives ?? [];
        const metrics = metricsRes.metrics ?? [];
        const pages = pagesRes.pages ?? [];
        const proposals = proposalsRes.proposals ?? [];
        const experiments = experimentsRes.experiments ?? [];

        const liveAds = creatives.filter((c: { status: string }) => c.status === 'live');
        const pausedAds = creatives.filter((c: { status: string }) => c.status === 'paused');

        const spend7d = metrics.reduce((s: number, m: { meta_spend?: number }) => s + (m.meta_spend || 0), 0);
        const revenue7d = metrics.reduce((s: number, m: { shopify_revenue?: number }) => s + (m.shopify_revenue || 0), 0);

        // Find best and worst performing ads
        const adsWithMetrics = creatives.filter((c: { metrics?: { roas?: number } }) => c.metrics?.roas !== undefined);
        const sortedByRoas = adsWithMetrics.sort((a: { metrics: { roas: number } }, b: { metrics: { roas: number } }) =>
          (b.metrics?.roas || 0) - (a.metrics?.roas || 0)
        );

        setData({
          ads_live: liveAds.length,
          ads_paused: pausedAds.length,
          total_spend_7d: spend7d,
          total_revenue_7d: revenue7d,
          overall_roas: spend7d > 0 ? revenue7d / spend7d : 0,
          pages_testing: pages.filter((p: { status: string }) => p.status === 'testing' || p.status === 'monitoring').length,
          blogs_published_7d: pages.filter((p: { page_type?: string }) => p.page_type === 'blog').length,
          proposals_pending: proposals.filter((p: { status: string }) => p.status === 'pending').length,
          experiments_running: experiments.filter((e: { status: string }) => e.status === 'running').length,
          top_ad: sortedByRoas[0] ? { headline: sortedByRoas[0].headline, roas: sortedByRoas[0].metrics?.roas } : null,
          worst_ad: sortedByRoas.length > 1 ? { headline: sortedByRoas[sortedByRoas.length - 1].headline, roas: sortedByRoas[sortedByRoas.length - 1].metrics?.roas } : null,
        });
      } catch (err) {
        console.error('Velocity load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }

  if (!data) {
    return <p className="text-sm text-gray-500 py-8 text-center">No velocity data available yet. Run your first experiments to see results here.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Experiment Velocity</h2>
        <p className="text-sm text-gray-500 mt-1">How fast you're testing and what's winning.</p>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Live Ads" value={data.ads_live} icon={<Zap className="h-4 w-4 text-green-500" />} />
        <MetricCard label="Paused Ads" value={data.ads_paused} icon={<Pause className="h-4 w-4 text-gray-400" />} />
        <MetricCard label="Pages Testing" value={data.pages_testing} icon={<TrendingUp className="h-4 w-4 text-blue-500" />} />
        <MetricCard label="Experiments" value={data.experiments_running} icon={<TrendingUp className="h-4 w-4 text-indigo-500" />} />
      </div>

      {/* Financial summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">7-Day Performance</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">Ad Spend</p>
            <p className="text-xl font-bold text-gray-900">${data.total_spend_7d.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Revenue</p>
            <p className="text-xl font-bold text-gray-900">${data.total_revenue_7d.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">ROAS</p>
            <p className={`text-xl font-bold ${data.overall_roas >= 3 ? 'text-green-600' : data.overall_roas >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
              {data.overall_roas.toFixed(1)}x
            </p>
          </div>
        </div>
      </div>

      {/* Winners and losers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.top_ad && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700 uppercase">Top Performer</span>
            </div>
            <p className="text-sm font-medium text-gray-900">{data.top_ad.headline}</p>
            <p className="text-lg font-bold text-green-700">{data.top_ad.roas?.toFixed(1)}x ROAS</p>
          </div>
        )}
        {data.worst_ad && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <span className="text-xs font-semibold text-red-700 uppercase">Underperformer</span>
            </div>
            <p className="text-sm font-medium text-gray-900">{data.worst_ad.headline}</p>
            <p className="text-lg font-bold text-red-700">{data.worst_ad.roas?.toFixed(1)}x ROAS</p>
          </div>
        )}
      </div>

      {/* Pending proposals */}
      {data.proposals_pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800">
            {data.proposals_pending} proposal{data.proposals_pending !== 1 ? 's' : ''} waiting for your approval.
          </p>
          <p className="text-xs text-amber-600 mt-1">Check your inbox or the Proposals section.</p>
        </div>
      )}

      {/* Velocity summary */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">This Week</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{data.ads_live + data.ads_paused}</p>
            <p className="text-xs text-gray-500">Ad variations tested</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{data.pages_testing}</p>
            <p className="text-xs text-gray-500">Page variants live</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{data.blogs_published_7d}</p>
            <p className="text-xs text-gray-500">Blog posts</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{data.proposals_pending}</p>
            <p className="text-xs text-gray-500">Pending actions</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
