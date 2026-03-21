'use client';

// ============================================
// /inbox — Decision Queue
// AI-classified inbound messages sorted by tier.
// Realtime updates via Supabase channel subscription.
// Agent health monitoring strip at bottom.
// ============================================
import { useEffect, useState, useCallback } from 'react';
import {
  InboxItemEnriched,
  AgentHealthStatus,
  INBOX_TIER_CONFIG,
  INBOX_PLATFORM_COLORS,
  CANDIDATE_TIER_COLORS,
  CANDIDATE_STATUS_LABELS,
  MANUFACTURER_STATUS_LABELS,
  MANUFACTURER_STATUS_COLORS,
  InboxStatus,
  CandidateTier,
  ManufacturerStatus,
} from '@/types';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { CheckCircle2, X, Edit2, Clock, Send, MessageCircle } from 'lucide-react';

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

// ── Pipeline context chip ─────────────────────────────────────────────────────
function PipelineChip({ item }: { item: InboxItemEnriched }) {
  if (item._candidate) {
    const c = item._candidate;
    const colors = CANDIDATE_TIER_COLORS[c.tier as CandidateTier] ?? CANDIDATE_TIER_COLORS.maybe;
    return (
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', colors.bg, colors.text)}>
        {c.tier.charAt(0).toUpperCase() + c.tier.slice(1)} — {CANDIDATE_STATUS_LABELS[c.status as keyof typeof CANDIDATE_STATUS_LABELS] ?? c.status}
      </span>
    );
  }
  if (item._manufacturer) {
    const m = item._manufacturer;
    const colors = MANUFACTURER_STATUS_COLORS[m.status as ManufacturerStatus] ?? MANUFACTURER_STATUS_COLORS.prospecting;
    return (
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', colors.bg, colors.text)}>
        {MANUFACTURER_STATUS_LABELS[m.status as ManufacturerStatus] ?? m.status}
      </span>
    );
  }
  return null;
}

