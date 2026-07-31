'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Target, AlertTriangle, FlaskConical, BookOpen, Copy as CopyIcon, ExternalLink, Gauge, Sparkles, Flame } from 'lucide-react';

interface Bottleneck {
  landing_page_id: string | null;
  lp_name: string | null;
  shopify_url: string | null;
  sessions_30d: number | null;
  funnel_step: string;
  actual_rate: number | null;
  benchmark_rate: number;
  gap_absolute: number | null;
  gap_pct_below_benchmark: number | null;
  gap_state: 'on_target' | 'mild_gap' | 'significant_gap' | 'critical_gap' | 'insufficient_data';
}

interface FrictionSection {
  date: string;
  page_url: string;
  section_id: string;
  click_count: number;
  rage_click_count: number;
  dead_click_count: number;
  scroll_abandon_count: number;
  unique_sessions: number;
  landing_page_id: string | null;
}

interface ProposedExperiment {
  rank: number;
  funnel_step: string;
  hypothesis: string;
  source_section_id: string | null;
  source_page_url: string | null;
  rage_click_count: number;
  estimated_lift_pct: number;
  implementation_ease: number;
  ice: { impact: number; confidence: number; ease: number; score: number; raw_lift_pct?: number };
  ice_score: number;
  suggested_angle: string;
  evidence: Record<string, unknown>;
}

interface RunningExperiment {
  id: string;
  name: string;
  target_metric: string;
  status: string;
  start_date: string | null;
  ice_impact: number | null;
  ice_confidence: number | null;
  ice_ease: number | null;
  ice_score: number | null;
  expected_lift_pct: number | null;
  hypothesis: string | null;
  significance?: { lift_pct: number | null; p_value: number | null; status: string } | null;
}

interface Learning {
  id: number;
  experiment_id: string;
  predicted_lift_pct: number | null;
  actual_lift_pct: number | null;
  confidence_calibration_delta: number | null;
  notes: string | null;
  recorded_at: string;
}

interface VelocityPayload {
  week_start: string;
  tests_started_this_week: number;
  tests_completed_this_week: number;
  tests_decided_this_week: number;
  tests_started_prior4w_avg: number;
  creatives_this_week: number;
  creatives_prior4w_avg: number;
  weekly_target: number;
  on_pace: boolean;
  gap_to_target: number;
  history: { week_start: string; n_started: number; n_completed: number; n_decided: number }[];
}

interface DCTAsset {
  date: string;
  meta_ad_id: string | null;
  asset_type: string | null;
  asset_text: string | null;
  asset_image_url: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  purchases: number | null;
  revenue: number | null;
  roas: number | null;
}

interface FatigueSignal {
  angle: string;
  ctr_recent_14d: number | null;
  ctr_prior_14d: number | null;
  ctr_change_pct: number | null;
  impressions_recent_14d: number | null;
  fatigue_state: 'fresh' | 'softening' | 'fatigued' | 'insufficient_data';
}

interface InsightsPayload {
  computed_at: string;
  bottleneck: Bottleneck | null;
  bottlenecks_all: Bottleneck[];
  top_friction_sections: FrictionSection[];
  proposed_lp_experiments: ProposedExperiment[];
  running_experiments: RunningExperiment[];
  recent_learnings: Learning[];
  velocity: VelocityPayload | null;
  dct: { assets_total: number; top_assets_7d: DCTAsset[]; perf_data_present: boolean };
  fatigue_signals: FatigueSignal[];
  errors?: Record<string, string | null>;
}

