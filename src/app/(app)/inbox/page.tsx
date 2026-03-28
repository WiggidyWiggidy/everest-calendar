'use client';

// ============================================
// /inbox — Full-Page Swipe Approval UI
// Mobile-first: one card fills the viewport.
// Swipe through decisions, approve with one tap.
// ============================================
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PlatformInboxItem, INBOX_TIER_CONFIG, INBOX_PLATFORM_COLORS, InboxPlatform } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, Send, Clock, X, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  quote_collection: 'Quote Collection',
  counter_offer: 'Counter Offer',
  sample: 'Sample',
  factory_visit: 'Factory Visit',
  production_terms: 'Production Terms',
  closed_won: 'Won',
  closed_lost: 'Lost',
};

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-slate-100 text-slate-700',
  quote_collection: 'bg-blue-100 text-blue-700',
  counter_offer: 'bg-amber-100 text-amber-700',
  sample: 'bg-purple-100 text-purple-700',
  factory_visit: 'bg-indigo-100 text-indigo-700',
  production_terms: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-red-100 text-red-700',
};

// ── Full-Page Card ───────────────────────────────────────────────────────────
function FullPageCard({
  item,
  negotiation,
  index,
  total,
  onAction,
  onNext,
}: {
  item: PlatformInboxItem;
  negotiation: NegotiationContext | null;
  index: number;
  total: number;
  onAction: (id: string, action: string, customReply?: string) => Promise<void>;
  onNext: () => void;
}) {
  const [editText, setEditText] = useState(item.draft_reply ?? '');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [doneLabel, setDoneLabel] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when item changes
  useEffect(() => {
    setEditText(item.draft_reply ?? '');
    setSending(false);
    setDone(false);
    setDoneLabel('');
  }, [item.id, item.draft_reply]);

  async function act(action: string, custom?: string) {
    setSending(true);
    try {
      await onAction(item.id, action, custom);
      setDone(true);
      setDoneLabel(
        action === 'approve' ? 'Sent' :
        action === 'edit' ? 'Sent (edited)' :
        action === 'reject' ? 'Dismissed' :
        'Snoozed'
      );
      // Auto-advance after brief pause
      setTimeout(onNext, 600);
    } catch {
      setSending(false);
    }
  }

  const platformCfg = INBOX_PLATFORM_COLORS[item.platform] ?? INBOX_PLATFORM_COLORS.alibaba;
  const tierCfg = INBOX_TIER_CONFIG[item.approval_tier];
  const isEdited = editText.trim() !== (item.draft_reply ?? '').trim();
  const hasNeg = negotiation && negotiation.negotiation_phase;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar — progress + platform + time */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', platformCfg.bg, platformCfg.text)}>
            {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
          </span>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tierCfg.bg, tierCfg.text)}>
            {tierCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
          <span className="text-xs font-medium text-slate-500">{index + 1} / {total}</span>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {/* Contact + component header */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {item.contact_name ?? item.contact_identifier ?? 'Unknown'}
          </h2>
          {hasNeg && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm text-slate-600">{negotiation.component_name}</span>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', PHASE_COLORS[negotiation.negotiation_phase] ?? 'bg-slate-100 text-slate-600')}>
                {PHASE_LABELS[negotiation.negotiation_phase] ?? negotiation.negotiation_phase}
              </span>
            </div>
          )}
        </div>

        {/* Quote trajectory — only for suppliers with quotes */}
        {hasNeg && (negotiation.first_quote_usd || negotiation.current_quote_usd || negotiation.target_price_usd) && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-3 text-sm">
              {negotiation.first_quote_usd && (
                <div>
                  <span className="text-slate-500 text-xs block">First</span>
                  <span className="font-semibold text-slate-700">${negotiation.first_quote_usd}</span>
                </div>
              )}
              {negotiation.first_quote_usd && negotiation.current_quote_usd && negotiation.first_quote_usd !== negotiation.current_quote_usd && (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <div>
                    <span className="text-slate-500 text-xs block">Current</span>
                    <span className="font-semibold text-indigo-600">${negotiation.current_quote_usd}</span>
                  </div>
                </>
              )}
              {negotiation.target_price_usd && (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <div>
                    <span className="text-slate-500 text-xs block">Target</span>
                    <span className="font-semibold text-green-600">${negotiation.target_price_usd}</span>
                  </div>
                </>
              )}
              {negotiation.quote_count > 0 && (
                <span className="text-xs text-slate-400 ml-auto">
                  {negotiation.quote_count} quote{negotiation.quote_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {/* AI summary = the reasoning */}
        {item.ai_summary && (
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Summary</p>
            <p className="text-sm text-slate-800 leading-relaxed">{item.ai_summary}</p>
          </div>
        )}

        {item.ai_recommendation && (
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Recommendation</p>
            <p className="text-sm text-slate-600 italic leading-relaxed">{item.ai_recommendation}</p>
          </div>
        )}

        {/* Raw message — collapsed by default */}
        {item.raw_content && (
          <details className="mb-4">
            <summary className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">
              Show original message
            </summary>
            <div className="bg-slate-50 rounded-lg p-3 mt-2 text-sm text-slate-700 whitespace-pre-wrap border border-slate-200">
              {item.raw_content}
            </div>
          </details>
        )}

        {/* Draft reply — editable textarea */}
        {item.draft_reply && !done && (
          <div className="mb-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Draft Reply</p>
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={5}
              className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Action bar — fixed at bottom */}
      <div className="border-t border-slate-100 px-4 py-3 bg-white">
        {done ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">{doneLabel}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Primary action — Approve / Send */}
            <button
              disabled={sending}
              onClick={() => {
                if (isEdited) {
                  act('edit', editText.trim());
                } else {
                  act('approve');
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : isEdited ? 'Send Edited' : 'Approve'}
            </button>

            {/* Snooze */}
            <button
              disabled={sending}
              onClick={() => act('snooze')}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
            </button>

            {/* Dismiss */}
            <button
              disabled={sending}
              onClick={() => act('reject')}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [items, setItems] = useState<PlatformInboxItem[]>([]);
  const [negotiations, setNegotiations] = useState<Record<string, NegotiationContext>>({});
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch items
  const fetchItems = useCallback(async (status: 'pending' | 'done') => {
    try {
      const res = await fetch(`/api/inbox?status=${status}`);
      const json = await res.json();
      if (json.items) {
        setItems(json.items);
        // Fetch negotiation context for alibaba items
        const alibabaItems = (json.items as PlatformInboxItem[]).filter((i: PlatformInboxItem) => i.platform === 'alibaba' && i.contact_name);
        const uniqueContacts = Array.from(new Set(alibabaItems.map((i: PlatformInboxItem) => i.contact_name)));
        if (uniqueContacts.length > 0) {
          const negMap: Record<string, NegotiationContext> = {};
          await Promise.all(
            uniqueContacts.map(async (name) => {
              if (!name) return;
              try {
                const negRes = await fetch(`/api/suppliers/context?contact=${encodeURIComponent(name)}`);
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
    setCurrentIndex(0);
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

  // Platform counts for filter chips
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.platform] = (counts[item.platform] ?? 0) + 1;
    }
    return counts;
  }, [items]);

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
      throw new Error(err.error);
    }

    // Remove item from list
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function goNext() {
    if (currentIndex < filteredItems.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      // Stay on last (it was removed, so a new item slides in)
      setCurrentIndex((i) => Math.min(i, Math.max(0, filteredItems.length - 2)));
    }
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  // Touch swipe handlers
  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 60) {
      if (diff < 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const currentItem = filteredItems[currentIndex];
  const negContext = currentItem?.contact_name ? negotiations[currentItem.contact_name] ?? null : null;

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] lg:h-[calc(100dvh-0px)] flex flex-col bg-white -m-6 lg:-m-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top tabs — Pending / Done + Platform filters */}
      <div className="flex flex-col border-b border-slate-100 bg-white z-10">
        <div className="flex items-center gap-1 px-4 pt-3 pb-2">
          {(['pending', 'done'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setFilter('all'); }}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              )}
            >
              {t === 'pending' ? `Pending (${items.length})` : 'Done'}
            </button>
          ))}
        </div>

        {/* Platform filter chips */}
        {tab === 'pending' && items.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto">
            {(['all', 'alibaba', 'whatsapp', 'upwork'] as InboxFilter[]).map((f) => {
              const count = platformCounts[f] ?? 0;
              if (f !== 'all' && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setCurrentIndex(0); }}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors',
                    filter === f
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
            <CheckCircle2 className="h-16 w-16 text-green-400" />
            <div>
              <p className="text-lg font-medium text-slate-700">Queue clear</p>
              <p className="text-slate-400 text-sm mt-1">
                {filter !== 'all'
                  ? `No ${filter} items pending. Switch to All or check back later.`
                  : "You're up to date. Check back later."}
              </p>
            </div>
          </div>
        ) : currentItem ? (
          <>
            <FullPageCard
              key={currentItem.id}
              item={currentItem}
              negotiation={negContext}
              index={currentIndex}
              total={filteredItems.length}
              onAction={handleAction}
              onNext={goNext}
            />

            {/* Navigation arrows — desktop only */}
            {currentIndex > 0 && (
              <button
                onClick={goPrev}
                className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 shadow-lg rounded-full p-2 hover:bg-white transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-slate-600" />
              </button>
            )}
            {currentIndex < filteredItems.length - 1 && (
              <button
                onClick={goNext}
                className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 shadow-lg rounded-full p-2 hover:bg-white transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-slate-600" />
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
