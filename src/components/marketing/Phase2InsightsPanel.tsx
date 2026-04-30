'use client';

// Phase 2 Insights Panel — Tom's data-driven decision view.
// Drops into PulseView (or any tab) and surfaces:
//  - KPI anomalies (which metrics are drifting vs baseline)
//  - Next-experiment ICE-ranked queue (what to test next)
//  - Running experiments + statistical significance
//  - Top friction elements (where users get stuck)
//  - Recent per-ad attribution (channel-agnostic)
//
// All data comes from /api/marketing/insights (Phase 2 RPC + table aggregator).

import { useEffect, useState } from 'react';

type Anomaly = {
  metric_name: string;
  current_value: number | null;
  baseline_mean: number | null;
  baseline_stddev: number | null;
  z_score: number | null;
  severity: string;
  direction: string;
  sample_n: number;
};

type NextExperiment = {
  rank_position: number;
  proposal_source: string;
  proposed_target_metric: string;
  proposed_hypothesis: string;
  proposed_ice_impact: number;
  proposed_ice_confidence: number;
  proposed_ice_ease: number;
  proposed_expected_lift_pct: number;
  graveyard_warning: string | null;
};

type RunningExperiment = {
  id: string;
  name: string;
  target_metric: string | null;
  primary_metric: string | null;
  status: string;
  ice_score: number | null;
  expected_lift_pct: number | null;
  significance: {
    out_status: string;
    out_lift_pct: number | null;
    out_p_value: number | null;
    out_n_sessions_control: number;
    out_n_sessions_treatment: number;
  } | null;
};

type Friction = {
  date: string;
  page_url: string;
  rage_click_count: number;
  dead_click_count: number;
  rage_click_zscore: number | null;
};

type AdMetric = {
  date: string;
  channel: string;
  channel_ad_id: string;
  spend: number;
  attributed_orders: number;
  attributed_revenue: number;
  attributed_roas: number | null;
};

type Insights = {
  anomalies: Anomaly[];
  next_experiments: NextExperiment[];
  running_experiments: RunningExperiment[];
  top_friction_elements: Friction[];
  recent_ad_metrics: AdMetric[];
};

const SEVERITY_COLOR: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_COLOR: Record<string, string> = {
  no_data: 'bg-gray-100 text-gray-700',
  needs_more_data: 'bg-blue-100 text-blue-800',
  inconclusive: 'bg-gray-100 text-gray-800',
  significant_winner: 'bg-green-100 text-green-800',
  significant_loser: 'bg-red-100 text-red-800',
};

function fmt(value: number | null | undefined, kind: 'pct' | 'num' | 'money' | 'roas' = 'num'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (kind === 'pct') return `${(value * 100).toFixed(2)}%`;
  if (kind === 'money') return `$${value.toFixed(2)}`;
  if (kind === 'roas') return `${value.toFixed(2)}x`;
  return value.toString();
}

