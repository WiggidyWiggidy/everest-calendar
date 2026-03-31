'use client';

import { useState } from 'react';
import { Plus, FlaskConical, Zap, BarChart3 } from 'lucide-react';
import type { MarketingExperiment, ExperimentType, ExperimentStatus } from '@/types';

interface Props {
  experiments: MarketingExperiment[];
  onRefresh: () => void;
  prefillType?: ExperimentType | null;
}

const TYPE_LABELS: Record<string, string> = {
  landing_page: 'Landing Page',
  creative: 'Creative',
  copy: 'Copy',
  offer: 'Offer',
  audience: 'Audience',
  email: 'Email',
  attribution: 'Attribution',
  ux: 'UX',
};

const METRIC_OPTIONS = [
  { value: 'shopify_add_to_cart_rate', label: 'Add-to-Cart Rate' },
  { value: 'shopify_conversion_rate', label: 'Conversion Rate' },
  { value: 'shopify_revenue', label: 'Revenue' },
  { value: 'meta_ctr', label: 'Meta CTR' },
  { value: 'meta_roas', label: 'ROAS' },
  { value: 'meta_cost_per_purchase', label: 'Cost per Purchase' },
  { value: 'ga_bounce_rate', label: 'Bounce Rate' },
  { value: 'customers_acquired', label: 'Customers Acquired' },
  { value: 'profit_per_customer', label: 'Profit per Customer' },
  { value: 'checkout_rate', label: 'Checkout Rate' },
  { value: 'clarity_engagement_score', label: 'Clarity Engagement' },
];

function StatusBadge({ status }: { status: ExperimentStatus }) {
  const styles: Record<ExperimentStatus, string> = {
    running: 'bg-green-100 text-green-700 border-green-200',
    draft: 'bg-gray-100 text-gray-500 border-gray-200',
    paused: 'bg-amber-100 text-amber-700 border-amber-200',
    completed: 'bg-blue-100 text-blue-700 border-blue-200',
    archived: 'bg-gray-100 text-gray-400 border-gray-100',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${styles[status]}`}>
      {status}
    </span>
  );
}

function ICEBadge({ score, impact, confidence, ease }: { score: number | null; impact: number | null; confidence: number | null; ease: number | null }) {
  if (score == null) return null;
  const color = score >= 60 ? 'bg-green-100 text-green-700 border-green-200'
    : score >= 30 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${color} cursor-help`}
      title={`Impact: ${impact}/10 | Confidence: ${confidence}/10 | Ease: ${ease}/10`}>
      ICE {score.toFixed(0)}
    </span>
  );
}

