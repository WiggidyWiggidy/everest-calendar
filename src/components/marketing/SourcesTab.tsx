'use client';

import { useState } from 'react';
import { ShoppingBag, BarChart3, Globe, MousePointerClick } from 'lucide-react';

interface SourceStatus {
  connected: boolean;
  missing: string[];
}

interface SourcesData {
  shopify: SourceStatus;
  meta: SourceStatus;
  google_analytics: SourceStatus;
  clarity: SourceStatus;
}

const SOURCE_CONFIG = [
  {
    key: 'shopify' as const,
    name: 'Shopify',
    icon: <ShoppingBag className="h-5 w-5" />,
    color: 'text-green-600',
    bg: 'bg-green-50',
    vars: [
      { name: 'SHOPIFY_STORE_URL', example: 'yourstore.myshopify.com' },
      { name: 'SHOPIFY_ACCESS_TOKEN', example: 'shpat_xxxxxxxxxxxx' },
    ],
    metrics: ['Revenue', 'Orders', 'AOV', 'Add-to-Cart Rate', 'Conversion Rate', 'Sessions'],
    docs: 'Shopify Admin → Apps → Private apps → Create new private app → Enable read access for Orders and Analytics.',
  },
  {
    key: 'meta' as const,
    name: 'Meta Ads',
    icon: <BarChart3 className="h-5 w-5" />,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    vars: [
      { name: 'META_ACCESS_TOKEN', example: 'EAAxxxxxxxxxxxx' },
      { name: 'META_AD_ACCOUNT_ID', example: 'act_1234567890' },
    ],
    metrics: ['Spend', 'Impressions', 'CTR', 'CPM', 'CPC', 'ROAS', 'Purchases', 'Cost per Purchase'],
    docs: 'Meta Business Suite → Settings → Business Settings → System Users → Add system user → Generate token with ads_read permission.',
  },
  {
    key: 'google_analytics' as const,
    name: 'Google Analytics',
    icon: <Globe className="h-5 w-5" />,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    vars: [
      { name: 'GA_PROPERTY_ID', example: '123456789' },
      { name: 'GA_SERVICE_ACCOUNT_JSON', example: '{"type":"service_account",...}' },
    ],
    metrics: ['Sessions', 'Users', 'New Users', 'Bounce Rate', 'Avg Session Duration', 'Conversion Rate'],
    docs: 'Google Cloud Console → Create service account → Grant "Viewer" role → Download JSON key → Add service account email to GA4 property.',
  },
  {
    key: 'clarity' as const,
    name: 'Microsoft Clarity',
    icon: <MousePointerClick className="h-5 w-5" />,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    vars: [
      { name: 'CLARITY_PROJECT_ID', example: 'abc123xyz' },
      { name: 'CLARITY_API_TOKEN', example: 'Bearer xxxxxxxxx' },
    ],
    metrics: ['Engagement Score', 'Rage Clicks', 'Dead Clicks', 'Avg Scroll Depth'],
    docs: 'Clarity Dashboard → Settings → API → Generate API token. Project ID is in the Clarity URL.',
  },
] as const;

interface Props {
  sources: SourcesData | null;
  onMockLoaded: () => void;
}

export function SourcesTab({ sources, onMockLoaded }: Props) {
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);

  async function handleSeedMock() {
    if (!confirm('This will overwrite any existing mock data for the last 30 days. Continue?')) return;
    setSeeding(true);
    try {
      const res = await fetch('/api/marketing/seed-mock', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSeedDone(true);
      onMockLoaded();
    } catch (err) {
      alert('Failed to seed mock data: ' + (err instanceof Error ? err.message : 'unknown error'));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Mock data CTA */}
      <div className="bg-indigo-600 text-white rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold text-sm">Try it with mock data</div>
          <div className="text-xs text-indigo-200 mt-0.5">
            Loads 30 days of realistic data so you can explore the dashboard before connecting live sources.
          </div>
        </div>
        <button
          onClick={handleSeedMock}
          disabled={seeding}
          className="shrink-0 bg-white text-indigo-600 hover:bg-indigo-50 font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-60 whitespace-nowrap"
        >
          {seeding ? 'Loading…' : seedDone ? '✓ Loaded' : '📊 Load Mock Data'}
        </button>
      </div>

      {seedDone && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          ✅ 30 days of mock data loaded — switch to the <strong>Overview</strong> or <strong>Insights</strong> tab to see it.
        </div>
      )}

      {/* Source cards */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Sources</div>
        {SOURCE_CONFIG.map(source => {
          const status = sources?.[source.key];
          const connected = status?.connected ?? false;

          return (
            <div key={source.key} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className={`p-2 rounded-lg ${source.bg} ${source.color}`}>
                  {source.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">{source.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                      connected
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}>
                      {connected ? '● Connected' : '○ Not connected'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Pulls: {source.metrics.join(' · ')}
                  </div>
                </div>
              </div>

              {!connected && (
                <div className="border-t border-gray-50 px-4 py-3 bg-gray-50 space-y-2">
                  <div className="text-xs font-medium text-gray-600">To connect, add these to Vercel Environment Variables:</div>
                  <div className="space-y-1.5">
                    {source.vars.map(v => (
                      <div key={v.name} className="flex items-baseline gap-2">
                        <code className="text-xs bg-white border border-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                          {v.name}
                        </code>
                        <span className="text-xs text-gray-400">e.g. {v.example}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 pt-1">{source.docs}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        Once env vars are added in Vercel, the next sync will automatically pull real data into the metrics table. No code changes needed.
      </div>
    </div>
  );
}
