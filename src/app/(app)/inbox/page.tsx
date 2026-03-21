'use client';

// ============================================
// /inbox — Decision Queue
// AI-classified inbound messages sorted by tier.
// Tom reviews pre-digested cards and taps to send.
// ============================================
import { useEffect, useState, useCallback } from 'react';
import { PlatformInboxItem, INBOX_TIER_CONFIG, INBOX_PLATFORM_COLORS, InboxStatus } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, X, Edit2, Clock, Send } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── InboxCard ─────────────────────────────────────────────────────────────────
function InboxCard({
  item,
  onAction,
}: {
  item: PlatformInboxItem;
  onAction: (id: string, action: string, customReply?: string) => Promise<void>;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [editText, setEditText]     = useState(item.draft_reply ?? '');
  const [sending, setSending]       = useState(false);
  const [localStatus, setLocalStatus] = useState<InboxStatus>(item.status);

  const tierCfg     = INBOX_TIER_CONFIG[item.approval_tier];
  const platformCfg = INBOX_PLATFORM_COLORS[item.platform];
  const isDone      = ['approved', 'edited', 'rejected', 'snoozed', 'auto_sent'].includes(localStatus);
  const isT3        = item.approval_tier === 3;

  async function act(action: string, custom?: string) {
    setSending(true);
    await onAction(item.id, action, custom);
    setLocalStatus(
      action === 'approve' ? 'approved'
      : action === 'edit'   ? 'edited'
      : action === 'reject' ? 'rejected'
      : 'snoozed'
    );
    setSending(false);
  }

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-white p-4 transition-opacity',
        isDone ? 'opacity-50' : tierCfg.border,
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', platformCfg.bg, platformCfg.text)}>
            {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
          </span>
          <span className="text-sm font-semibold text-slate-900">{item.contact_name ?? item.contact_identifier ?? 'Unknown'}</span>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tierCfg.bg, tierCfg.text)}>
            Tier {item.approval_tier}: {tierCfg.label}
          </span>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{timeAgo(item.created_at)}</span>
      </div>

      {/* AI summary + recommendation */}
      {item.ai_summary && (
        <p className="text-sm font-medium text-slate-800 mb-1">{item.ai_summary}</p>
      )}
      {item.ai_recommendation && (
        <p className="text-xs text-slate-500 mb-2 italic">{item.ai_recommendation}</p>
      )}

      {/* Expandable raw message */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-indigo-600 hover:text-indigo-800 mb-2"
      >
        {expanded ? 'Hide message' : 'Show full message'}
      </button>
      {expanded && (
        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap mb-3 border border-slate-200">
          {item.raw_content}
        </div>
      )}

      {/* Draft textarea — hidden for T3 until editing starts */}
      {!isDone && item.draft_reply && (!isT3 || editing) && (
        <div className="mb-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-indigo-400"
          />
        </div>
      )}

      {/* Done stamp */}
      {isDone && (
        <div className={cn(
          'flex items-center gap-1.5 text-sm font-medium mt-2',
          localStatus === 'rejected' || localStatus === 'snoozed' ? 'text-slate-400' : 'text-green-600'
        )}>
          <CheckCircle2 className="h-4 w-4" />
          {localStatus === 'approved' ? 'Sent' : localStatus === 'edited' ? 'Sent (edited)' : localStatus === 'rejected' ? 'Dismissed' : 'Snoozed'}
        </div>
      )}

      {/* Action buttons */}
      {!isDone && (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {isT3 && !editing ? (
            // Tier 3: show Reply button that opens textarea
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Reply
            </button>
          ) : (
            <>
              {/* Send / Send edited */}
              <button
                disabled={sending}
                onClick={() => {
                  const replyText = editText.trim();
                  if (replyText !== item.draft_reply?.trim()) {
                    act('edit', replyText);
                  } else {
                    act('approve');
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? 'Sending…' : editText.trim() !== item.draft_reply?.trim() ? 'Send edited' : 'Send'}
              </button>
            </>
          )}

          {/* Snooze */}
          <button
            disabled={sending}
            onClick={() => act('snooze')}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" />
            Snooze
          </button>

          {/* Dismiss */}
          <button
            disabled={sending}
            onClick={() => act('reject')}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [items, setItems]       = useState<PlatformInboxItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'pending' | 'done'>('pending');
  const [pendingCount, setPendingCount] = useState(0);

  const fetchItems = useCallback(async (filter: 'pending' | 'done') => {
    try {
      const res  = await fetch(`/api/inbox?status=${filter}`);
      const json = await res.json();
      if (json.items) setItems(json.items);
      if (json.pendingCount !== undefined) setPendingCount(json.pendingCount);
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
      alert(`Action failed: ${err.error}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            AI-classified messages waiting for your decision
            {pendingCount > 0 && (
              <span className="ml-2 bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-6 w-fit">
        {(['pending', 'done'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            )}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-green-400" />
          <div>
            <p className="text-slate-700 font-medium">Queue clear</p>
            <p className="text-slate-400 text-sm mt-1">You&apos;re up to date.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <InboxCard key={item.id} item={item} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}