function ResultBadge({ result }: { result: MarketingExperiment['result'] }) {
  if (!result) return null;
  const styles = {
    winner: 'bg-green-100 text-green-700',
    loser: 'bg-red-100 text-red-700',
    inconclusive: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[result]}`}>
      {result === 'winner' ? 'Winner' : result === 'loser' ? 'Loser' : 'Inconclusive'}
    </span>
  );
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function ExperimentCard({ exp, onUpdate }: { exp: MarketingExperiment; onUpdate: () => void }) {
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<Record<string, unknown> | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function transition(status: ExperimentStatus, extra?: Partial<MarketingExperiment>) {
    await fetch('/api/marketing/experiments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: exp.id, status, ...extra }),
    });
    onUpdate();
  }

  async function executeExperiment() {
    setExecuting(true);
    try {
      const res = await fetch('/api/marketing/experiments/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment_id: exp.id }),
      });
      const data = await res.json();
      setExecResult(data);
      if (data.success) onUpdate();
    } catch {
      setExecResult({ error: 'Execution failed' });
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={exp.status} />
            <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
              {TYPE_LABELS[exp.type] || exp.type}
            </span>
            <ICEBadge score={exp.ice_score} impact={exp.ice_impact} confidence={exp.ice_confidence} ease={exp.ice_ease} />
            {exp.result && <ResultBadge result={exp.result} />}
          </div>
          <button onClick={() => setExpanded(e => !e)} className="font-semibold text-gray-900 mt-1.5 text-sm text-left hover:text-indigo-600">
            {exp.name}
          </button>
          {exp.hypothesis && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{exp.hypothesis}</div>}
        </div>
      </div>

      {/* ICE Breakdown */}
      {expanded && exp.ice_impact != null && (
        <div className="mt-2 mb-2 p-2 bg-gray-50 rounded-lg">
          <div className="flex gap-4 text-xs">
            <div className="flex-1">
              <div className="text-gray-400 mb-1">Impact</div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 bg-gray-200 rounded-full flex-1"><div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${(exp.ice_impact || 0) * 10}%` }} /></div>
                <span className="font-semibold text-gray-700">{exp.ice_impact}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-gray-400 mb-1">Confidence</div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 bg-gray-200 rounded-full flex-1"><div className="h-1.5 bg-green-500 rounded-full" style={{ width: `${(exp.ice_confidence || 0) * 10}%` }} /></div>
                <span className="font-semibold text-gray-700">{exp.ice_confidence}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-gray-400 mb-1">Ease</div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 bg-gray-200 rounded-full flex-1"><div className="h-1.5 bg-amber-500 rounded-full" style={{ width: `${(exp.ice_ease || 0) * 10}%` }} /></div>
                <span className="font-semibold text-gray-700">{exp.ice_ease}</span>
              </div>
            </div>
          </div>
          {exp.rationale && <div className="text-xs text-gray-500 mt-2">{exp.rationale}</div>}
          {exp.expected_lift_pct != null && (
            <div className="text-xs mt-1"><span className="text-gray-400">Expected lift:</span> <span className="font-semibold text-green-600">+{exp.expected_lift_pct}%</span></div>
          )}
        </div>
      )}

      {/* Metrics */}
      {exp.primary_metric && (
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
          <span>Metric: <span className="font-medium text-gray-700">{METRIC_OPTIONS.find(o => o.value === exp.primary_metric)?.label ?? exp.primary_metric}</span></span>
          {exp.baseline_value != null && <span>Baseline: <span className="font-medium">{exp.baseline_value}</span></span>}
          {exp.target_metric_value != null && <span>Target: <span className="font-medium text-indigo-600">{exp.target_metric_value}</span></span>}
          {exp.result_value != null && <span>Result: <span className="font-medium">{exp.result_value}</span></span>}
          {exp.lift_percent != null && (
            <span className={`font-semibold ${exp.lift_percent > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {exp.lift_percent > 0 ? '+' : ''}{exp.lift_percent.toFixed(1)}%
            </span>
          )}
          {exp.start_date && exp.status === 'running' && (
            <span className="ml-auto">Day {daysSince(exp.start_date)}</span>
          )}
        </div>
      )}

      {/* Execute Result */}
      {execResult && (
        <div className={`mt-2 p-2 rounded-lg text-xs ${execResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {execResult.success ? (
            <>
              <div className="font-medium text-green-700">Executed successfully</div>
              {execResult.preview_url && <a href={execResult.preview_url as string} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Preview draft</a>}
              {execResult.admin_url && <span className="ml-2"><a href={execResult.admin_url as string} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Shopify admin</a></span>}
              {execResult.creatives && <div className="mt-1 text-gray-600">{(execResult.creatives as Array<Record<string, unknown>>).length} ad creative(s) created</div>}
            </>
          ) : (
            <div className="text-red-700">{execResult.error as string || 'Execution failed'}</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {exp.status === 'draft' && exp.execution_spec && (
          <button onClick={executeExperiment} disabled={executing}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50">
            <Zap className="h-3 w-3" /> {executing ? 'Building...' : 'Execute'}
          </button>
        )}
        {exp.status === 'draft' && !exp.execution_spec && (
          <button onClick={() => transition('running', { start_date: new Date().toISOString().split('T')[0] })}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg">
            Start
          </button>
        )}
        {exp.status === 'running' && (
          <>
            <button onClick={() => transition('paused')}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg">
              Pause
            </button>
            <button onClick={() => { const r = prompt('Result? (winner / loser / inconclusive)') as MarketingExperiment['result']; if (r) transition('completed', { result: r, end_date: new Date().toISOString().split('T')[0] }); }}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg">
              Complete
            </button>
          </>
        )}
        {exp.status === 'paused' && (
          <button onClick={() => transition('running')}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg">
            Resume
          </button>
        )}
        {exp.status !== 'archived' && (
          <button onClick={() => transition('archived')}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1 rounded-lg">
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

function NewExperimentForm({ onCreated, defaultType }: { onCreated: () => void; defaultType?: ExperimentType }) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData(e.currentTarget);
      const data: Record<string, unknown> = {};
      fd.forEach((v, k) => { if (v) data[k] = v; });
      // Convert ICE fields to numbers
      if (data.ice_impact) data.ice_impact = Number(data.ice_impact);
      if (data.ice_confidence) data.ice_confidence = Number(data.ice_confidence);
      if (data.ice_ease) data.ice_ease = Number(data.ice_ease);
      await fetch('/api/marketing/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      onCreated();
    } catch {
      alert('Failed to create experiment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-700">New Experiment</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Name *</label>
          <input name="name" required className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="e.g. Homepage Hero v2 Split Test" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Type *</label>
          <select name="type" defaultValue={defaultType ?? 'creative'} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Primary Metric</label>
          <select name="primary_metric" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="">-- select --</option>
            {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Hypothesis</label>
          <textarea name="hypothesis" rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" placeholder="Changing X will improve Y by Z% because..." />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">ICE Score (1-10 each)</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input name="ice_impact" type="number" min="1" max="10" placeholder="Impact" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <input name="ice_confidence" type="number" min="1" max="10" placeholder="Confidence" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <input name="ice_ease" type="number" min="1" max="10" placeholder="Ease" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
          </div>
        </div>
      </div>
      <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">
        {saving ? 'Creating...' : 'Create Experiment'}
      </button>
    </form>
  );
}

export function ExperimentsTab({ experiments, onRefresh, prefillType }: Props) {
  const [showForm, setShowForm] = useState(!!prefillType);
  const [analysing, setAnalysing] = useState(false);

  const running = experiments.filter(e => e.status === 'running');
  const draft = experiments.filter(e => e.status === 'draft');
  const paused = experiments.filter(e => e.status === 'paused');
  const completed = experiments.filter(e => e.status === 'completed');

  function handleCreated() {
    setShowForm(false);
    onRefresh();
  }

  async function runAnalysis() {
    setAnalysing(true);
    try {
      const res = await fetch('/api/marketing/analyse-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 60 }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error || 'Analysis failed');
      }
    } catch {
      alert('Analysis request failed');
    } finally {
      setAnalysing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Experiments</div>
          <div className="text-xs text-gray-400">{running.length} running · {draft.length} draft · {experiments.length} total</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runAnalysis}
            disabled={analysing}
            className="flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
          >
            <BarChart3 className="h-4 w-4" /> {analysing ? 'Analysing...' : 'AI Propose'}
          </button>
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>
      </div>

      {showForm && <NewExperimentForm onCreated={handleCreated} defaultType={prefillType ?? undefined} />}

      {experiments.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <div className="text-sm">No experiments yet</div>
          <div className="text-xs mt-1">Click &quot;AI Propose&quot; to generate data-backed experiments, or create manually</div>
        </div>
      )}

      {[
        { label: 'Draft (by ICE priority)', items: draft },
        { label: 'Running', items: running },
        { label: 'Paused', items: paused },
        { label: 'Completed', items: completed },
      ].map(({ label, items }) =>
        items.length > 0 ? (
          <div key={label} className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label} ({items.length})</div>
            {items.map(exp => <ExperimentCard key={exp.id} exp={exp} onUpdate={onRefresh} />)}
          </div>
        ) : null
      )}
    </div>
  );
}
