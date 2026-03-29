'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, Pause, Play, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdCreative, AdTemplate } from '@/types';

const STATUS_COLORS: { [key: string]: string } = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  live: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-gray-100 text-gray-500',
};

interface AdWithMetrics extends AdCreative {
  ad_metrics_daily: {
    date: string;
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number | null;
    roas: number | null;
    purchases: number;
  }[];
}

export function AdsTab() {
  const [creatives, setCreatives] = useState<AdWithMetrics[]>([]);
  const [templates, setTemplates] = useState<AdTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [creativesRes, templatesRes] = await Promise.all([
          fetch('/api/marketing/ads/create'),
          fetch('/api/marketing/ads/templates'),
        ]);
        const [creativesData, templatesData] = await Promise.all([
          creativesRes.json(),
          templatesRes.json(),
        ]);
        setCreatives(creativesData.creatives ?? []);
        setTemplates(templatesData.templates ?? []);
      } catch (err) {
        console.error('AdsTab load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Calculate totals from metrics
  let totalSpend = 0;
  let totalPurchases = 0;
  let totalRevenue = 0;
  let liveCount = 0;
  for (const c of creatives) {
    if (c.status === 'live') liveCount++;
    const metrics = c.ad_metrics_daily ?? [];
    for (const m of metrics) {
      totalSpend += m.spend;
      totalPurchases += m.purchases;
      if (m.roas) totalRevenue += m.spend * m.roas;
    }
  }
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">Live Ads</p>
          <p className="text-2xl font-bold mt-1">{liveCount}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">Total Spend</p>
          <p className="text-2xl font-bold mt-1">${totalSpend.toFixed(2)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">Purchases</p>
          <p className="text-2xl font-bold mt-1">{totalPurchases}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">ROAS</p>
          <p className="text-2xl font-bold mt-1">{overallRoas.toFixed(2)}x</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Ad Creatives ({creatives.length})
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Creative
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateCreativeForm
          templates={templates}
          onCreated={(c) => {
            setCreatives(prev => [c, ...prev]);
            setShowCreate(false);
          }}
        />
      )}

      {/* Creative cards */}
      {creatives.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed">
          <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No ad creatives yet</p>
          <p className="text-xs text-gray-400 mt-1">Create your first ad to start split testing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {creatives.map(creative => {
            const metrics = creative.ad_metrics_daily ?? [];
            const latestMetric = metrics[metrics.length - 1];
            const totalCreativeSpend = metrics.reduce((s, m) => s + m.spend, 0);
            const totalCreativeClicks = metrics.reduce((s, m) => s + m.clicks, 0);
            const totalCreativeImpressions = metrics.reduce((s, m) => s + m.impressions, 0);

            return (
              <div key={creative.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm truncate">
                        {creative.headline || 'Untitled Creative'}
                      </h4>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        STATUS_COLORS[creative.status] || STATUS_COLORS.draft
                      )}>
                        {creative.status}
                      </span>
                    </div>
                    {creative.body_copy && (
                      <p className="text-xs text-gray-500 line-clamp-1">{creative.body_copy}</p>
                    )}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {creative.composite_image_url && (
                    <img
                      src={creative.composite_image_url}
                      alt={creative.headline || 'Ad'}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                  )}
                </div>

                {/* Metrics */}
                {metrics.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t">
                    <div>
                      <p className="text-xs text-gray-400">Spend</p>
                      <p className="text-sm font-semibold">${totalCreativeSpend.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Impressions</p>
                      <p className="text-sm font-semibold">{totalCreativeImpressions.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Clicks</p>
                      <p className="text-sm font-semibold">{totalCreativeClicks}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">CTR</p>
                      <p className="text-sm font-semibold">
                        {latestMetric?.ctr ? `${(latestMetric.ctr * 100).toFixed(2)}%` : '-'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  {creative.status === 'live' && (
                    <button className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700">
                      <Pause className="h-3 w-3" /> Pause
                    </button>
                  )}
                  {creative.status === 'paused' && (
                    <button className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700">
                      <Play className="h-3 w-3" /> Resume
                    </button>
                  )}
                  {creative.meta_ad_id && (
                    <span className="text-xs text-gray-400 ml-auto">Meta ID: {creative.meta_ad_id}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Create creative form ────────────────────────────────────────────────────

function CreateCreativeForm({
  templates,
  onCreated,
}: {
  templates: AdTemplate[];
  onCreated: (creative: AdWithMetrics) => void;
}) {
  const [headline, setHeadline] = useState('');
  const [bodyCopy, setBodyCopy] = useState('');
  const [ctaText, setCtaText] = useState('Shop Now');
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!headline) return;
    setSaving(true);
    try {
      const res = await fetch('/api/marketing/ads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline,
          body_copy: bodyCopy,
          cta_text: ctaText,
          template_id: templateId || undefined,
        }),
      });
      // For now, just create a local record since Meta push needs credentials
      // In production this would create via Meta API
      if (res.ok) {
        const data = await res.json();
        if (data.creatives?.[0]) {
          onCreated(data.creatives[0]);
        }
      }
    } catch (err) {
      console.error('Create creative error:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border">
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Headline</label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g., Transform Your Recovery"
          className="w-full text-sm border rounded-lg px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Body Copy</label>
        <textarea
          value={bodyCopy}
          onChange={(e) => setBodyCopy(e.target.value)}
          placeholder="Ad body text..."
          className="w-full text-sm border rounded-lg px-3 py-2 h-20 resize-none"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600 block mb-1">CTA</label>
          <input
            type="text"
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-2"
          />
        </div>
        {templates.length > 0 && (
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full text-sm border rounded-lg px-3 py-2"
            >
              <option value="">No template</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.format})</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={saving || !headline}
        className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? 'Creating...' : 'Create Creative'}
      </button>
    </form>
  );
}