export function Phase2InsightsPanel() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/marketing/insights')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-500">Loading insights…</div>;
  if (error) return <div className="p-6 text-red-600">Insights error: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Anomalies row — which KPIs are off baseline */}
      <section>
        <h2 className="text-lg font-semibold mb-3">KPI Pulse vs 60-day baseline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.anomalies.map(a => (
            <div key={a.metric_name} className={`p-3 rounded border ${SEVERITY_COLOR[a.severity] ?? ''}`}>
              <div className="text-xs uppercase tracking-wide text-gray-600">{a.metric_name}</div>
              <div className="text-xl font-semibold mt-1">
                {fmt(a.current_value, a.metric_name.includes('rate') ? 'pct' : a.metric_name.includes('roas') ? 'roas' : a.metric_name.includes('cpa') || a.metric_name.includes('aov') ? 'money' : 'num')}
              </div>
              <div className="text-xs text-gray-700 mt-1">
                baseline {fmt(a.baseline_mean, a.metric_name.includes('rate') ? 'pct' : a.metric_name.includes('roas') ? 'roas' : a.metric_name.includes('cpa') || a.metric_name.includes('aov') ? 'money' : 'num')}
              </div>
              <div className="text-xs mt-1">
                z={a.z_score ?? '—'} · {a.direction} · n={a.sample_n}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Next experiment queue */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Next experiment queue (ICE-scored)</h2>
        {data.next_experiments.length === 0 ? (
          <div className="text-gray-500 text-sm">No proposals — collect more funnel data first.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Target metric</th>
                  <th className="px-3 py-2 text-left">Hypothesis</th>
                  <th className="px-3 py-2 text-right">ICE (I·C·E)</th>
                  <th className="px-3 py-2 text-right">Expected lift</th>
                  <th className="px-3 py-2 text-left">Graveyard</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.next_experiments.map(e => (
                  <tr key={e.rank_position}>
                    <td className="px-3 py-2 font-mono">{e.rank_position}</td>
                    <td className="px-3 py-2">{e.proposal_source}</td>
                    <td className="px-3 py-2"><code className="text-xs bg-gray-100 px-1 rounded">{e.proposed_target_metric}</code></td>
                    <td className="px-3 py-2 max-w-md">{e.proposed_hypothesis}</td>
                    <td className="px-3 py-2 text-right font-mono">{e.proposed_ice_impact}·{e.proposed_ice_confidence}·{e.proposed_ice_ease}</td>
                    <td className="px-3 py-2 text-right">{e.proposed_expected_lift_pct}%</td>
                    <td className="px-3 py-2 text-xs text-orange-700">{e.graveyard_warning ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Running experiments + significance */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Running experiments</h2>
        {data.running_experiments.length === 0 ? (
          <div className="text-gray-500 text-sm">No experiments running.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Target metric</th>
                  <th className="px-3 py-2 text-right">ICE</th>
                  <th className="px-3 py-2 text-left">Significance</th>
                  <th className="px-3 py-2 text-right">Lift</th>
                  <th className="px-3 py-2 text-right">p-value</th>
                  <th className="px-3 py-2 text-right">n (C / T)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.running_experiments.map(e => {
                  const sig = e.significance;
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2">{e.name}</td>
                      <td className="px-3 py-2"><code className="text-xs bg-gray-100 px-1 rounded">{e.target_metric ?? e.primary_metric}</code></td>
                      <td className="px-3 py-2 text-right font-mono">{e.ice_score?.toFixed?.(1) ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLOR[sig?.out_status ?? 'no_data'] ?? ''}`}>
                          {sig?.out_status ?? 'no_data'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{sig?.out_lift_pct != null ? `${sig.out_lift_pct}%` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{sig?.out_p_value ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">{sig ? `${sig.out_n_sessions_control} / ${sig.out_n_sessions_treatment}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top friction elements */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Top friction elements (Clarity)</h2>
        {data.top_friction_elements.length === 0 ? (
          <div className="text-gray-500 text-sm">No friction data yet (Clarity sync runs daily).</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.top_friction_elements.map((f, i) => (
              <li key={`${f.date}-${f.page_url}-${i}`} className="flex justify-between border-b py-1">
                <span className="truncate max-w-md">{f.page_url}</span>
                <span className="text-gray-700">
                  rage <span className="font-mono">{f.rage_click_count}</span> · dead <span className="font-mono">{f.dead_click_count}</span> · z={f.rage_click_zscore ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent per-ad attribution */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent per-ad attribution (last 7 days)</h2>
        {data.recent_ad_metrics.length === 0 ? (
          <div className="text-gray-500 text-sm">No attributed ad metrics yet — Meta billing pending or pixel not firing.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Ad ID</th>
                  <th className="px-3 py-2 text-right">Spend</th>
                  <th className="px-3 py-2 text-right">Orders</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recent_ad_metrics.slice(0, 20).map((m, i) => (
                  <tr key={`${m.date}-${m.channel_ad_id}-${i}`}>
                    <td className="px-3 py-2 font-mono text-xs">{m.date}</td>
                    <td className="px-3 py-2">{m.channel}</td>
                    <td className="px-3 py-2 font-mono text-xs truncate max-w-[160px]">{m.channel_ad_id}</td>
                    <td className="px-3 py-2 text-right">{fmt(m.spend, 'money')}</td>
                    <td className="px-3 py-2 text-right">{m.attributed_orders}</td>
                    <td className="px-3 py-2 text-right">{fmt(m.attributed_revenue, 'money')}</td>
                    <td className="px-3 py-2 text-right">{fmt(m.attributed_roas, 'roas')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
