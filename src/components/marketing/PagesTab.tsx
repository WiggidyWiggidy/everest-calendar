'use client';

import { useState } from 'react';
import { ExternalLink, Plus, TrendingDown, ChevronDown } from 'lucide-react';
import type { LandingPage, MarketingMetricDaily, LandingPageStatus } from '@/types';

interface PageWithProposal extends LandingPage {
  latest_proposal: { id: string; status: string } | null;
}

interface Props {
  pages: PageWithProposal[];
  today: MarketingMetricDaily | null;
  onPageCreated: (page: LandingPage) => void;
  onPageUpdated: (id: string, updates: Partial<LandingPage>) => void;
  onAnalyse: (pageId: string) => void;
  onBuild: (pageId: string) => void;
}

const STATUS_LABELS: Record<LandingPageStatus, string> = {
  monitoring: 'Monitoring',
  testing: 'Testing',
  paused: 'Paused',
  archived: 'Archived',
};

const STATUS_COLOURS: Record<LandingPageStatus, string> = {
  monitoring: 'bg-blue-50 text-blue-700 border-blue-200',
  testing: 'bg-green-50 text-green-700 border-green-200',
  paused: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  archived: 'bg-gray-50 text-gray-500 border-gray-200',
};

const PROPOSAL_STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  approved: 'bg-green-50 text-green-700',
  user_written: 'bg-purple-50 text-purple-700',
  building: 'bg-blue-50 text-blue-700',
  live: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-500',
};

function fmt(n: number | null | undefined, isPercent = false): string {
  if (n == null) return '—';
  if (isPercent) return (Number(n) * 100).toFixed(1) + '%';
  return Number(n).toLocaleString('en-AU');
}

export function PagesTab({ pages, today, onPageCreated, onPageUpdated, onAnalyse, onBuild }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/marketing/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), shopify_url: url.trim(), notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error('Failed');
      const { page } = await res.json();
      onPageCreated(page);
      setName(''); setUrl(''); setNotes(''); setShowForm(false);
    } catch {
      alert('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: LandingPageStatus) {
    setStatusMenuOpen(null);
    await fetch('/api/marketing/landing-pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    onPageUpdated(id, { status });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Landing Pages</h2>
          <p className="text-xs text-gray-500 mt-0.5">Track and test your Shopify landing pages</p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg"
        >
          <Plus className="h-3.5 w-3.5" />
          Track a page
        </button>
      </div>

      {/* Add page form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Add a landing page to track</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Page name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ice Shower Main Page"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Shopify URL</label>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://your-store.myshopify.com/pages/..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Current control page, launched Jan 2026"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Page'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Pages list */}
      {pages.length === 0 && !showForm && (
        <div className="text-center py-16 text-gray-400">
          <TrendingDown className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No pages tracked yet</p>
          <p className="text-xs mt-1">Add a landing page to start monitoring performance</p>
        </div>
      )}

      {pages.map(page => (
        <div key={page.id} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          {/* Page header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{page.name}</h3>
                <a
                  href={page.shopify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="text-xs text-gray-400 truncate mt-0.5">{page.shopify_url}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Proposal status */}
              {page.latest_proposal && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROPOSAL_STATUS_COLOURS[page.latest_proposal.status] ?? 'bg-gray-50 text-gray-500'}`}>
                  Plan: {page.latest_proposal.status.replace('_', ' ')}
                </span>
              )}
              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => setStatusMenuOpen(statusMenuOpen === page.id ? null : page.id)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_COLOURS[page.status]}`}
                >
                  {STATUS_LABELS[page.status]}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {statusMenuOpen === page.id && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[130px]">
                    {(Object.keys(STATUS_LABELS) as LandingPageStatus[]).map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(page.id, s)}
                        className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key metrics from today */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-400">Bounce Rate</p>
              <p className={`text-sm font-semibold ${today?.ga_bounce_rate != null && today.ga_bounce_rate > 0.70 ? 'text-red-600' : 'text-gray-800'}`}>
                {fmt(today?.ga_bounce_rate, true)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-400">Add-to-Cart</p>
              <p className={`text-sm font-semibold ${today?.shopify_add_to_cart_rate != null && today.shopify_add_to_cart_rate < 0.03 ? 'text-red-600' : 'text-gray-800'}`}>
                {fmt(today?.shopify_add_to_cart_rate, true)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-400">Conversion</p>
              <p className={`text-sm font-semibold ${today?.shopify_conversion_rate != null && today.shopify_conversion_rate < 0.02 ? 'text-red-600' : 'text-gray-800'}`}>
                {fmt(today?.shopify_conversion_rate, true)}
              </p>
            </div>
          </div>

          {page.notes && (
            <p className="text-xs text-gray-400 italic">{page.notes}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              onClick={() => onAnalyse(page.id)}
              className="text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg"
            >
              🔍 Analyse
            </button>
            <button
              onClick={() => onBuild(page.id)}
              className="text-xs font-medium bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg"
            >
              🔨 Build Page
            </button>
            {page.shopify_page_id && (
              <a
                href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL ?? ''}/admin/pages/${page.shopify_page_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                View Draft
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
