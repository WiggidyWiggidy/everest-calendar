'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { PlatformInboxItem } from '@/types';
import { cn } from '@/lib/utils';
import { ArrowRight, Send, Pencil, X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface NegotiationContext {
  component_name: string;
  negotiation_phase: string;
  target_price_usd: number | null;
  current_quote_usd: number | null;
  first_quote_usd: number | null;
  quote_count: number;
  moq?: number | null;
  message_count?: number;
}

interface SwipeCardProps {
  item: PlatformInboxItem;
  negotiation: NegotiationContext | null;
  index: number;
  total: number;
  stackPosition: number;
  onAction: (id: string, action: string, customReply?: string) => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 100;
const INDICATOR_START = 30;
const FLY_DISTANCE = 1500;
const ROTATION_FACTOR = 0.06;

const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovery', quote_collection: 'Quoting', counter_offer: 'Counter',
  sample: 'Sample', factory_visit: 'Visit', production_terms: 'Terms',
  closed_won: 'Won', closed_lost: 'Lost',
};

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-slate-200 text-slate-700', quote_collection: 'bg-blue-100 text-blue-700',
  counter_offer: 'bg-amber-100 text-amber-700', sample: 'bg-purple-100 text-purple-700',
  factory_visit: 'bg-indigo-100 text-indigo-700', production_terms: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700', closed_lost: 'bg-red-100 text-red-700',
};

function getMessageType(neg: NegotiationContext | null): string {
  if (!neg) return 'Message';
  if (neg.message_count && neg.message_count > 0) return 'Follow-up';
  if (neg.negotiation_phase === 'counter_offer') return 'Counter Offer';
  if (neg.negotiation_phase === 'sample') return 'Sample Request';
  return 'First Contact';
}

function getPriceGap(current: number | null, target: number | null): { text: string; color: string } | null {
  if (!current || !target) return null;
  if (current <= target) return { text: 'At target', color: 'text-green-600' };
  const pct = Math.round(((current - target) / target) * 100);
  return { text: `${pct}% above target`, color: pct > 30 ? 'text-red-500' : 'text-amber-600' };
}

