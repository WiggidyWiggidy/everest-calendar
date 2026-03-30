'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, ChevronDown, ChevronRight, ExternalLink, Trophy, X, Minus } from 'lucide-react';
import type { CampaignIntelligenceData, SplitTestResult } from '@/types';

function fmt(n: number | null | undefined, prefix = '', suffix = '', dec = 1): string {
  if (n == null || isNaN(n as number)) return '--';
  return `${prefix}${Number(n).toLocaleString('en-AU', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${suffix}`;
}

function RoasBadge({ roas }: { roas: number }) {
  if (roas >= 3) return <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{roas.toFixed(1)}x</span>;
  if (roas >= 2) return <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{roas.toFixed(1)}x</span>;
  return <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{roas.toFixed(1)}x</span>;
}

function VerdictBadge({ verdict }: { verdict: 'winner' | 'loser' | 'inconclusive' }) {
  if (verdict === 'winner') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 border border-green-300 px-2 py-0.5 rounded-full">
      <Trophy className="h-3 w-3" /> WINNER
    </span>
  );
  if (verdict === 'loser') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
      <X className="h-3 w-3" /> LOSER
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
      <Minus className="h-3 w-3" /> INCONCLUSIVE
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const active = status === 'ACTIVE' || status === 'active';
  return <span className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-green-400' : 'bg-gray-300'}`} />;
}

