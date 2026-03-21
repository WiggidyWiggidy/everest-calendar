'use client';

// ============================================
// /manufacturers — Manufacturer Pipeline
// Track sheet metal fabrication shops from
// first contact through to selected supplier.
// ============================================
import { useEffect, useState, useCallback } from 'react';
import {
  Manufacturer,
  ManufacturerStatus,
  MANUFACTURER_STATUS_LABELS,
  MANUFACTURER_STATUS_COLORS,
} from '@/types';
import { cn } from '@/lib/utils';
import { Factory, Plus, X, ChevronDown, ChevronUp, Trash2, Check } from 'lucide-react';

const STATUSES: ManufacturerStatus[] = [
  'prospecting','contacted','sample_requested','sample_received',
  'quoting','quoted','trialling','selected','rejected',
];

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ManufacturerStatus }) {
  const { bg, text } = MANUFACTURER_STATUS_COLORS[status];
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', bg, text)}>
      {MANUFACTURER_STATUS_LABELS[status]}
    </span>
  );
}

// ── Add manufacturer form ─────────────────────────────────────────────────────
function AddManufacturerForm({ onAdded }: { onAdded: (m: Manufacturer) => void }) {
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({
    company_name: '', contact_name: '', phone: '', email: '',
    location: '', website: '', notes: '',
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const { manufacturer } = await res.json();
        onAdded(manufacturer);
        setForm({ company_name: '', contact_name: '', phone: '', email: '', location: '', website: '', notes: '' });
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-indigo-500" />
          <span>Add Manufacturer</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Company name *</label>
            <input
              value={form.company_name}
              onChange={(e) => update('company_name', e.target.value)}
              required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="e.g. ShenZhen Metal Works"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contact name</label>
            <input
              value={form.contact_name}
              onChange={(e) => update('contact_name', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="e.g. Li Wei"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
            <input
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="e.g. Shenzhen, China"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              type="email"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="contact@factory.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
            <input
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="https://..."
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              placeholder="How you found them, initial impressions..."
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.company_name.trim()}
              className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              {saving ? 'Adding…' : 'Add manufacturer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Manufacturer card ─────────────────────────────────────────────────────────
function ManufacturerCard({
  manufacturer,
  onUpdate,
  onDelete,
}: {
  manufacturer: Manufacturer;
  onUpdate: (id: string, patch: Partial<Manufacturer>) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [notes, setNotes]         = useState(manufacturer.notes ?? '');
  const [strengths, setStrengths] = useState(manufacturer.strengths ?? '');
  const [concerns, setConcerns]   = useState(manufacturer.concerns ?? '');
  const [price, setPrice]         = useState(manufacturer.quoted_price_usd?.toString() ?? '');
  const [leadTime, setLeadTime]   = useState(manufacturer.lead_time_days?.toString() ?? '');

  async function handleStatusChange(newStatus: ManufacturerStatus) {
    const res = await fetch(`/api/manufacturers/${manufacturer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const { manufacturer: updated } = await res.json();
      onUpdate(manufacturer.id, updated);
    }
  }

  async function handleSaveDetails() {
    setSaving(true);
    try {
      const res = await fetch(`/api/manufacturers/${manufacturer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          strengths,
          concerns,
          quoted_price_usd: price ? parseFloat(price) : null,
          lead_time_days:   leadTime ? parseInt(leadTime) : null,
        }),
      });
      if (res.ok) {
        const { manufacturer: updated } = await res.json();
        onUpdate(manufacturer.id, updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${manufacturer.company_name} from the pipeline?`)) return;
    const res = await fetch(`/api/manufacturers/${manufacturer.id}`, { method: 'DELETE' });
    if (res.ok) onDelete(manufacturer.id);
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">{manufacturer.company_name}</span>
            {manufacturer.location && (
              <span className="text-xs text-slate-400">{manufacturer.location}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={manufacturer.status} />
            {manufacturer.quoted_price_usd && (
              <span className="text-xs text-slate-500">${manufacturer.quoted_price_usd.toLocaleString()} USD</span>
            )}
            {manufacturer.lead_time_days && (
              <span className="text-xs text-slate-500">{manufacturer.lead_time_days}d lead time</span>
            )}
            {manufacturer.contact_name && (
              <span className="text-xs text-slate-400">· {manufacturer.contact_name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-3">
          {/* Status selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Pipeline stage</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    manufacturer.status === s
                      ? cn(MANUFACTURER_STATUS_COLORS[s].bg, MANUFACTURER_STATUS_COLORS[s].text, 'ring-2 ring-offset-1 ring-indigo-400')
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  {MANUFACTURER_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Quote + lead time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Quoted price (USD)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="e.g. 850"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Lead time (days)</label>
              <input
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
                type="number"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="e.g. 21"
              />
            </div>
          </div>

          {/* Strengths / Concerns */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Strengths</label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                rows={2}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                placeholder="What looks good..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Concerns</label>
              <textarea
                value={concerns}
                onChange={(e) => setConcerns(e.target.value)}
                rows={2}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                placeholder="Open questions, risks..."
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              placeholder="Anything else..."
            />
          </div>

          {/* Contact info if set */}
          {(manufacturer.email || manufacturer.phone || manufacturer.website) && (
            <div className="text-xs text-slate-500 space-y-0.5">
              {manufacturer.email && <p>✉ {manufacturer.email}</p>}
              {manufacturer.phone && <p>📞 {manufacturer.phone}</p>}
              {manufacturer.website && (
                <p>🔗 <a href={manufacturer.website} target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-600">{manufacturer.website}</a></p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
            <button
              onClick={handleSaveDetails}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filterStatus, setFilterStatus]   = useState<ManufacturerStatus | 'all'>('all');

  const fetchManufacturers = useCallback(async () => {
    try {
      const res = await fetch('/api/manufacturers');
      const json = await res.json();
      if (json.manufacturers) setManufacturers(json.manufacturers);
    } catch (err) {
      console.error('Failed to fetch manufacturers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchManufacturers(); }, [fetchManufacturers]);

  function handleAdded(m: Manufacturer) {
    setManufacturers((prev) => [m, ...prev]);
  }

  function handleUpdate(id: string, patch: Partial<Manufacturer>) {
    setManufacturers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function handleDelete(id: string) {
    setManufacturers((prev) => prev.filter((m) => m.id !== id));
  }

  const displayed = filterStatus === 'all'
    ? manufacturers
    : manufacturers.filter((m) => m.status === filterStatus);

  const selectedCount = manufacturers.filter((m) => m.status === 'selected').length;
  const quotedCount   = manufacturers.filter((m) => m.status === 'quoted' || m.status === 'trialling').length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Factory className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manufacturers</h1>
            <p className="text-sm text-slate-500">
              Sheet metal fabrication pipeline
              {selectedCount > 0 && (
                <span className="ml-2 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {selectedCount} selected
                </span>
              )}
              {quotedCount > 0 && selectedCount === 0 && (
                <span className="ml-2 bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {quotedCount} at quote stage
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <AddManufacturerForm onAdded={handleAdded} />

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterStatus('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
            filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          All ({manufacturers.length})
        </button>
        {STATUSES.filter((s) => manufacturers.some((m) => m.status === s)).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
              filterStatus === s
                ? cn(MANUFACTURER_STATUS_COLORS[s].bg, MANUFACTURER_STATUS_COLORS[s].text)
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {MANUFACTURER_STATUS_LABELS[s]} ({manufacturers.filter((m) => m.status === s).length})
          </button>
        ))}
        {filterStatus !== 'all' && (
          <button
            onClick={() => setFilterStatus('all')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Factory className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-slate-500">No manufacturers yet</p>
          <p className="text-sm mt-1">Add the first one above to start your pipeline.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((m) => (
            <ManufacturerCard
              key={m.id}
              manufacturer={m}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
