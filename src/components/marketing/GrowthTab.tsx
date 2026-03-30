'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Users, Target, Zap, AlertTriangle, BarChart3, MessageSquare, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { MarketingMetricDaily } from '@/types';

interface TrendsData {
  period_days: number;
  data_coverage: { current_days_with_data: number; prior_days_with_data: number };
  latest_date: string | null;
  latest_day: Record<string, number | null>;
  current_period: Record<string, number | null>;
  growth_vs_prior: Record<string, number | null>;
  anomalies: Array<{ metric: string; value: number; avg_7d: number; direction: string }>;
  brand_tracking: Array<{ term: string; source: string; latest_impressions: number; latest_clicks: number; avg_position: number | null }>;
  recent_feedback_count: number;
}

interface Proposal {
  id: string;
  proposal_type: string;
  title: string;
  reasoning: string;
  priority: string;
  status: string;
  created_at: string;
}

interface Props {
  history: MarketingMetricDaily[];
}

function fmt(n: number | null | undefined, prefix = '', suffix = '', decimals = 0): string {
  if (n == null) return '--';
  return `${prefix}${Number(n).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-gray-400">--</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function NorthStarCard({ icon, label, value, change, target, status }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: number | null;
  target?: string;
  status?: 'good' | 'warning' | 'bad';
}) {
  const statusColors = {
    good: 'border-l-green-500',
    warning: 'border-l-amber-500',
    bad: 'border-l-red-500',
  };
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 border-l-4 ${status ? statusColors[status] : 'border-l-gray-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-gray-500 text-xs">{icon}{label}</div>
        <GrowthBadge pct={change} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {target && <div className="text-xs text-gray-400 mt-0.5">Target: {target}</div>}
    </div>
  );
}

function SparkLine({ data, color = 'bg-indigo-400' }: { data: number[]; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 0.001);
  return (
    <div className="flex items-end gap-px h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t ${color} min-h-[2px]`}
          style={{ height: `${Math.round((v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const priorityColors: Record<string, string> = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  const typeLabels: Record<string, string> = {
    pause_ad: 'Pause Ad',
    scale_ad: 'Scale Ad',
    new_creative: 'New Creative',
    page_variant: 'Page Variant',
    new_blog: 'New Blog',
    budget_realloc: 'Reallocate Budget',
    new_experiment: 'New Experiment',
    new_campaign: 'New Campaign',
  };
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${priorityColors[proposal.priority] ?? priorityColors.low}`}>
          {proposal.priority.toUpperCase()}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
          {typeLabels[proposal.proposal_type] ?? proposal.proposal_type}
        </span>
      </div>
      <div className="text-sm font-medium text-gray-900">{proposal.title}</div>
      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{proposal.reasoning}</div>
    </div>
  );
}

