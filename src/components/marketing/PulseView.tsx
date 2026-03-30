'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, Search, MessageSquare, BarChart3, DollarSign, Users, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { MarketingMetricDaily, ExperimentType } from '@/types';

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
}

interface DiagnosisRule {
  id: string;
  label: string;
  check: (m: MarketingMetricDaily) => boolean;
  currentValue: (m: MarketingMetricDaily) => string;
  threshold: string;
  severity: 'critical' | 'warning';
  action: string;
  experiment_type: ExperimentType;
}

const RULES: DiagnosisRule[] = [
  {
    id: 'meta_ctr_low',
    label: 'Meta CTR below 1%',
    check: m => m.meta_ctr !== null && m.meta_ctr < 0.01,
    currentValue: m => m.meta_ctr != null ? `${(m.meta_ctr * 100).toFixed(2)}%` : '--',
    threshold: '< 1%',
    severity: 'critical',
    action: 'Creative fatigue — test new visual formats (UGC, static vs video, different hooks).',
    experiment_type: 'creative',
  },
  {
    id: 'roas_low',
    label: 'ROAS below 2x',
    check: m => m.meta_roas !== null && m.meta_roas < 2.0,
    currentValue: m => m.meta_roas != null ? `${Number(m.meta_roas).toFixed(1)}x` : '--',
    threshold: '< 2x',
    severity: 'critical',
    action: 'Pause scaling. Review audience overlap and creative mix before increasing budget.',
    experiment_type: 'audience',
  },
  {
    id: 'cpa_high',
    label: 'CPA above $50',
    check: m => m.meta_cost_per_purchase !== null && m.meta_cost_per_purchase > 50,
    currentValue: m => m.meta_cost_per_purchase != null ? `$${Number(m.meta_cost_per_purchase).toFixed(0)}` : '--',
    threshold: '> $50',
    severity: 'critical',
    action: 'Audience too broad or creative mismatch — test lookalike audiences from recent purchasers.',
    experiment_type: 'audience',
  },
  {
    id: 'add_to_cart_low',
    label: 'Add-to-cart below 3%',
    check: m => m.shopify_add_to_cart_rate !== null && m.shopify_add_to_cart_rate < 0.03,
    currentValue: m => m.shopify_add_to_cart_rate != null ? `${(m.shopify_add_to_cart_rate * 100).toFixed(1)}%` : '--',
    threshold: '< 3%',
    severity: 'warning',
    action: 'Landing page issue — split test product page CTA and hero imagery.',
    experiment_type: 'landing_page',
  },
  {
    id: 'conversion_low',
    label: 'Conversion rate below 2%',
    check: m => m.shopify_conversion_rate !== null && m.shopify_conversion_rate < 0.02,
    currentValue: m => m.shopify_conversion_rate != null ? `${(m.shopify_conversion_rate * 100).toFixed(1)}%` : '--',
    threshold: '< 2%',
    severity: 'warning',
    action: 'Checkout friction or pricing issue — review abandonment flow and offer.',
    experiment_type: 'offer',
  },
  {
    id: 'bounce_high',
    label: 'Bounce rate above 70%',
    check: m => m.ga_bounce_rate !== null && m.ga_bounce_rate > 0.70,
    currentValue: m => m.ga_bounce_rate != null ? `${(m.ga_bounce_rate * 100).toFixed(0)}%` : '--',
    threshold: '> 70%',
    severity: 'warning',
    action: 'Page losing visitors immediately — check load speed, above-fold content, mobile experience.',
    experiment_type: 'landing_page',
  },
];

function fmt(n: number | null | undefined, prefix = '', suffix = '', dec = 0): string {
  if (n == null || isNaN(n as number)) return '--';
  return `${prefix}${Number(n).toLocaleString('en-AU', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${suffix}`;
}

function GrowthBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null) return <span className="text-xs text-gray-400">--</span>;
  const up = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function SparkLine({ data, color = 'bg-indigo-400' }: { data: number[]; color?: string }) {
  if (!data.length) return <div className="h-8 bg-gray-50 rounded" />;
  const max = Math.max(...data, 0.001);
  return (
    <div className="flex items-end gap-px h-8">
      {data.map((v, i) => (
        <div key={i} className={`flex-1 rounded-t ${color} min-h-[2px]`}
          style={{ height: `${Math.round((v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function NorthStarCard({ icon, label, value, change, target, status, invertChange }: {
  icon: React.ReactNode; label: string; value: string;
  change: number | null; target?: string; status?: 'good' | 'warning' | 'bad'; invertChange?: boolean;
}) {
  const colors = { good: 'border-l-green-500', warning: 'border-l-amber-500', bad: 'border-l-red-500' };
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 border-l-4 ${status ? colors[status] : 'border-l-gray-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-gray-500 text-xs">{icon}{label}</div>
        <GrowthBadge pct={change} invert={invertChange} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {target && <div className="text-xs text-gray-400 mt-0.5">Target: {target}</div>}
    </div>
  );
}

interface Props {
  history: MarketingMetricDaily[];
  today: MarketingMetricDaily | null;
  onCreateExperiment: (type: ExperimentType) => void;
}

export function PulseView({ history, today, onCreateExperiment }: Props) {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const [{ data: trendsData }, { data: proposalsData }] = await Promise.all([
          supabase.rpc('get_marketing_trends', { days_back: 30 }),
          supabase.from('marketing_proposals')
            .select('id, proposal_type, title, reasoning, priority, status')
            .in('status', ['pending', 'approved'])
            .order('created_at', { ascending: false })
            .limit(5),
        ]);
        setTrends(trendsData as TrendsData);
        setProposals((proposalsData ?? []) as Proposal[]);
      } catch (err) {
        console.error('PulseView load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Diagnosis rules on today's data
  const alerts = today ? RULES.filter(r => r.check(today)) : [];

  const cp = trends?.current_period ?? {};
  const g = trends?.growth_vs_prior ?? {};
  const anomalies = trends?.anomalies ?? [];
  const brandData = trends?.brand_tracking ?? [];

  // Determine blended status
  const hasData = !!(cp.total_revenue || cp.total_spend);
  const revenue = Number(cp.total_revenue ?? 0);
  const spend = Number(cp.total_spend ?? 0);
  const blendedStatus: 'Profitable' | 'Break-even' | 'Losing' | null = !hasData ? null :
    spend === 0 ? (revenue > 0 ? 'Profitable' : null) :
    (revenue / spend) >= 2 ? 'Profitable' :
    (revenue / spend) >= 1 ? 'Break-even' : 'Losing';

  const statusColors = {
    Profitable: 'bg-green-100 text-green-700 border-green-200',
    'Break-even': 'bg-amber-100 text-amber-700 border-amber-200',
    Losing: 'bg-red-100 text-red-700 border-red-200',
  };

  const revenueData = history.slice(-30).map(d => d.shopify_revenue ?? 0);
  const roasData = history.slice(-30).map(d => d.meta_roas ?? 0);
  const cpaData = history.slice(-30).map(d => d.cpa ?? 0);
  const aovData = history.slice(-30).map(d => d.shopify_aov ?? 0);

  const roasStatus = (cp.avg_roas ?? 0) >= 3 ? 'good' : (cp.avg_roas ?? 0) >= 2 ? 'warning' : 'bad';
  const cpaStatus = (cp.avg_cpa ?? 0) === 0 ? undefined : (cp.avg_cpa ?? 999) < 50 ? 'good' : (cp.avg_cpa ?? 0) < 100 ? 'warning' : 'bad';

  if (loading) {
    return <div className="text-center py-16 text-sm text-gray-400">Loading pulse data...</div>;
  }

  return (
    <div className="space-y-5">

      {/* Hero status bar */}
      {hasData && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400">30-day period</div>
            {blendedStatus && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[blendedStatus]}`}>
                {blendedStatus}
              </span>
            )}
          </div>
          <div className="flex gap-6 text-sm flex-wrap">
            <div className="text-center">
              <div className="text-xs text-gray-400">Revenue</div>
              <div className="font-bold text-gray-900">{fmt(cp.total_revenue, '$')}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400">Ad Spend</div>
              <div className="font-bold text-gray-900">{fmt(spend, '$')}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400">ROAS</div>
              <div className={`font-bold ${(cp.avg_roas ?? 0) >= 3 ? 'text-green-700' : (cp.avg_roas ?? 0) >= 2 ? 'text-amber-700' : 'text-red-700'}`}>
                {fmt(cp.avg_roas, '', 'x', 2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400">CPA</div>
              <div className="font-bold text-gray-900">{fmt(cp.avg_cpa, '$', '', 2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts: anomalies + diagnosis rules */}
      {(anomalies.length > 0 || alerts.length > 0) && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Alerts
          </div>
          {anomalies.map((a, i) => (
            <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-red-700 font-medium">{a.metric.replace(/_/g, ' ')}</span>
              <span className="text-xs text-red-600">{a.value.toLocaleString()} ({a.direction} vs 7-day avg {a.avg_7d.toLocaleString()})</span>
            </div>
          ))}
          {alerts.map(rule => (
            <div key={rule.id} className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-3 ${
              rule.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div>
                <div className="text-xs font-semibold text-gray-800 mb-0.5">
                  {rule.severity === 'critical' ? '🔴' : '⚠️'} {rule.label}
                  <span className="ml-2 text-xs font-normal text-gray-500">({rule.currentValue(today!)})</span>
                </div>
                <div className="text-xs text-gray-600">{rule.action}</div>
              </div>
              <button
                onClick={() => onCreateExperiment(rule.experiment_type)}
                className="shrink-0 text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap"
              >
                + Test
              </button>
            </div>
          ))}
        </div>
      )}

      {/* North Star metrics */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">North Stars (30-day avg)</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <NorthStarCard icon={<DollarSign className="h-3.5 w-3.5" />} label="CPA" value={fmt(cp.avg_cpa, '$', '', 2)}
            change={g.cpa_change_pct as number | null} target="< $50" status={cpaStatus as 'good' | 'warning' | 'bad' | undefined} invertChange />
          <NorthStarCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="ROAS" value={fmt(cp.avg_roas, '', 'x', 2)}
            change={g.roas_change_pct as number | null} target="> 3x" status={roasStatus} />
          <NorthStarCard icon={<Users className="h-3.5 w-3.5" />} label="Profit / Customer"
            value={fmt(cp.avg_profit_per_customer, '$')} change={null} />
          <NorthStarCard icon={<Target className="h-3.5 w-3.5" />} label="Revenue Growth"
            value={g.revenue_change_pct != null ? `${(g.revenue_change_pct as number) >= 0 ? '+' : ''}${(g.revenue_change_pct as number).toFixed(1)}%` : '--'}
            change={g.revenue_change_pct as number | null} target="Accelerating" />
        </div>
      </div>

      {/* Sparkline trends */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">30-Day Trends</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Revenue', value: fmt(cp.total_revenue, '$'), data: revenueData, color: 'bg-green-400', change: g.revenue_change_pct as number | null },
            { label: 'ROAS', value: fmt(cp.avg_roas, '', 'x', 2), data: roasData, color: 'bg-indigo-400', change: g.roas_change_pct as number | null },
            { label: 'CPA', value: fmt(cp.avg_cpa, '$', '', 2), data: cpaData, color: 'bg-amber-400', change: g.cpa_change_pct as number | null, invert: true },
            { label: 'AOV', value: fmt(cp.avg_aov, '$'), data: aovData, color: 'bg-blue-400', change: null },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{s.label}</span>
                <GrowthBadge pct={s.change} invert={s.invert} />
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-2">{s.value}</div>
              <SparkLine data={s.data} color={s.color} />
            </div>
          ))}
        </div>
      </div>

      {/* Unit economics */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Unit Economics</div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            {[
              { label: 'Revenue/Day', value: fmt(cp.avg_daily_revenue, '$') },
              { label: 'Spend/Day', value: fmt(Number(cp.total_spend ?? 0) / Math.max(trends?.data_coverage.current_days_with_data ?? 1, 1), '$') },
              { label: 'Orders/Day', value: fmt(cp.avg_daily_orders, '', '', 1) },
              { label: 'AOV', value: fmt(cp.avg_aov, '$') },
              { label: 'Gross Margin', value: (() => {
                const rev = Number(cp.avg_daily_revenue ?? 0);
                const spendDay = Number(cp.total_spend ?? 0) / Math.max(trends?.data_coverage.current_days_with_data ?? 1, 1);
                return rev > 0 ? `${Math.round(((rev - spendDay) / rev) * 100)}%` : '--';
              })() },
            ].map(e => (
              <div key={e.label}>
                <div className="text-xs text-gray-400">{e.label}</div>
                <div className="text-lg font-bold text-gray-900">{e.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Proposals + Brand + Engagement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Agent Proposals */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Proposals</div>
            {proposals.filter(p => p.status === 'pending').length > 0 && (
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
              {proposals.map(p => (
                <div key={p.id} className="bg-white border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      p.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                      p.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-gray-50 text-gray-600 border-gray-200'
                    }`}>{p.priority.toUpperCase()}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">{p.title}</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{p.reasoning}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Brand + Engagement */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-3.5 w-3.5 text-blue-500" />
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand Health</div>
            </div>
            {brandData.length === 0 ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-400 text-center">
                Connect Google Search Console to see branded search volume.
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-3 py-2 font-medium">Term</th>
                      <th className="text-right px-3 py-2 font-medium">Impressions</th>
                      <th className="text-right px-3 py-2 font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandData.filter(b => b.term !== '_branded_total').map((b, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{b.term}</td>
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
              <BarChart3 className="h-3.5 w-3.5 text-teal-500" />
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Site Engagement</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Engagement', value: fmt(cp.avg_engagement, '', '/100') },
                  { label: 'Bounce', value: cp.avg_bounce_rate ? `${(Number(cp.avg_bounce_rate) * 100).toFixed(0)}%` : '--' },
                  { label: 'Conv.', value: cp.avg_conversion_rate ? `${(Number(cp.avg_conversion_rate) * 100).toFixed(2)}%` : '--' },
                  { label: 'CTR', value: cp.avg_ctr ? `${(Number(cp.avg_ctr) * 100).toFixed(2)}%` : '--' },
                ].map(e => (
                  <div key={e.label}>
                    <div className="text-xs text-gray-400">{e.label}</div>
                    <div className="text-base font-bold text-gray-900">{e.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-purple-500" />
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Feedback</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3">
              <div className="text-3xl font-bold text-gray-900">{trends?.recent_feedback_count ?? 0}</div>
              <div className="text-xs text-gray-500">responses in last 30 days</div>
            </div>
          </div>
        </div>
      </div>

      {/* Data freshness */}
      {trends?.latest_date && (
        <div className="text-xs text-gray-400">
          Latest data: {trends.latest_date}
          {(() => {
            const d = Math.floor((Date.now() - new Date(trends.latest_date).getTime()) / 86400000);
            if (d > 2) return <span className="text-amber-500 font-medium ml-2">({d} days stale)</span>;
            return null;
          })()}
          {' '}· {trends.data_coverage.current_days_with_data} days of data in period
        </div>
      )}
    </div>
  );
}
