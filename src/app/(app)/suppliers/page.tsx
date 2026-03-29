'use client';

// ============================================
// /suppliers — Supplier Pipeline Dashboard
// Shows every component + its suppliers + negotiation status.
// Mobile-first, grouped by component.
// ============================================
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, MessageCircle, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface Conversation {
  id: string;
  component_name: string;
  negotiation_phase: string;
  target_price_usd: number | null;
  current_quote_usd: number | null;
  first_quote_usd: number | null;
  quote_count: number;
  status: string;
  message_count: number;
  updated_at: string;
}

interface SupplierGroup {
  supplier_key: string;
  supplier_name: string;
  conversations: Conversation[];
}

interface Component {
  id: string;
  name: string;
  category: string;
}

const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  quote_collection: 'Quoting',
  counter_offer: 'Counter',
  sample: 'Sample',
  factory_visit: 'Visit',
  production_terms: 'Terms',
  closed_won: 'Won',
  closed_lost: 'Lost',
};

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-slate-200 text-slate-700',
  quote_collection: 'bg-blue-100 text-blue-700',
  counter_offer: 'bg-amber-100 text-amber-700',
  sample: 'bg-purple-100 text-purple-700',
  factory_visit: 'bg-indigo-100 text-indigo-700',
  production_terms: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-red-100 text-red-700',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600_000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusDot({ phase, messageCount, updatedAt }: { phase: string; messageCount: number; updatedAt: string }) {
  const hoursSince = (Date.now() - new Date(updatedAt).getTime()) / 3600_000;

  if (phase === 'closed_won') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (phase === 'closed_lost') return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
  if (messageCount === 0) return <MessageCircle className="h-3.5 w-3.5 text-slate-300" />;
  if (hoursSince > 48) return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
  return <Clock className="h-3.5 w-3.5 text-blue-400" />;
}

export default function SuppliersPage() {
  const [pipeline, setPipeline] = useState<SupplierGroup[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers/pipeline');
      const data = await res.json();
      setPipeline(data.pipeline ?? []);
      setComponents(data.components ?? []);
    } catch (err) {
      console.error('Failed to fetch pipeline:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group conversations by component
  const byComponent: Record<string, { suppliers: Array<{ name: string; conv: Conversation }>; }> = {};

  for (const group of pipeline) {
    for (const conv of group.conversations) {
      const compName = conv.component_name?.split('(')[0]?.trim() || 'Other';
      if (!byComponent[compName]) byComponent[compName] = { suppliers: [] };
      byComponent[compName].suppliers.push({ name: group.supplier_name, conv });
    }
  }

  // Find components with no active suppliers
  const activeCompNames = new Set(Object.keys(byComponent));
  const untracked = components.filter(c =>
    !activeCompNames.has(c.name.split('(')[0].trim()) && !c.name.includes('ELIMINATED')
  );

  // Summary stats
  const totalConversations = pipeline.reduce((sum, g) => sum + g.conversations.length, 0);
  const quotingCount = pipeline.reduce((sum, g) => sum + g.conversations.filter(c => c.negotiation_phase === 'quote_collection').length, 0);
  const withQuotes = pipeline.reduce((sum, g) => sum + g.conversations.filter(c => c.current_quote_usd).length, 0);

  function toggleComponent(name: string) {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Supplier Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1">
          {totalConversations} suppliers &middot; {quotingCount} quoting &middot; {withQuotes} with prices
        </p>
      </div>

      {/* Phase summary strip */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {Object.entries(PHASE_LABELS).map(([key, label]) => {
          const count = pipeline.reduce((sum, g) => sum + g.conversations.filter(c => c.negotiation_phase === key).length, 0);
          if (count === 0) return null;
          return (
            <div key={key} className={cn('text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap', PHASE_COLORS[key])}>
              {label} ({count})
            </div>
          );
        })}
      </div>

      {/* Component groups */}
      <div className="space-y-2">
        {Object.entries(byComponent)
          .sort(([, a], [, b]) => b.suppliers.length - a.suppliers.length)
          .map(([compName, { suppliers }]) => {
            const isOpen = expanded[compName] ?? false;
            const bestQuote = suppliers
              .filter(s => s.conv.current_quote_usd)
              .sort((a, b) => (a.conv.current_quote_usd ?? 999) - (b.conv.current_quote_usd ?? 999))[0];

            return (
              <div key={compName} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Component header */}
                <button
                  onClick={() => toggleComponent(compName)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-900">{compName}</p>
                      <p className="text-xs text-slate-400">
                        {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
                        {bestQuote && ` · best: $${bestQuote.conv.current_quote_usd}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {suppliers.slice(0, 3).map((s, i) => (
                      <span key={i} className={cn('w-2 h-2 rounded-full', {
                        'bg-green-400': s.conv.negotiation_phase === 'closed_won' || s.conv.negotiation_phase === 'production_terms',
                        'bg-blue-400': s.conv.negotiation_phase === 'quote_collection',
                        'bg-amber-400': s.conv.negotiation_phase === 'counter_offer' || s.conv.negotiation_phase === 'sample',
                        'bg-slate-300': s.conv.negotiation_phase === 'discovery',
                      })} />
                    ))}
                  </div>
                </button>

                {/* Expanded supplier list */}
                {isOpen && (
                  <div className="border-t border-slate-100">
                    {suppliers
                      .sort((a, b) => (a.conv.current_quote_usd ?? 999) - (b.conv.current_quote_usd ?? 999))
                      .map((s) => (
                        <div key={s.conv.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-b-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusDot phase={s.conv.negotiation_phase} messageCount={s.conv.message_count} updatedAt={s.conv.updated_at} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                              <p className="text-xs text-slate-400">
                                {s.conv.message_count > 0 ? `${s.conv.message_count} msg${s.conv.message_count !== 1 ? 's' : ''}` : 'no contact'}
                                {s.conv.message_count > 0 && ` · ${timeAgo(s.conv.updated_at)}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {s.conv.current_quote_usd && (
                              <span className="text-sm font-semibold text-slate-700">${s.conv.current_quote_usd}</span>
                            )}
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', PHASE_COLORS[s.conv.negotiation_phase] ?? 'bg-slate-100 text-slate-600')}>
                              {PHASE_LABELS[s.conv.negotiation_phase]}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}

        {/* Components with no suppliers */}
        {untracked.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 px-1">
              No suppliers yet ({untracked.length})
            </p>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {untracked.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm text-slate-600">{c.name.split('(')[0].trim()}</p>
                  <span className="text-xs text-slate-300">{c.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