export function GrowthTab({ history }: Props) {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();

        // Fetch trends via RPC
        const { data: trendsData } = await supabase.rpc('get_marketing_trends', { days_back: 30 });

        // Fetch recent proposals
        const { data: proposalsData } = await supabase
          .from('marketing_proposals')
          .select('id, proposal_type, title, reasoning, priority, status, created_at')
          .in('status', ['pending', 'approved'])
          .order('created_at', { ascending: false })
          .limit(5);

        setTrends(trendsData as TrendsData);
        setProposals((proposalsData ?? []) as Proposal[]);
      } catch (err) {
        console.error('GrowthTab load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading growth data...</div>;
  }

  const g = trends?.growth_vs_prior ?? {};
  const cp = trends?.current_period ?? {};

  const anomalies = trends?.anomalies ?? [];
  const brandData = trends?.brand_tracking ?? [];
  const feedbackCount = trends?.recent_feedback_count ?? 0;

  // Determine north star statuses
  const roasStatus = (cp.avg_roas ?? 0) >= 3 ? 'good' : (cp.avg_roas ?? 0) >= 2 ? 'warning' : 'bad';
  const cpaStatus = (cp.avg_cpa ?? 0) === 0 ? undefined : (cp.avg_cpa ?? 999) < 50 ? 'good' : (cp.avg_cpa ?? 0) < 100 ? 'warning' : 'bad';

  // Growth rate data for sparkline
  const revenueData = history.map(d => d.shopify_revenue ?? 0);
  const roasData = history.map(d => d.meta_roas ?? 0);
  const sessionsData = history.map(d => d.ga_sessions ?? 0);
  const cpaData = history.map(d => d.cpa ?? 0);

  return (
    <div className="space-y-5">
      {/* Anomaly alerts */}
      {anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            Anomalies Detected
          </div>
          {anomalies.map((a, i) => (
            <div key={i} className="text-sm text-red-600 ml-6">
              <span className="font-medium">{a.metric.replace(/_/g, ' ')}</span>: {a.value.toLocaleString()} ({a.direction} from 7-day avg {a.avg_7d.toLocaleString()})
            </div>
          ))}
        </div>
      )}

      {/* Data freshness */}
      {trends?.latest_date && (
        <div className="text-xs text-gray-400">
          Latest data: {trends.latest_date}
          {(() => {
            const days = Math.floor((Date.now() - new Date(trends.latest_date).getTime()) / 86400000);
            if (days > 2) return <span className="text-amber-500 font-medium ml-2">({days} days stale)</span>;
            return null;
          })()}
          {' '} | {trends.data_coverage.current_days_with_data} days of data in period
        </div>
      )}

      {/* North Star Metrics */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">North Stars (30-day avg)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <NorthStarCard
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="CPA"
            value={fmt(cp.avg_cpa, '$', '', 2)}
            change={g.cpa_change_pct as number | null}
            target="< $50"
            status={cpaStatus as 'good' | 'warning' | 'bad' | undefined}
          />
          <NorthStarCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="ROAS"
            value={fmt(cp.avg_roas, '', 'x', 2)}
            change={g.roas_change_pct as number | null}
            target="> 3x"
            status={roasStatus}
          />
          <NorthStarCard
            icon={<Users className="h-3.5 w-3.5" />}
            label="Profit / Customer"
            value={fmt(cp.avg_profit_per_customer, '$', '', 0)}
            change={null}
          />
          <NorthStarCard
            icon={<Target className="h-3.5 w-3.5" />}
            label="Revenue Growth"
            value={g.revenue_change_pct != null ? `${(g.revenue_change_pct as number) >= 0 ? '+' : ''}${(g.revenue_change_pct as number).toFixed(1)}%` : '--'}
            change={g.revenue_change_pct as number | null}
            target="Accelerating"
          />
        </div>
      </div>

      {/* Trend Sparklines */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">30-Day Trends</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Revenue</span>
              <GrowthBadge pct={g.revenue_change_pct as number | null} />
            </div>
            <div className="text-sm font-semibold">{fmt(cp.total_revenue, '$')}</div>
            <SparkLine data={revenueData} color="bg-green-400" />
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">ROAS</span>
              <GrowthBadge pct={g.roas_change_pct as number | null} />
            </div>
            <div className="text-sm font-semibold">{fmt(cp.avg_roas, '', 'x', 2)}</div>
            <SparkLine data={roasData} color="bg-indigo-400" />
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Sessions</span>
              <GrowthBadge pct={g.sessions_change_pct as number | null} />
            </div>
            <div className="text-sm font-semibold">{fmt(cp.avg_sessions, '', '/day', 0)}</div>
            <SparkLine data={sessionsData} color="bg-blue-400" />
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">CPA</span>
              <GrowthBadge pct={g.cpa_change_pct ? -(g.cpa_change_pct as number) : null} />
            </div>
            <div className="text-sm font-semibold">{fmt(cp.avg_cpa, '$', '', 2)}</div>
            <SparkLine data={cpaData} color="bg-amber-400" />
          </div>
        </div>
      </div>

      {/* Unit Economics */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Unit Economics (30-day)</h2>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-400">Revenue/Day</div>
              <div className="text-lg font-bold text-gray-900">{fmt(cp.avg_daily_revenue, '$')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Ad Spend/Day</div>
              <div className="text-lg font-bold text-gray-900">{fmt(Number(cp.total_spend ?? 0) / Math.max(trends?.data_coverage.current_days_with_data ?? 1, 1), '$')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Orders/Day</div>
              <div className="text-lg font-bold text-gray-900">{fmt(cp.avg_daily_orders, '', '', 1)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">AOV</div>
              <div className="text-lg font-bold text-gray-900">{fmt(cp.avg_aov, '$')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Gross Margin</div>
              <div className="text-lg font-bold text-gray-900">
                {cp.avg_daily_revenue && Number(cp.total_spend ?? 0) > 0
                  ? `${Math.round(((Number(cp.avg_daily_revenue) - Number(cp.total_spend ?? 0) / Math.max(trends?.data_coverage.current_days_with_data ?? 1, 1)) / Number(cp.avg_daily_revenue)) * 100)}%`
                  : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column: Proposals + Brand Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Agent Proposals */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Proposals</h2>
            {proposals.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                {proposals.filter(p => p.status === 'pending').length} pending
              </span>
            )}
          </div>
          {proposals.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center text-sm text-gray-400">
              No proposals yet. The marketing agent generates these daily.
            </div>
          ) : (
            <div className="space-y-2">
              {proposals.map(p => <ProposalCard key={p.id} proposal={p} />)}
            </div>
          )}
        </div>

        {/* Brand Health + Feedback */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-3.5 w-3.5 text-blue-500" />
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand Health</h2>
            </div>
            {brandData.length === 0 ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center text-sm text-gray-400">
                No brand tracking data yet. Configure Google Search Console to see branded search volume.
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="text-left px-3 py-2 font-medium">Search Term</th>
                      <th className="text-right px-3 py-2 font-medium">Impressions</th>
                      <th className="text-right px-3 py-2 font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandData.filter(b => b.term !== '_branded_total').map((b, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-700 font-medium">{b.term}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{b.latest_impressions.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{b.latest_clicks.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{b.avg_position?.toFixed(1) ?? '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-purple-500" />
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Feedback</h2>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold text-gray-900">{feedbackCount}</div>
                <div className="text-xs text-gray-500">responses in last 30 days</div>
              </div>
              {feedbackCount === 0 && (
                <div className="text-xs text-gray-400 mt-2">
                  Set up post-purchase surveys (Klaviyo) or WhatsApp lead ads to start collecting feedback.
                </div>
              )}
            </div>
          </div>

          {/* Engagement Health */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-3.5 w-3.5 text-teal-500" />
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Site Engagement</h2>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-xs text-gray-400">Engagement</div>
                  <div className="text-lg font-bold">{fmt(cp.avg_engagement, '', '/100', 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Bounce Rate</div>
                  <div className="text-lg font-bold">{cp.avg_bounce_rate ? `${(Number(cp.avg_bounce_rate) * 100).toFixed(1)}%` : '--'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Conversion</div>
                  <div className="text-lg font-bold">{cp.avg_conversion_rate ? `${(Number(cp.avg_conversion_rate) * 100).toFixed(2)}%` : '--'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">CTR</div>
                  <div className="text-lg font-bold">{cp.avg_ctr ? `${(Number(cp.avg_ctr) * 100).toFixed(2)}%` : '--'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
