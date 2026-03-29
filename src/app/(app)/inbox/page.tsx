'use client';

// ============================================
// /inbox — Tinder-Style Swipe Approval
// Swipe right = approve. Swipe left = skip.
// "Ready to Send" tab = copy-paste delivery for Alibaba.
// ============================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import { PlatformInboxItem, INBOX_PLATFORM_COLORS, InboxPlatform } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, Copy, ExternalLink, Check } from 'lucide-react';
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
type InboxTab = 'pending' | 'ready' | 'done';

// ── Main Page ────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [items, setItems] = useState<PlatformInboxItem[]>([]);
  const [readyItems, setReadyItems] = useState<PlatformInboxItem[]>([]);
  const [negotiations, setNegotiations] = useState<Record<string, NegotiationContext>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InboxTab>('pending');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [markingSent, setMarkingSent] = useState<string | null>(null);

  // Fetch items for pending/done tabs
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

  // Fetch "ready to send" items — approved/edited Alibaba items not yet sent
  const fetchReadyItems = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox?status=ready');
      const json = await res.json();
      if (json.items) setReadyItems(json.items);
    } catch (err) {
      console.error('Failed to fetch ready items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    if (tab === 'ready') {
      fetchReadyItems();
    } else {
      fetchItems(tab === 'pending' ? 'pending' : 'done');
    }
  }, [tab, fetchItems, fetchReadyItems]);

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (tab === 'ready') fetchReadyItems();
      else fetchItems(tab === 'pending' ? 'pending' : 'done');
    }, 30_000);
    return () => clearInterval(interval);
  }, [tab, fetchItems, fetchReadyItems]);

  // Copy message to clipboard
  async function handleCopy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Mark as sent — transitions item so it leaves the ready queue
  async function handleMarkSent(id: string) {
    setMarkingSent(id);
    try {
      const res = await fetch(`/api/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_sent' }),
      });
      if (res.ok) {
        setReadyItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      console.error('Mark sent failed:', err);
    } finally {
      setMarkingSent(null);
    }
  }

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

  // Batch to 5, show top 3 as card stack
  const BATCH_SIZE = 5;
  const batchedItems = filteredItems.slice(0, BATCH_SIZE);
  const stackItems = batchedItems.slice(0, 3);
  // Wave tracking: filteredItems.length / BATCH_SIZE waves total

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 -m-6 lg:-m-0 -mt-16 lg:-mt-0">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 pt-14 lg:pt-3 pb-2 px-4 z-10">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => { setTab('pending'); setFilter('all'); }}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              tab === 'pending' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            )}
          >
            Pending ({filteredItems.length})
          </button>
          <button
            onClick={() => { setTab('ready'); setFilter('all'); }}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              tab === 'ready' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-slate-700'
            )}
          >
            Ready to Send{readyItems.length > 0 ? ` (${readyItems.length})` : ''}
          </button>
          <button
            onClick={() => { setTab('done'); setFilter('all'); }}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              tab === 'done' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            )}
          >
            Done
          </button>
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
        ) : tab === 'ready' ? (
          /* Ready to Send tab — copy-paste delivery for Alibaba */
          <div className="p-4 space-y-3 overflow-y-auto h-full">
            {readyItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-8">
                <CheckCircle2 className="h-20 w-20 text-green-400" />
                <div>
                  <p className="text-xl font-semibold text-slate-700">All sent</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Approve messages in the Pending tab. They&apos;ll appear here for sending.
                  </p>
                </div>
              </div>
            ) : (
              readyItems.map((item) => {
                const messageText = item.final_reply ?? item.draft_reply ?? '';
                const alibabaUrl = item.contact_identifier ?? '';
                const isCopied = copiedId === item.id;
                const isMarking = markingSent === item.id;

                return (
                  <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Supplier header */}
                    <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{item.contact_name ?? 'Unknown Supplier'}</p>
                          {item.ai_summary && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.ai_summary}</p>
                          )}
                        </div>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          item.status === 'edited' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        )}>
                          {item.status === 'edited' ? 'Edited' : 'Approved'}
                        </span>
                      </div>
                    </div>

                    {/* Message text — the copy target */}
                    <div className="px-4 py-3">
                      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                        {messageText}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="px-4 pb-3 flex gap-2">
                      {/* Copy message */}
                      <button
                        onClick={() => handleCopy(item.id, messageText)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                          isCopied
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]'
                        )}
                      >
                        {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {isCopied ? 'Copied!' : 'Copy Message'}
                      </button>

                      {/* Open Alibaba chat */}
                      {alibabaUrl && (
                        <a
                          href={alibabaUrl.startsWith('http') ? alibabaUrl : `https://${alibabaUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Chat
                        </a>
                      )}

                      {/* Mark as sent */}
                      <button
                        onClick={() => handleMarkSent(item.id)}
                        disabled={isMarking}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        {isMarking ? '...' : 'Sent'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
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
