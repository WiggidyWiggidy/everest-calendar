'use client';

import { useState } from 'react';
import { Plus, FlaskConical } from 'lucide-react';
import type { MarketingExperiment, ExperimentType, ExperimentStatus } from '@/types';

interface Props {
  experiments: MarketingExperiment[];
  onRefresh: () => void;
  prefillType?: ExperimentType | null;
}

const TYPE_LABELS: Record<ExperimentType, string> = {
  landing_page: 'Landing Page',
  creative: 'Creative',
  copy: 'Copy',
  offer: 'Offer',
  audience: 'Audience',
  email: 'Email',
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

function ResultBadge({ result }: { result: MarketingExperiment['result'] }) {
  if (!result) return null;
  const styles = {
    winner: 'bg-green-100 text-green-700',
    loser: 'bg-red-100 text-red-700',
    inconclusive: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[result]}`}>
      {result === 'winner' ? '🏆 Winner' : result === 'loser' ? 'Loser' : 'Inconclusive'}
    </span>
  );
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function ExperimentCard({ exp, onUpdate }: { exp: MarketingExperiment; onUpdate: () => void }) {
  async function transition(status: ExperimentStatus, extra?: Partial<MarketingExperiment>) {
    await fetch('/api/marketing/experiments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: exp.id, status, ...extra }),
    });
    onUpdate();
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={exp.status} />
            <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
              {TYPE_LABELS[exp.type]}
            </span>
            {exp.result && <ResultBadge result={exp.result} />}
          </div>
          <div className="font-semibold text-gray-900 mt-1.5 text-sm">{exp.name}</div>
          {exp.hypothesis && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{exp.hypothesis}</div>}
        </div>
      </div>

      {/* Metrics */}
      {exp.primary_metric && (
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span>Metric: <span className="font-medium text-gray-700">{METRIC_OPTIONS.find(o => o.value === exp.primary_metric)?.label ?? exp.primary_metric}</span></span>
          {exp.baseline_value != null && <span>Baseline: <span className="font-medium">{exp.baseline_value}</span></span>}
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

      {/* Actions */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {exp.status === 'draft' && (
          <button onClick={() => transition('running', { start_date: new Date().toISOString().split('T')[0] })}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg">
            ▶ Start
          </button>
        )}
        {exp.status === 'running' && (
          <>
            <button onClick={() => transition('paused')}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg">
              ⏸ Pause
            </button>
            <button onClick={() => { const r = prompt('Result? (winner / loser / inconclusive)') as MarketingExperiment['result']; if (r) transition('completed', { result: r, end_date: new Date().toISOString().split('T')[0] }); }}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg">
              ✓ Complete
            </button>
          </>
        )}
        {exp.status === 'paused' && (
          <button onClick={() => transition('running')}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg">
            ▶ Resume
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
      await fetch('/api/marketing/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(fd)),
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
            {(Object.keys(TYPE_LABELS) as ExperimentType[]).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Primary Metric</label>
          <select name="primary_metric" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="">— select —</option>
            {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Hypothesis</label>
          <textarea name="hypothesis" rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" placeholder="Changing the hero image will increase add-to-cart rate by 15%" />
        </div>
      </div>
      <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">
        {saving ? 'Creating…' : 'Create Experiment'}
      </button>
    </form>
  );
}

export function ExperimentsTab({ experiments, onRefresh, prefillType }: Props) {
  const [showForm, setShowForm] = useState(!!prefillType);

  const running = experiments.filter(e => e.status === 'running');
  const draft = experiments.filter(e => e.status === 'draft');
  const paused = experiments.filter(e => e.status === 'paused');
  const completed = experiments.filter(e => e.status === 'completed');

  function handleCreated() {
    setShowForm(false);
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Experiments</div>
          <div className="text-xs text-gray-400">{running.length} running · {experiments.length} total</div>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      {showForm && <NewExperimentForm onCreated={handleCreated} defaultType={prefillType ?? undefined} />}

      {experiments.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <div className="text-sm">No experiments yet</div>
          <div className="text-xs mt-1">Create your first split test or creative test above</div>
        </div>
      )}

      {[
        { label: 'Running', items: running },
        { label: 'Paused', items: paused },
        { label: 'Draft', items: draft },
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