const GAP_STYLE: Record<Bottleneck['gap_state'], string> = {
  on_target:        'bg-green-100 text-green-700 border-green-200',
  mild_gap:         'bg-amber-100 text-amber-700 border-amber-200',
  significant_gap:  'bg-orange-100 text-orange-700 border-orange-200',
  critical_gap:     'bg-red-100 text-red-700 border-red-200',
  insufficient_data:'bg-gray-100 text-gray-500 border-gray-200',
};

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—';
  return (n * 100).toFixed(digits) + '%';
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function ICEScore({ impact, confidence, ease, score }: { impact: number; confidence: number; ease: number; score: number }) {
  const color = score >= 60 ? 'bg-green-100 text-green-700 border-green-200'
    : score >= 30 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${color}`}
      title={`Impact ${impact}/10 · Confidence ${confidence}/10 · Ease ${ease}/10`}
    >
      ICE {Math.round(score)}
      <span className="font-normal opacity-70">({impact}·{confidence}·{ease})</span>
    </span>
  );
}

function VelocityPanel({ v }: { v: VelocityPayload | null }) {
  if (!v) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 text-gray-500">
          <Gauge className="h-4 w-4" />
          <span className="text-sm font-medium">Velocity unavailable</span>
        </div>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((v.tests_started_this_week / Math.max(1, v.weekly_target)) * 100));
  const barColor = v.on_pace ? 'bg-green-500'
    : v.tests_started_this_week >= v.weekly_target * 0.6 ? 'bg-amber-500'
    : 'bg-red-500';
  const trend = v.tests_started_this_week - v.tests_started_prior4w_avg;
  // Render a 12-week sparkline as inline SVG
  const max = Math.max(1, ...v.history.map(h => h.n_started));
  const w = 200, h = 32;
  const step = v.history.length > 1 ? w / (v.history.length - 1) : w;
  const path = v.history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)},${(h - (p.n_started / max) * h).toFixed(1)}`)
    .join(' ');
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900">Test velocity (this week)</h3>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
          v.on_pace ? 'bg-green-100 text-green-700 border-green-200'
          : 'bg-amber-100 text-amber-700 border-amber-200'
        }`}>
          {v.on_pace ? 'on pace' : `${v.gap_to_target} short of target`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-[11px] text-gray-400">Started</div>
          <div className="text-2xl font-bold text-gray-900">{v.tests_started_this_week}<span className="text-sm text-gray-400 font-normal">/{v.weekly_target}</span></div>
          <div className="text-[10px] text-gray-400 mt-0.5">prior 4w avg {v.tests_started_prior4w_avg}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Completed</div>
          <div className="text-2xl font-bold text-gray-900">{v.tests_completed_this_week}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{v.tests_decided_this_week} decided</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Creatives</div>
          <div className="text-2xl font-bold text-gray-900">{v.creatives_this_week}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">prior 4w avg {v.creatives_prior4w_avg}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Trend</div>
          <div className={`text-2xl font-bold ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">vs 4w avg</div>
        </div>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="text-[11px] text-gray-400">12-week trend (tests started)</div>
        <svg width={w} height={h} className="text-blue-500">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {v.history.map((p, i) => (
            <circle key={p.week_start} cx={(i * step).toFixed(1)} cy={(h - (p.n_started / max) * h).toFixed(1)} r="1.5" fill="currentColor" />
          ))}
        </svg>
      </div>
      <p className="text-[10px] text-gray-400 mt-3">
        Velocity is the north-star metric. More tests/week beats bigger tests. Target tunable in <code>get_test_velocity(p_weekly_target)</code>.
      </p>
    </div>
  );
}

