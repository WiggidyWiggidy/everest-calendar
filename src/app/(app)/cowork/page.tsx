'use client';

// ============================================
// /cowork — WhatsApp CAD Cowork Thread
// Shows inbound messages from the CAD designer,
// Claude-drafted replies for review, and a
// compose box for direct messages.
// ============================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { CoworkMessage, CoworkContact } from '@/types';
import { cn } from '@/lib/utils';
import { MessageSquare, Send, Trash2, RefreshCw, Edit2, Check, X, BookOpen, ChevronUp, ChevronDown, FileText, Users } from 'lucide-react';
import dynamic from 'next/dynamic';

const PushNotificationButton = dynamic(
  () => import('@/components/global/PushNotificationButton'),
  { ssr: false }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── Date separator ────────────────────────────────────────────────────────────
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400 font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

// ── Design Brief panel ────────────────────────────────────────────────────────
function DesignBriefPanel({ contactKey }: { contactKey: string }) {
  const [brief, setBrief]       = useState('');
  const [draft, setDraft]       = useState('');
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    setBrief(''); setDraft('');
    fetch(`/api/cowork/context?contact_key=${encodeURIComponent(contactKey)}`)
      .then((r) => r.json())
      .then(({ brief: b }) => { setBrief(b ?? ''); setDraft(b ?? ''); })
      .catch(() => {});
  }, [contactKey]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/cowork/context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: draft, contact_key: contactKey }),
      });
      if (res.ok) {
        const { brief: b } = await res.json();
        setBrief(b);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const isDirty = draft !== brief;

  return (
    <div className="mb-3 shrink-0 border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-500" />
          <span>Design Brief</span>
          {brief && (
            <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-normal">
              {brief.length > 60 ? brief.slice(0, 60) + '…' : brief}
            </span>
          )}
          {!brief && (
            <span className="text-xs text-slate-400 font-normal">
              Add context — Claude reads this before every draft reply
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-200 p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Describe the current design state — revision number, what's agreed, what's still outstanding.\n\nExample: "Rev 4 — corner radius agreed 3mm, material 1.5mm 5052-H32. Outstanding: ventilation cutout position (lower-rear panel), cable grommet size."`}
            rows={5}
            className="w-full text-sm text-slate-800 placeholder-slate-400 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400">
              Injected into Claude&apos;s context before every reply draft.
            </p>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save brief'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({
  message,
  onSend,
  onDiscard,
  onSaveEdit,
}: {
  message:     CoworkMessage;
  onSend:      (id: string, editedContent?: string) => Promise<void>;
  onDiscard:   (id: string) => Promise<void>;
  onSaveEdit:  (id: string, content: string) => Promise<void>;
}) {
  const [editing, setEditing]   = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [sending, setSending]   = useState(false);

  const isInbound = message.direction === 'inbound';
  const isDraft   = message.status === 'draft';
  const isSent    = message.status === 'sent';

  async function handleSend() {
    setSending(true);
    await onSend(message.id, editing ? editText : undefined);
    setSending(false);
    setEditing(false);
  }

  async function handleSaveEdit() {
    await onSaveEdit(message.id, editText);
    setEditing(false);
  }

  return (
    <div className={cn('flex mb-3', isInbound ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[72%]')}>
        {/* Labels */}
        {isInbound && message.sender_name && (
          <p className="text-xs text-slate-500 mb-1 ml-1">{message.sender_name}</p>
        )}
        {isDraft && (
          <p className="text-xs text-amber-600 font-semibold mb-1 mr-1 text-right uppercase tracking-wide">
            Claude draft — review before sending
          </p>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isInbound
              ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
              : isDraft
                ? 'bg-amber-50 border-2 border-amber-300 text-slate-800 rounded-tr-sm'
                : 'bg-indigo-600 text-white rounded-tr-sm shadow-sm'
          )}
        >
          {/* Image attachment */}
          {message.media_url && message.media_type?.startsWith('image/') && (
            <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.media_url}
                alt="Attachment"
                className="rounded-lg max-w-full max-h-64 object-contain"
              />
            </a>
          )}
          {message.media_url && message.media_type && !message.media_type.startsWith('image/') && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 mb-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                isInbound
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-white/20 hover:bg-white/30 text-inherit'
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{message.content.replace(/^\[File: /, '').replace(/\]$/, '')}</span>
              <span className="shrink-0 opacity-60">↗</span>
            </a>
          )}
          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-transparent resize-none outline-none text-slate-800 min-h-[80px]"
              autoFocus
            />
          ) : (
            !message.content.startsWith('[') && (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )
          )}
        </div>

        {/* Footer */}
        <div className={cn('flex items-center gap-2 mt-1.5', isInbound ? 'ml-1' : 'mr-1 justify-end')}>
          <span className="text-xs text-slate-400">
            {formatTime(isSent && message.sent_at ? message.sent_at : message.created_at)}
            {isSent && ' · Sent'}
          </span>
        </div>

        {/* Draft action bar */}
        {isDraft && (
          <div className="flex items-center gap-2 mt-2 justify-end">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditText(message.content); }}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save edit
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? 'Sending…' : 'Send edited'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => onDiscard(message.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CoworkPage() {
  const [contacts, setContacts]   = useState<CoworkContact[]>([{ id: 'default', key: 'cad_designer', display_name: 'CAD Designer', phone: null }]);
  const [activeKey, setActiveKey] = useState('cad_designer');
  const [messages, setMessages]   = useState<CoworkMessage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [compose, setCompose]     = useState('');
  const [composing, setComposing] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);

  // Load contacts once
  useEffect(() => {
    fetch('/api/cowork/contacts')
      .then((r) => r.json())
      .then(({ contacts: c }) => { if (c?.length) setContacts(c); })
      .catch(() => {});
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/cowork?contact_key=${encodeURIComponent(activeKey)}`);
      const json = await res.json();
      if (json.messages) setMessages(json.messages);
    } catch (err) {
      console.error('Failed to fetch cowork messages:', err);
    } finally {
      setLoading(false);
    }
  }, [activeKey]);

  // Refetch when contact tab changes
  useEffect(() => { setLoading(true); setMessages([]); fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 15_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  async function handleSend(id: string, editedContent?: string) {
    const body: Record<string, unknown> = { action: 'send' };
    if (editedContent) body.content = editedContent;

    const res = await fetch(`/api/cowork/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const { message } = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === id ? message : m)));
    } else {
      const err = await res.json();
      alert(`Send failed: ${err.error}`);
    }
  }

  async function handleDiscard(id: string) {
    const res = await fetch(`/api/cowork/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
  }

  async function handleSaveEdit(id: string, content: string) {
    const res = await fetch(`/api/cowork/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', content }),
    });
    if (res.ok) {
      const { message } = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === id ? message : m)));
    }
  }

  async function handleComposeSend() {
    if (!compose.trim()) return;
    setComposing(true);
    try {
      const res = await fetch('/api/cowork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: compose.trim(), send_immediately: true, contact_key: activeKey }),
      });
      if (res.ok) {
        const { message } = await res.json();
        setMessages((prev) => [...prev, message]);
        setCompose('');
      } else {
        const err = await res.json();
        alert(`Send failed: ${err.error}`);
      }
    } finally {
      setComposing(false);
    }
  }

  const draftCount = messages.filter((m) => m.status === 'draft').length;

  // Render messages with date separators
  const renderedMessages: React.ReactNode[] = [];
  let lastDateLabel = '';
  messages.forEach((msg, i) => {
    const label = getDateLabel(msg.created_at);
    if (label !== lastDateLabel) {
      renderedMessages.push(<DateSeparator key={`sep-${i}`} label={label} />);
      lastDateLabel = label;
    }
    renderedMessages.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        onSend={handleSend}
        onDiscard={handleDiscard}
        onSaveEdit={handleSaveEdit}
      />
    );
  });

  const activeContact = contacts.find((c) => c.key === activeKey) ?? contacts[0];

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MessageSquare className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cowork</h1>
            <p className="text-sm text-slate-500">
              WhatsApp threads
              {draftCount > 0 && (
                <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {draftCount} draft{draftCount !== 1 ? 's' : ''} to review
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PushNotificationButton />
          <button
            onClick={fetchMessages}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Contact tabs */}
      {contacts.length > 0 && (
        <div className="flex items-center gap-1 mb-3 shrink-0 overflow-x-auto pb-1">
          <Users className="h-4 w-4 text-slate-400 mr-1 shrink-0" />
          {contacts.map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveKey(c.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                activeKey === c.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {c.display_name}
            </button>
          ))}
        </div>
      )}

      {/* Design Brief */}
      <DesignBriefPanel contactKey={activeContact?.key ?? 'cad_designer'} />

      {/* Thread */}
      <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-y-auto p-4 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <MessageSquare className="h-12 w-12 text-slate-300" />
            <div>
              <p className="text-slate-600 font-medium">No messages yet</p>
              <p className="text-slate-400 text-sm mt-1">
                When your CAD designer messages you on WhatsApp, the thread appears here.
                <br />
                Claude automatically drafts a reply for you to review.
              </p>
            </div>
          </div>
        ) : (
          <>
            {renderedMessages}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Compose bar */}
      <div className="mt-3 shrink-0">
        <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
          <textarea
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleComposeSend();
              }
            }}
            placeholder="Type a message… (⌘↵ or Ctrl↵ to send)"
            rows={2}
            className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 outline-none px-2 py-1"
          />
          <button
            onClick={handleComposeSend}
            disabled={composing || !compose.trim()}
            className="self-end flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {composing ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 ml-1">
          Compose sends directly via WhatsApp. Claude drafts appear automatically when your CAD designer messages you.
        </p>
      </div>
    </div>
  );
}