function SplitTestCard({ test }: { test: SplitTestResult }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
        <div className="text-xs text-gray-400">{test.campaign_name}</div>
        <div className="text-sm font-semibold text-gray-800">{test.adset_name}</div>
      </div>
      <div className="p-4">
        <div className={`grid gap-3 ${test.ads.length === 2 ? 'grid-cols-2' : test.ads.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {test.ads.map(ad => (
            <div
              key={ad.meta_ad_id}
              className={`rounded-lg border p-3 ${
                ad.verdict === 'winner' ? 'border-green-300 bg-green-50/40' :
                ad.verdict === 'loser' ? 'border-red-200 bg-red-50/20' :
                'border-gray-200 bg-gray-50/40'
              }`}
            >
              {/* Image thumbnail */}
              {ad.image_url && (
                <div className="mb-2 rounded-md overflow-hidden bg-gray-100 h-24">
                  <img src={ad.image_url} alt={ad.name} className="w-full h-full object-cover" />
                </div>
              )}
              {!ad.image_url && (
                <div className="mb-2 rounded-md bg-gray-100 h-16 flex items-center justify-center text-gray-300 text-xs">No image</div>
              )}

              {/* Verdict */}
              <div className="mb-2">
                <VerdictBadge verdict={ad.verdict} />
              </div>

              {/* Creative copy */}
              {ad.headline && (
                <div className="text-xs font-semibold text-gray-800 mb-1 line-clamp-2">{ad.headline}</div>
              )}
              {ad.body && (
                <div className="text-xs text-gray-500 mb-2 line-clamp-3">{ad.body}</div>
              )}
              {ad.cta_type && (
                <div className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-2">
                  {ad.cta_type.replace(/_/g, ' ')}
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mt-2 border-t border-gray-200 pt-2">
                <div><span className="text-gray-400">ROAS</span> <span className="font-bold text-gray-800">{fmt(ad.metrics.roas, '', 'x', 2)}</span></div>
                <div><span className="text-gray-400">CPA</span> <span className="font-bold text-gray-800">{fmt(ad.metrics.cost_per_purchase, '$')}</span></div>
                <div><span className="text-gray-400">CTR</span> <span className="font-bold text-gray-800">{ad.metrics.ctr ? `${(ad.metrics.ctr * 100).toFixed(2)}%` : '--'}</span></div>
                <div><span className="text-gray-400">Spend</span> <span className="font-bold text-gray-800">{fmt(ad.metrics.spend, '$', '', 0)}</span></div>
                <div><span className="text-gray-400">Purchases</span> <span className="font-bold text-gray-800">{ad.metrics.purchases}</span></div>
                <div><span className="text-gray-400">Impressions</span> <span className="font-bold text-gray-800">{ad.metrics.impressions > 999 ? `${(ad.metrics.impressions/1000).toFixed(1)}k` : ad.metrics.impressions}</span></div>
              </div>

              {/* Landing page */}
              {ad.link_url && (
                <a href={ad.link_url} target="_blank" rel="noreferrer"
                   className="mt-2 flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 truncate">
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{ad.link_url.replace(/^https?:\/\//, '').slice(0, 40)}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DCEBreakdown({ data }: { data: CampaignIntelligenceData['dce_breakdown'] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (data.length === 0) return null;

  const typeLabels: Record<string, string> = {
    headline: 'Headlines',
    body: 'Body Copy',
    image: 'Images',
    call_to_action: 'CTAs',
  };

  return (
    <div className="space-y-3">
      {data.map(adDce => (
        <div key={adDce.meta_ad_id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setOpen(open === adDce.meta_ad_id ? null : adDce.meta_ad_id)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="text-sm font-medium text-gray-800">{adDce.ad_name}</div>
            {open === adDce.meta_ad_id ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>
          {open === adDce.meta_ad_id && (
            <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
              {Object.entries(adDce.elements).map(([type, items]) => (
                <div key={type}>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">
                    {typeLabels[type] ?? type}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-2 py-1.5 font-medium rounded-l">Creative</th>
                          <th className="text-right px-2 py-1.5 font-medium">Impressions</th>
                          <th className="text-right px-2 py-1.5 font-medium">CTR</th>
                          <th className="text-right px-2 py-1.5 font-medium">Purchases</th>
                          <th className="text-right px-2 py-1.5 font-medium rounded-r">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i} className={`border-t border-gray-50 ${i === 0 ? 'bg-green-50/40' : ''}`}>
                            <td className="px-2 py-2 text-gray-700 max-w-[180px]">
                              {i === 0 && <Trophy className="h-3 w-3 text-green-600 inline mr-1" />}
                              <span className="truncate">{item.label ?? item.value}</span>
                            </td>
                            <td className="px-2 py-2 text-right text-gray-600">{item.impressions.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right text-gray-600">{item.ctr ? `${(item.ctr * 100).toFixed(2)}%` : '--'}</td>
                            <td className="px-2 py-2 text-right text-gray-600">{item.purchases}</td>
                            <td className="px-2 py-2 text-right font-medium text-gray-800">{fmt(item.revenue, '$', '', 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WinningGallery({ creatives }: { creatives: CampaignIntelligenceData['top_creatives'] }) {
  if (creatives.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {creatives.map((c, i) => (
        <div key={c.meta_ad_id} className="bg-white border border-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">#{i + 1}</span>
            <RoasBadge roas={c.metrics.roas ?? 0} />
          </div>
          {c.image_url && (
            <div className="mb-2 rounded-md overflow-hidden bg-gray-100 h-28">
              <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
            </div>
          )}
          {c.headline && <div className="text-xs font-semibold text-gray-800 mb-1 line-clamp-2">{c.headline}</div>}
          {c.body && <div className="text-xs text-gray-500 mb-2 line-clamp-3">{c.body}</div>}
          <div className="grid grid-cols-3 gap-2 text-[10px] border-t border-gray-100 pt-2">
            <div className="text-center">
              <div className="text-gray-400">Spend</div>
              <div className="font-semibold text-gray-800">{fmt(c.metrics.spend, '$', '', 0)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Revenue</div>
              <div className="font-semibold text-gray-800">{fmt(c.metrics.revenue, '$', '', 0)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">CPA</div>
              <div className="font-semibold text-gray-800">{fmt(c.metrics.cost_per_purchase, '$')}</div>
            </div>
          </div>
          {c.link_url && (
            <a href={c.link_url} target="_blank" rel="noreferrer"
               className="mt-2 flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 truncate">
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{c.link_url.replace(/^https?:\/\//, '').slice(0, 35)}</span>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

type Section = 'campaigns' | 'split_tests' | 'dce' | 'top_creatives';

export function CampaignsView() {
  const [data, setData] = useState<CampaignIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [section, setSection] = useState<Section>('campaigns');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing/campaign-intelligence?days=${days}`);
      setData(await res.json());
    } catch (err) {
      console.error('CampaignsView load error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [days]);

  async function handleDiscoverCampaigns() {
    setSyncing(true);
    setSyncMsg('Discovering campaigns...');
    try {
      const r1 = await fetch('/api/marketing/sync/meta-campaigns', { method: 'POST' });
      const d1 = await r1.json();
      setSyncMsg(`Found ${d1.discovered?.campaigns ?? 0} campaigns, ${d1.discovered?.ads ?? 0} ads. Pulling metrics...`);
      const r2 = await fetch('/api/marketing/sync/meta-ad-insights', { method: 'POST' });
      const d2 = await r2.json();
      setSyncMsg(`Synced ${d2.synced ?? 0} metric rows. Reloading...`);
      await load();
      setSyncMsg('');
    } catch (err) {
      setSyncMsg(`Error: ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  const sections: { key: Section; label: string }[] = [
    { key: 'campaigns', label: 'Campaign Rankings' },
    { key: 'split_tests', label: `Split Tests${data?.split_tests.length ? ` (${data.split_tests.length})` : ''}` },
    { key: 'dce', label: 'Dynamic Creative' },
    { key: 'top_creatives', label: 'Winning Creatives' },
  ];

  const isEmpty = !loading && data && data.campaigns.length === 0;

  return (
    <div className="space-y-5">
      {/* Header + controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Campaign Intelligence</h2>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          {syncMsg && <div className="text-xs text-blue-600 mt-1">{syncMsg}</div>}
        </div>
        <button
          onClick={handleDiscoverCampaigns}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {syncing ? 'Syncing...' : 'Sync from Meta'}
        </button>
      </div>

      {/* Summary cards */}
      {data && data.campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Campaigns', value: data.campaigns.length.toString() },
            { label: 'Total Spend', value: fmt(data.campaigns.reduce((s, c) => s + c.spend, 0), '$', '', 0) },
            { label: 'Blended ROAS', value: (() => {
              const spend = data.campaigns.reduce((s, c) => s + c.spend, 0);
              const rev = data.campaigns.reduce((s, c) => s + c.revenue, 0);
              return spend > 0 ? `${(rev/spend).toFixed(1)}x` : '--';
            })() },
            { label: 'Split Tests', value: data.split_tests.length.toString() },
          ].map(card => (
            <div key={card.label} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="text-xs text-gray-500">{card.label}</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all ${
              section === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {isEmpty && !loading && (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-xl">
          <div className="text-gray-400 text-sm mb-3">No campaign data yet.</div>
          <div className="text-xs text-gray-400 mb-4">Click "Sync from Meta" to discover your campaigns, adsets, and ads.</div>
          <button
            onClick={handleDiscoverCampaigns}
            disabled={syncing}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Sync from Meta
          </button>
        </div>
      )}

      {!loading && data && data.campaigns.length > 0 && (
        <>
          {/* Campaign Rankings */}
          {section === 'campaigns' && (
            <div className="space-y-2">
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-medium">Campaign</th>
                      <th className="text-right px-3 py-2.5 font-medium">Spend</th>
                      <th className="text-right px-3 py-2.5 font-medium">Revenue</th>
                      <th className="text-right px-3 py-2.5 font-medium">ROAS</th>
                      <th className="text-right px-3 py-2.5 font-medium">CPA</th>
                      <th className="text-right px-3 py-2.5 font-medium">CTR</th>
                      <th className="text-right px-3 py-2.5 font-medium">Ads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c, i) => {
                      const isExpanded = expandedCampaigns.has(c.meta_campaign_id);
                      return (
                        <tr
                          key={c.meta_campaign_id}
                          className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50/80 ${
                            c.roas >= 3 ? 'bg-green-50/20' : c.roas < 1 && c.spend > 20 ? 'bg-red-50/20' : ''
                          }`}
                          onClick={() => setExpandedCampaigns(prev => {
                            const next = new Set(prev);
                            if (next.has(c.meta_campaign_id)) next.delete(c.meta_campaign_id);
                            else next.add(c.meta_campaign_id);
                            return next;
                          })}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                              <StatusDot status={c.status} />
                              <span className="font-medium text-gray-800 text-xs">{c.name}</span>
                              {i === 0 && c.roas > 0 && <Trophy className="h-3 w-3 text-amber-500" />}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{fmt(c.spend, '$', '', 0)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{fmt(c.revenue, '$', '', 0)}</td>
                          <td className="px-3 py-2.5 text-right"><RoasBadge roas={c.roas} /></td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{fmt(c.cost_per_purchase, '$')}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{c.ctr ? `${(c.ctr * 100).toFixed(2)}%` : '--'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{c.ad_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Split Tests */}
          {section === 'split_tests' && (
            <div className="space-y-4">
              {data.split_tests.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No split tests detected. Split tests appear when an adset has 2+ ads running simultaneously.
                </div>
              ) : (
                data.split_tests.map((test, i) => <SplitTestCard key={i} test={test} />)
              )}
            </div>
          )}

          {/* Dynamic Creative Breakdown */}
          {section === 'dce' && (
            <div>
              {data.dce_breakdown.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No dynamic creative ads found. DCE breakdown appears when Meta dynamic creative ads are running.
                </div>
              ) : (
                <DCEBreakdown data={data.dce_breakdown} />
              )}
            </div>
          )}

          {/* Winning Creatives */}
          {section === 'top_creatives' && (
            <div>
              {data.top_creatives.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No creative data yet.</div>
              ) : (
                <WinningGallery creatives={data.top_creatives} />
              )}
            </div>
          )}
        </>
      )}

      {/* Insights panel */}
      {data && data.insights.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">Insights</div>
          <ul className="space-y-2">
            {data.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-indigo-900">
                <span className="text-indigo-400 mt-0.5 shrink-0">→</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