function DCTPanel({ dct, fatigue }: { dct: InsightsPayload['dct']; fatigue: FatigueSignal[] }) {
  const fresh = fatigue.filter(f => f.fatigue_state === 'fresh').length;
  const fatigued = fatigue.filter(f => f.fatigue_state === 'fatigued').length;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-900">Meta creative testing</h3>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-[11px] text-gray-400">DCT assets synced</div>
          <div className="text-xl font-bold text-gray-900">{dct.assets_total.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Fresh angles</div>
          <div className="text-xl font-bold text-green-600">{fresh}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Fatigued angles</div>
          <div className="text-xl font-bold text-red-600 inline-flex items-center gap-1">
            {fatigued}
            {fatigued > 0 && <Flame className="h-4 w-4" />}
          </div>
        </div>
      </div>
      {!dct.perf_data_present ? (
        <p className="text-xs text-gray-400">
          DCT assets are syncing ({dct.assets_total.toLocaleString()} stored), but per-asset performance is empty.
          Run <code className="text-gray-500">/api/marketing/sync/meta-dce</code> to populate <code className="text-gray-500">meta_asset_performance_daily</code> — once that has rows, top headlines/images by ROAS appear here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium pb-2">Asset</th>
              <th className="text-right font-medium pb-2">Spend</th>
              <th className="text-right font-medium pb-2">CTR</th>
              <th className="text-right font-medium pb-2">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {dct.top_assets_7d.slice(0, 5).map((a, i) => (
              <tr key={`${a.meta_ad_id}-${i}`} className="border-b border-gray-50 last:border-0">
                <td className="py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">{a.asset_type ?? 'asset'}</div>
                  <div className="text-sm text-gray-900 truncate max-w-md">{a.asset_text ?? a.asset_image_url?.slice(-40) ?? '—'}</div>
                </td>
                <td className="text-right text-gray-600">${a.spend?.toFixed(2) ?? '—'}</td>
                <td className="text-right text-gray-600">{a.ctr != null ? (a.ctr * 100).toFixed(2) + '%' : '—'}</td>
                <td className="text-right font-semibold text-gray-900">{a.roas?.toFixed(2) ?? '—'}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {fatigue.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Angle fatigue (14d vs prior 14d)</div>
          <div className="flex flex-wrap gap-2">
            {fatigue.map(f => {
              const color = f.fatigue_state === 'fatigued' ? 'bg-red-100 text-red-700 border-red-200'
                : f.fatigue_state === 'softening' ? 'bg-amber-100 text-amber-700 border-amber-200'
                : f.fatigue_state === 'fresh' ? 'bg-green-100 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200';
              return (
                <span key={f.angle} className={`text-[11px] px-2 py-0.5 rounded border ${color}`}
                  title={f.ctr_change_pct != null ? `CTR change ${f.ctr_change_pct.toFixed(1)}%` : 'no comparable data'}>
                  {f.angle}{f.ctr_change_pct != null ? ` (${f.ctr_change_pct >= 0 ? '+' : ''}${f.ctr_change_pct.toFixed(0)}%)` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BottleneckPanel({ b }: { b: Bottleneck | null }) {
  if (!b) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 text-gray-500">
          <Target className="h-4 w-4" />
          <span className="text-sm font-medium">No bottleneck detected</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          All KRYO landing pages either hit benchmark or have insufficient sessions (under 50 in last 30 days).
          Add traffic, then revisit.
        </p>
      </div>
    );
  }
  const stepLabel = b.funnel_step === 'add_to_cart' ? 'Add-to-cart'
    : b.funnel_step === 'checkout_init' ? 'Checkout init'
    : 'Purchase';
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Biggest domino</div>
          <div className="text-2xl font-bold text-gray-900">{stepLabel}</div>
          <div className="text-sm text-gray-500 mt-0.5">{b.lp_name ?? b.shopify_url ?? 'Unknown page'}</div>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${GAP_STYLE[b.gap_state]}`}>
          {b.gap_state.replace('_', ' ')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] text-gray-400">Actual</div>
          <div className="font-semibold text-gray-900">{fmtPct(b.actual_rate, 2)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Benchmark</div>
          <div className="font-semibold text-gray-600">{fmtPct(b.benchmark_rate, 0)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Gap below</div>
          <div className="font-semibold text-red-600">
            {b.gap_pct_below_benchmark == null ? '—' : `${b.gap_pct_below_benchmark.toFixed(0)}%`}
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-400">
        {fmtNum(b.sessions_30d)} sessions in last 30 days. Industry medians: ATC 8% · Checkout init 60% of ATC · Purchase 50% of checkout.
      </div>
    </div>
  );
}

function FrictionPanel({ rows }: { rows: FrictionSection[] }) {
  if (!rows.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Top friction sections (last 7 days)</h3>
        </div>
        <p className="text-xs text-gray-400">
          Section pixel deployed but no events captured yet. Wait 24h after deploy or visit a /products/* page to seed data.
        </p>
      </div>
    );
  }
  // De-dupe by (page_url, section_id), summing across days
  const agg = new Map<string, FrictionSection & { total_rage: number; total_clicks: number; total_sessions: number }>();
  for (const r of rows) {
    const k = `${r.page_url}::${r.section_id}`;
    const cur = agg.get(k);
    if (!cur) {
      agg.set(k, { ...r, total_rage: r.rage_click_count, total_clicks: r.click_count, total_sessions: r.unique_sessions });
    } else {
      cur.total_rage += r.rage_click_count;
      cur.total_clicks += r.click_count;
      cur.total_sessions += r.unique_sessions;
    }
  }
  const sorted = Array.from(agg.values()).sort((a, b) => b.total_rage - a.total_rage).slice(0, 5);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-gray-900">Top friction sections (last 7 days)</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="text-left font-medium pb-2">Section</th>
            <th className="text-right font-medium pb-2">Rage</th>
            <th className="text-right font-medium pb-2">Clicks</th>
            <th className="text-right font-medium pb-2">Sessions</th>
            <th className="text-right font-medium pb-2">Rage/sess</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const ratio = r.total_sessions > 0 ? (r.total_rage / r.total_sessions) : 0;
            const handle = r.page_url.split('/products/')[1]?.split('?')[0]?.slice(0, 24);
            return (
              <tr key={`${r.page_url}::${r.section_id}`} className="border-b border-gray-50 last:border-0">
                <td className="py-2">
                  <div className="font-medium text-gray-900 text-sm">{r.section_id}</div>
                  <div className="text-[11px] text-gray-400">/products/{handle}</div>
                </td>
                <td className="text-right font-semibold text-red-600">{fmtNum(r.total_rage)}</td>
                <td className="text-right text-gray-600">{fmtNum(r.total_clicks)}</td>
                <td className="text-right text-gray-600">{fmtNum(r.total_sessions)}</td>
                <td className="text-right font-mono text-xs text-gray-500">{ratio.toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProposedPanel({ rows }: { rows: ProposedExperiment[] }) {
  const [copiedAngle, setCopiedAngle] = useState<string | null>(null);

  function copyLaunchCommand(angle: string) {
    navigator.clipboard.writeText(`/launch-kryo-v2 ${angle}`).catch(() => {});
    setCopiedAngle(angle);
    setTimeout(() => setCopiedAngle(prev => prev === angle ? null : prev), 1500);
  }

  if (!rows.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Proposed experiments</h3>
        </div>
        <p className="text-xs text-gray-400">
          No proposals yet. Section friction needs to accumulate (run a test with traffic, then revisit) or set up the GA4 sync so funnel_bottlenecks is populated.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-900">Proposed experiments — ICE-ranked</h3>
      </div>
      <div className="space-y-3">
        {rows.map((p) => {
          const evidence = p.evidence as Record<string, unknown> | null;
          const evSource = (evidence?.source as string) ?? 'unknown';
          return (
            <div key={`${p.rank}-${p.source_section_id ?? p.source_page_url}`} className="border border-gray-100 rounded-md p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400">#{p.rank}</span>
                  <ICEScore impact={p.ice.impact} confidence={p.ice.confidence} ease={p.ice.ease} score={p.ice.score} />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{p.funnel_step.replace('_', ' ')}</span>
                </div>
                <button
                  onClick={() => copyLaunchCommand(p.suggested_angle)}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  title="Copy /launch-kryo-v2 command"
                >
                  <CopyIcon className="h-3 w-3" />
                  {copiedAngle === p.suggested_angle ? 'copied' : `/launch-kryo-v2 ${p.suggested_angle}`}
                </button>
              </div>
              <p className="text-sm text-gray-700 leading-snug">{p.hypothesis}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                <span>Est. lift {p.estimated_lift_pct}%</span>
                <span>·</span>
                <span>Source: {evSource}</span>
                {p.source_section_id && (
                  <>
                    <span>·</span>
                    <span>Section <code className="text-gray-500">{p.source_section_id}</code></span>
                  </>
                )}
                {p.rage_click_count > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-red-500">{p.rage_click_count} rage clicks (7d)</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunningPanel({ rows }: { rows: RunningExperiment[] }) {
  if (!rows.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Running tests</h3>
        <p className="text-xs text-gray-400">No experiments currently running.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Running tests ({rows.length})</h3>
      <div className="space-y-3">
        {rows.map((e) => {
          const sig = e.significance;
          const variantUrl = (e.hypothesis && (e as unknown as { execution_spec?: { variant_url?: string } }).execution_spec?.variant_url)
            ?? null;
          return (
            <div key={e.id} className="border border-gray-100 rounded-md p-3">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="text-sm font-medium text-gray-900 truncate">{e.name}</div>
                {e.ice_score != null && e.ice_impact != null && e.ice_confidence != null && e.ice_ease != null && (
                  <ICEScore impact={e.ice_impact} confidence={e.ice_confidence} ease={e.ice_ease} score={e.ice_score} />
                )}
              </div>
              <div className="text-[11px] text-gray-400 mb-1">
                {e.target_metric} · started {e.start_date ?? '—'} · expected lift {e.expected_lift_pct ?? '—'}%
              </div>
              {sig && (
                <div className="text-[11px] mt-1">
                  <span className="text-gray-500">Status:</span>{' '}
                  <span className={
                    sig.status === 'winner' ? 'text-green-600 font-semibold'
                    : sig.status === 'loser' ? 'text-red-600 font-semibold'
                    : sig.status === 'inconclusive' ? 'text-amber-600' : 'text-gray-500'
                  }>{sig.status}</span>
                  {sig.lift_pct != null && <span className="text-gray-500 ml-2">lift {sig.lift_pct.toFixed(1)}%</span>}
                  {sig.p_value != null && <span className="text-gray-500 ml-2">p={sig.p_value.toFixed(3)}</span>}
                </div>
              )}
              {variantUrl && (
                <a href={variantUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-1">
                  <ExternalLink className="h-3 w-3" /> open variant
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LearningsPanel({ rows }: { rows: Learning[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Recent learnings</h3>
      </div>
      {!rows.length ? (
        <p className="text-xs text-gray-400">
          No outcomes recorded yet. Once an experiment closes, the system writes a row here comparing predicted vs actual lift — that&apos;s how ICE confidence priors auto-tune.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium pb-2">Date</th>
              <th className="text-right font-medium pb-2">Predicted</th>
              <th className="text-right font-medium pb-2">Actual</th>
              <th className="text-right font-medium pb-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 text-gray-600">{new Date(l.recorded_at).toLocaleDateString()}</td>
                <td className="text-right text-gray-600">{l.predicted_lift_pct?.toFixed(1) ?? '—'}%</td>
                <td className="text-right font-semibold text-gray-900">{l.actual_lift_pct?.toFixed(1) ?? '—'}%</td>
                <td className={`text-right font-mono text-xs ${
                  l.confidence_calibration_delta == null ? 'text-gray-400'
                  : l.confidence_calibration_delta >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {l.confidence_calibration_delta == null ? '—' : (l.confidence_calibration_delta * 100).toFixed(0) + '%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-gray-400 mt-3">
        At low traffic, p-value below 0.05 may take weeks. Read both p-value and posterior lift; call directional wins above 80% posterior even before p&lt;0.05.
      </p>
    </div>
  );
}

export function ICEMatrixTab() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/insights', { cache: 'no-store' });
      if (!res.ok) throw new Error(`insights ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load ICE matrix: {error ?? 'no data'}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <VelocityPanel v={data.velocity} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <BottleneckPanel b={data.bottleneck} />
        </div>
        <RunningPanel rows={data.running_experiments} />
      </div>

      <DCTPanel dct={data.dct} fatigue={data.fatigue_signals} />
      <FrictionPanel rows={data.top_friction_sections} />
      <ProposedPanel rows={data.proposed_lp_experiments} />
      <LearningsPanel rows={data.recent_learnings} />

      <div className="text-[11px] text-gray-400 mt-2">
        Computed {new Date(data.computed_at).toLocaleString()}.{' '}
        ICE = Impact · Confidence · Ease (each 1-10). Score = product / 10.
      </div>
    </div>
  );
}