// ── SwipeCard ────────────────────────────────────────────────────────────────
export default function SwipeCard({
  item, negotiation, index, total, stackPosition, onAction,
}: SwipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [deltaX, setDeltaX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.draft_reply ?? '');
  const [sending, setSending] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setDeltaX(0); setIsDragging(false); setIsFlying(false);
    setIsEditing(false); setEditText(item.draft_reply ?? ''); setSending(false);
  }, [item.id, item.draft_reply]);

  // ── Swipe handlers (mobile) ───────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (stackPosition !== 0 || isEditing || isFlying) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [stackPosition, isEditing, isFlying]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || isFlying) return;
    setDeltaX(e.clientX - startRef.current.x);
  }, [isDragging, isFlying]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging || isFlying) return;
    setIsDragging(false);
    if (deltaX > SWIPE_THRESHOLD) {
      setIsFlying(true);
      setDeltaX(FLY_DISTANCE);
      setTimeout(() => {
        const text = editText.trim();
        const isEdited = text !== (item.draft_reply ?? '').trim();
        onAction(item.id, isEdited ? 'edit' : 'approve', isEdited ? text : undefined);
      }, 350);
    } else if (deltaX < -SWIPE_THRESHOLD) {
      setIsFlying(true);
      setDeltaX(-FLY_DISTANCE);
      setTimeout(() => onAction(item.id, 'reject'), 350);
    } else {
      setDeltaX(0);
    }
  }, [isDragging, isFlying, deltaX, editText, item.id, item.draft_reply, onAction]);

  // ── Desktop button handlers ───────────────────────────────────────────
  async function handleDesktopSend() {
    setSending(true);
    const text = editText.trim();
    const isEdited = text !== (item.draft_reply ?? '').trim();
    await onAction(item.id, isEdited ? 'edit' : 'approve', isEdited ? text : undefined);
  }

  async function handleDesktopSkip() {
    setSending(true);
    await onAction(item.id, 'reject');
  }

  // ── Render helpers ────────────────────────────────────────────────────
  const approveOpacity = Math.min(1, Math.max(0, (deltaX - INDICATOR_START) / (SWIPE_THRESHOLD - INDICATOR_START)));
  const rejectOpacity = Math.min(1, Math.max(0, (-deltaX - INDICATOR_START) / (SWIPE_THRESHOLD - INDICATOR_START)));

  const stackScale = 1 - stackPosition * 0.05;
  const stackTranslateY = stackPosition * 10;
  const stackOpacity = stackPosition === 0 ? 1 : stackPosition === 1 ? 0.6 : 0.3;

  const transform = stackPosition === 0
    ? `translateX(${deltaX}px) translateY(-50%) rotate(${deltaX * ROTATION_FACTOR}deg)`
    : `scale(${stackScale}) translateY(calc(-50% + ${stackTranslateY}px))`;

  const transition = isDragging ? 'none'
    : isFlying ? 'transform 0.35s ease-in, opacity 0.35s ease-in'
    : 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1.0), opacity 0.3s ease';

  const hasNeg = negotiation && negotiation.negotiation_phase;
  const messageType = getMessageType(negotiation);
  const priceGap = hasNeg ? getPriceGap(negotiation.current_quote_usd, negotiation.target_price_usd) : null;

  return (
    <div
      ref={cardRef}
      className={cn(
        'absolute inset-x-4 lg:inset-x-auto lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2 rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden select-none',
        stackPosition === 0 ? 'z-30 lg:cursor-default cursor-grab active:cursor-grabbing' : stackPosition === 1 ? 'z-20' : 'z-10',
      )}
      style={{
        transform, transition,
        opacity: isFlying ? 0 : stackOpacity,
        touchAction: isEditing ? 'auto' : 'none',
        top: '35%',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Swipe overlays (mobile only) */}
      {stackPosition === 0 && (
        <>
          <div className="lg:hidden absolute inset-0 bg-green-500/20 flex items-center justify-center z-40 pointer-events-none rounded-2xl" style={{ opacity: approveOpacity }}>
            <div className="bg-green-500 text-white text-xl font-black px-6 py-2 rounded-xl rotate-[-12deg] border-4 border-green-600">SEND</div>
          </div>
          <div className="lg:hidden absolute inset-0 bg-red-500/20 flex items-center justify-center z-40 pointer-events-none rounded-2xl" style={{ opacity: rejectOpacity }}>
            <div className="bg-red-500 text-white text-xl font-black px-6 py-2 rounded-xl rotate-[12deg] border-4 border-red-600">SKIP</div>
          </div>
        </>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{messageType}</span>
          <span className="text-xs text-slate-400 font-medium">{index + 1} / {total}</span>
        </div>

        {/* Supplier name */}
        <h2 className="text-lg font-bold text-slate-900 leading-tight">
          {item.contact_name ?? item.contact_identifier ?? 'Unknown'}
        </h2>

        {/* Component + phase */}
        {hasNeg && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-slate-500">{negotiation.component_name?.split('(')[0]?.trim()}</span>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', PHASE_COLORS[negotiation.negotiation_phase] ?? 'bg-slate-100 text-slate-600')}>
              {PHASE_LABELS[negotiation.negotiation_phase] ?? negotiation.negotiation_phase}
            </span>
          </div>
        )}

        {/* Price bar */}
        {hasNeg && (negotiation.current_quote_usd || negotiation.moq) && (
          <div className="flex items-center gap-3 mt-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
            {negotiation.current_quote_usd && (
              <span className="font-semibold text-slate-800">${negotiation.current_quote_usd}/unit</span>
            )}
            {negotiation.target_price_usd && (
              <>
                <ArrowRight className="h-3 w-3 text-slate-300" />
                <span className="text-green-600 font-medium">${negotiation.target_price_usd} target</span>
              </>
            )}
            {priceGap && (
              <span className={cn('text-xs font-medium ml-auto', priceGap.color)}>{priceGap.text}</span>
            )}
            {!priceGap && negotiation.moq && (
              <span className="text-slate-400 text-xs ml-auto">MOQ {negotiation.moq}</span>
            )}
          </div>
        )}

        {/* Context / Summary */}
        {item.ai_summary && (
          <p className="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-3">
            {item.ai_summary}
          </p>
        )}

        {/* Draft */}
        {item.draft_reply && (
          <div className="mt-3">
            {isEditing ? (
              <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={5}
                  className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  autoFocus
                />
                <button onClick={() => setIsEditing(false)} className="mt-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800">
                  Done editing
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditing(true)}
                className="bg-indigo-50/50 rounded-lg px-3 py-2.5 border border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-indigo-400">Draft message</span>
                  <Pencil className="h-3 w-3 text-indigo-300" />
                </div>
                <p className="text-sm text-slate-700 line-clamp-3">{editText || item.draft_reply}</p>
              </div>
            )}
          </div>
        )}

        {/* Mobile swipe hint */}
        {stackPosition === 0 && !isEditing && (
          <p className="lg:hidden text-center text-xs text-slate-300 mt-3">
            swipe right to send · left to skip
          </p>
        )}
      </div>

      {/* ── Desktop action buttons ────────────────────────────────────── */}
      {stackPosition === 0 && !isEditing && (
        <div className="hidden lg:flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            disabled={sending}
            onClick={handleDesktopSend}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : editText.trim() !== (item.draft_reply ?? '').trim() ? 'Send Edited' : 'Send'}
          </button>
          <button
            disabled={sending}
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 font-medium px-4 py-2.5 rounded-xl border border-slate-200 transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            disabled={sending}
            onClick={handleDesktopSkip}
            className="flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 text-red-500 font-medium px-4 py-2.5 rounded-xl border border-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