// ── InboxCard ─────────────────────────────────────────────────────────────────
function InboxCard({
  item,
  onAction,
}: {
  item: InboxItemEnriched;
  onAction: (id: string, action: string, body?: Record<string, unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [editing, setEditing]         = useState(false);
  const [editText, setEditText]       = useState(item.draft_reply ?? '');
  const [sending, setSending]         = useState(false);
  const [localStatus, setLocalStatus] = useState<InboxStatus>(item.status);

  // "Move to WhatsApp" panel state
  const [showTransition, setShowTransition]     = useState(false);
  const [transitionPhone, setTransitionPhone]   = useState('');
  const [transitionMessage, setTransitionMessage] = useState(
    `Hi ${item.contact_name ?? 'there'}, this is Tom from Everest Labs. Moving our conversation to WhatsApp — looking forward to working with you.`
  );
  const [transitioning, setTransitioning]       = useState(false);

  const tierCfg     = INBOX_TIER_CONFIG[item.approval_tier];
  const platformCfg = INBOX_PLATFORM_COLORS[item.platform];
  const isDone      = ['approved', 'edited', 'rejected', 'snoozed', 'auto_sent', 'transitioned'].includes(localStatus);
  const isT3        = item.approval_tier === 3;
  const canTransition = item.platform !== 'whatsapp' && !isDone;

  async function act(action: string, body?: Record<string, unknown>) {
    setSending(true);
    await onAction(item.id, action, body);
    setLocalStatus(
      action === 'approve'    ? 'approved'
      : action === 'edit'     ? 'edited'
      : action === 'reject'   ? 'rejected'
      : action === 'transition' ? 'transitioned'
      : 'snoozed'
    );
    setSending(false);
  }

  async function handleTransition() {
    if (!/^\d+$/.test(transitionPhone)) {
      alert('Phone must be digits only — e.g. 61412345678');
      return;
    }
    if (!transitionMessage.trim()) {
      alert('Intro message is required');
      return;
    }
    setTransitioning(true);
    await act('transition', { phone: transitionPhone, intro_message: transitionMessage });
    setShowTransition(false);
    setTransitioning(false);
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
          <span className="text-sm font-semibold text-slate-900">
            {item.contact_name ?? item.contact_identifier ?? 'Unknown'}
          </span>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tierCfg.bg, tierCfg.text)}>
            Tier {item.approval_tier}: {tierCfg.label}
          </span>
          <PipelineChip item={item} />
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
          localStatus === 'rejected' || localStatus === 'snoozed' ? 'text-slate-400'
          : localStatus === 'transitioned' ? 'text-green-600'
          : 'text-green-600'
        )}>
          <CheckCircle2 className="h-4 w-4" />
          {localStatus === 'approved'     ? 'Sent'
          : localStatus === 'edited'      ? 'Sent (edited)'
          : localStatus === 'rejected'    ? 'Dismissed'
          : localStatus === 'transitioned'? 'Moved to WhatsApp'
          : 'Snoozed'}
        </div>
      )}

      {/* Action buttons */}
      {!isDone && (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {isT3 && !editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Reply
            </button>
          ) : (
            <button
              disabled={sending}
              onClick={() => {
                const replyText = editText.trim();
                if (replyText !== item.draft_reply?.trim()) {
                  act('edit', { custom_reply: replyText });
                } else {
                  act('approve');
                }
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : editText.trim() !== item.draft_reply?.trim() ? 'Send edited' : 'Send'}
            </button>
          )}

          {/* Move to WhatsApp — only for Upwork / Alibaba items */}
          {canTransition && (
            <button
              onClick={() => setShowTransition(!showTransition)}
              className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Move to WhatsApp
            </button>
          )}

          <button
            disabled={sending}
            onClick={() => act('snooze')}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" />
            Snooze
          </button>

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

      {/* Move to WhatsApp panel */}
      {showTransition && !isDone && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-green-800">Move to WhatsApp</p>
          <input
            type="text"
            placeholder="Phone number (digits only — e.g. 61412345678)"
            value={transitionPhone}
            onChange={(e) => setTransitionPhone(e.target.value.replace(/\D/g, ''))}
            className="w-full text-sm bg-white border border-green-200 rounded-lg px-3 py-2 outline-none focus:border-green-400"
          />
          <textarea
            value={transitionMessage}
            onChange={(e) => setTransitionMessage(e.target.value)}
            rows={3}
            className="w-full text-sm bg-white border border-green-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-green-400"
          />
          <div className="flex gap-2">
            <button
              disabled={transitioning}
              onClick={handleTransition}
              className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {transitioning ? 'Sending…' : 'Send intro & transition'}
            </button>
            <button
              onClick={() => setShowTransition(false)}
              className="text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Health Strip ────────────────────────────────────────────────────────
const HEALTH_COLORS: Record<AgentHealthStatus['health'], string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  red:   'bg-red-500',
};

function AgentHealthStrip({ agents }: { agents: AgentHealthStatus[] }) {
  if (agents.length === 0) return null;
  return (
    <div className="mt-10 p-3 bg-slate-50 border border-slate-200 rounded-xl">
      <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Agent Status</p>
      <div className="flex flex-wrap gap-4">
        {agents.map((a) => (
          <div key={a.agent_name} className="flex items-center gap-2 text-xs text-slate-600">
            <span className={cn('h-2 w-2 rounded-full shrink-0', HEALTH_COLORS[a.health])} />
            <span className="font-medium">{a.agent_name.replace(/-/g, ' ')}</span>
            <span className="text-slate-400">{timeAgo(a.last_run_at)}</span>
            {a.items_processed > 0 && (
              <span className="text-slate-400">({a.items_processed} item{a.items_processed !== 1 ? 's' : ''})</span>
            )}
            {a.last_status === 'error' && a.error_message && (
              <span className="text-red-500 truncate max-w-[140px]" title={a.error_message}>
                — {a.error_message}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [items, setItems]             = useState<InboxItemEnriched[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<'pending' | 'done'>('pending');
  const [pendingCount, setPendingCount] = useState(0);
  const [agentHealth, setAgentHealth] = useState<AgentHealthStatus[]>([]);

  const supabase = createClient();

  const fetchItems = useCallback(async (filter: 'pending' | 'done') => {
    try {
      const res  = await fetch(`/api/inbox?status=${filter}`);
      const json = await res.json();
      if (json.items)        setItems(json.items);
      if (json.pendingCount !== undefined) setPendingCount(json.pendingCount);
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAgentHealth = useCallback(async () => {
    try {
      const res  = await fetch('/api/agent-health');
      const json = await res.json();
      if (json.agents) setAgentHealth(json.agents);
    } catch {
      // non-critical — silently ignore
    }
  }, []);

  // Initial load + Realtime subscription
  useEffect(() => {
    setLoading(true);
    fetchItems(tab);
    fetchAgentHealth();

    const channel = supabase
      .channel('inbox_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_inbox' }, () => {
        fetchItems(tab);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchItems]);

  // Refresh agent health every 60s (low-frequency monitoring)
  useEffect(() => {
    const interval = setInterval(fetchAgentHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchAgentHealth]);

  async function handleAction(id: string, action: string, body?: Record<string, unknown>) {
    const payload: Record<string, unknown> = { action, ...body };

    const res = await fetch(`/api/inbox/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
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

      {/* Agent health strip */}
      <AgentHealthStrip agents={agentHealth} />
    </div>
  );
}
