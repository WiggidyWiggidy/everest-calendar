'use client';

// ============================================
// /inbox — Tinder-Style Swipe Approval
// Swipe right = approve. Swipe left = skip.
// No buttons. Pure gesture-based decisions.
// ============================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import { PlatformInboxItem, INBOX_PLATFORM_COLORS, InboxPlatform } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import SwipeCard from '@/components/inbox/SwipeCard';

// ── Types ────────────────────────────────────────────────────────────────────
interface NegotiationContext {
  component_name: string;
  negotiation_phase: string;
  target_price_usd: number | null;
  current_quote_usd: number | null;
  first_quote_usd: number | null;
  quote_count: number;
  status: string;
  message_count: number;
}

type InboxFilter = 'all' | InboxPlatform;

// ── Main Page ────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [items, setItems] = useState<PlatformInboxItem[]>([]);
  const [negotiations, setNegotiations] = useState<Record<string, NegotiationContext>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [filter, setFilter] = useState<InboxFilter>('all');

  // Fetch items
  const fetchItems = useCallback(async (status: 'pending' | 'done') => {
    try {
      const res = await fetch(`/api/inbox?status=${status}`);
      const json = await res.json();
      if (json.items) {
        setItems(json.items);
        // Fetch negotiation context for alibaba items
        const alibabaItems = (json.items as PlatformInboxItem[]).filter(
          (i: PlatformInboxItem) => i.platform === 'alibaba' && i.contact_name
        );
        const uniqueContacts = Array.from(
          new Set(alibabaItems.map((i: PlatformInboxItem) => i.contact_name))
        );
        if (uniqueContacts.length > 0) {
          const negMap: Record<string, NegotiationContext> = {};
          await Promise.all(
            uniqueContacts.map(async (name) => {
              if (!name) return;
              try {
                const negRes = await fetch(
                  `/api/suppliers/context?contact=${encodeURIComponent(name)}`
                );
                if (negRes.ok) {
                  const negData = await negRes.json();
                  if (negData.context && negData.context.length > 0) {
                    negMap[name] = negData.context[0];
                  }
                }
              } catch { /* skip */ }
            })
          );
          setNegotiations(negMap);
        }
      }
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchItems(tab);
  }, [tab, fetchItems]);

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(() => fetchItems(tab), 30_000);
    return () => clearInterval(interval);
  }, [tab, fetchItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.platform === filter);
  }, [items, filter]);

  // Platform counts
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.platform] = (counts[item.platform] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Handle swipe action
  async function handleAction(id: string, action: string, customReply?: string) {
    const body: Record<string, unknown> = { action };
    if (customReply) body.custom_reply = customReply;

    const res = await fetch(`/api/inbox/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('Action failed:', err.error);
      return;
    }

    // Remove item from list
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement) return;
      const current = filteredItems[0];
      if (!current) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleAction(current.id, 'approve');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleAction(current.id, 'reject');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // Top 3 items for card stack
  const stackItems = filteredItems.slice(0, 3);

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 -m-6 lg:-m-0 -mt-16 lg:-mt-0">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 pt-14 lg:pt-3 pb-2 px-4 z-10">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-2">
          {(['pending', 'done'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setFilter('all'); }}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                tab === t
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-400 hover:text-slate-700'
              )}
            >
              {t === 'pending' ? `Pending (${items.length})` : 'Done'}
            </button>
          ))}
        </div>

        {/* Platform filters */}
        {tab === 'pending' && items.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(['all', 'alibaba', 'whatsapp', 'upwork'] as InboxFilter[]).map((f) => {
              const count = platformCounts[f] ?? 0;
              if (f !== 'all' && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors',
                    filter === f
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Card area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600" />
          </div>
        ) : tab === 'done' ? (
          /* Done tab - simple list */
          <div className="p-4 space-y-2 overflow-y-auto h-full">
            {items.length === 0 ? (
              <p className="text-center text-slate-400 text-sm pt-20">No completed items yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="bg-white rounded-lg px-3 py-2 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full', INBOX_PLATFORM_COLORS[item.platform]?.bg, INBOX_PLATFORM_COLORS[item.platform]?.text)}>
                        {item.platform}
                      </span>
                      <span className="text-sm font-medium text-slate-700">{item.contact_name ?? 'Unknown'}</span>
                    </div>
                    <span className={cn('text-xs font-medium', item.status === 'approved' || item.status === 'edited' ? 'text-green-600' : 'text-slate-400')}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-8">
            <CheckCircle2 className="h-20 w-20 text-green-400" />
            <div>
              <p className="text-xl font-semibold text-slate-700">All clear</p>
              <p className="text-slate-400 text-sm mt-1">
                Nothing to review right now.
              </p>
            </div>
          </div>
        ) : (
          /* Card stack */
          <div className="relative w-full h-full">
            {stackItems.map((item, i) => {
              const negContext = item.contact_name ? negotiations[item.contact_name] ?? null : null;
              return (
                <SwipeCard
                  key={item.id}
                  item={item}
                  negotiation={negContext}
                  index={filteredItems.indexOf(item)}
                  total={filteredItems.length}
                  stackPosition={i}
                  onAction={handleAction}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
