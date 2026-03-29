'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { PlatformInboxItem, INBOX_PLATFORM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { ArrowRight, CheckCircle2, MessageCircle, Clock } from 'lucide-react';

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

// Determine message type from context
function getMessageType(item: PlatformInboxItem, neg: NegotiationContext | null): string {
  if (!neg) return 'Message';
  if (neg.message_count && neg.message_count > 0) return 'Follow-up';
  if (neg.negotiation_phase === 'counter_offer') return 'Counter Offer';
  if (neg.negotiation_phase === 'sample') return 'Sample Request';
  return 'First Contact';
}

// ── SwipeCard ────────────────────────────────────────────────────────────────
export default function SwipeCard({
  item,
  negotiation,
  index,
  total,
  stackPosition,
  onAction,
}: SwipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [deltaX, setDeltaX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.draft_reply ?? '');
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setDeltaX(0);
    setIsDragging(false);
    setIsFlying(false);
    setIsEditing(false);
    setEditText(item.draft_reply ?? '');
  }, [item.id, item.draft_reply]);

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

  const platformCfg = INBOX_PLATFORM_COLORS[item.platform] ?? INBOX_PLATFORM_COLORS.alibaba;
  const hasNeg = negotiation && negotiation.negotiation_phase;
  const messageType = getMessageType(item, negotiation);

  return (
    <div
      ref={cardRef}
      className={cn(
        'absolute inset-x-4 rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden select-none',
        stackPosition === 0 ? 'z-30 cursor-grab active:cursor-grabbing' : stackPosition === 1 ? 'z-20' : 'z-10',
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
      {/* Swipe overlays */}
      {stackPosition === 0 && (
        <>
          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center z-40 pointer-events-none rounded-2xl" style={{ opacity: approveOpacity }}>
            <div className="bg-green-500 text-white text-xl font-black px-6 py-2 rounded-xl rotate-[-12deg] border-4 border-green-600">SEND</div>
          </div>
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-40 pointer-events-none rounded-2xl" style={{ opacity: rejectOpacity }}>
            <div className="bg-red-500 text-white text-xl font-black px-6 py-2 rounded-xl rotate-[12deg] border-4 border-red-600">SKIP</div>
          </div>
        </>
      )}

      <div className="p-4">
        {/* Header: message type + counter */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', platformCfg.bg, platformCfg.text)}>
              {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
            </span>
            <span className="text-xs font-medium text-slate-500">{messageType}</span>
          </div>
          <span className="text-xs text-slate-400 font-medium">{index + 1} / {total}</span>
        </div>

        {/* Supplier name */}
        <h2 className="text-lg font-bold text-slate-900 leading-tight">
          {item.contact_name ?? item.contact_identifier ?? 'Unknown'}
        </h2>

        {/* Component + phase + price */}
        {hasNeg && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-slate-500">{negotiation.component_name?.split('(')[0]?.trim()}</span>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', PHASE_COLORS[negotiation.negotiation_phase] ?? 'bg-slate-100 text-slate-600')}>
              {PHASE_LABELS[negotiation.negotiation_phase] ?? negotiation.negotiation_phase}
            </span>
          </div>
        )}

        {/* Quote + MOQ line */}
        {hasNeg && (negotiation.current_quote_usd || negotiation.first_quote_usd || negotiation.moq) && (
          <div className="flex items-center gap-3 mt-2 text-sm">
            {negotiation.first_quote_usd && negotiation.current_quote_usd && negotiation.first_quote_usd !== negotiation.current_quote_usd && (
              <>
                <span className="text-slate-400 line-through">${negotiation.first_quote_usd}</span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </>
            )}
            {negotiation.current_quote_usd && (
              <span className="font-semibold text-slate-700">${negotiation.current_quote_usd}/unit</span>
            )}
            {negotiation.target_price_usd && (
              <span className="text-green-600 text-xs">target ${negotiation.target_price_usd}</span>
            )}
            {negotiation.moq && (
              <span className="text-slate-400 text-xs ml-auto">MOQ {negotiation.moq}</span>
            )}
          </div>
        )}

        {/* Summary - the key decision info */}
        {item.ai_summary && (
          <p className="mt-3 text-sm text-slate-700 leading-relaxed line-clamp-3">
            {item.ai_summary}
          </p>
        )}

        {/* AFTER YOU APPROVE section */}
        {item.platform === 'alibaba' && stackPosition === 0 && !isEditing && (
          <div className="mt-3 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
            <p className="text-xs font-medium text-emerald-800 mb-1">After you approve:</p>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <MessageCircle className="h-3 w-3 shrink-0" />
                <span>Message ready to send on Alibaba chat</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span>Tracked in supplier pipeline</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Monitoring for reply</span>
              </div>
            </div>
          </div>
        )}

        {/* Draft reply */}
        {item.draft_reply && (
          <div className="mt-3">
            {isEditing ? (
              <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-indigo-400"
                  autoFocus
                />
                <button onClick={() => setIsEditing(false)} className="mt-1 text-xs text-indigo-600 font-medium">
                  Done editing
                </button>
              </div>
            ) : (
              <button onClick={() => setIsEditing(true)} className="w-full text-left">
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                  <p className="text-xs text-slate-400 mb-0.5">Draft (tap to edit)</p>
                  <p className="text-sm text-slate-600 line-clamp-2">{editText || item.draft_reply}</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Swipe hint */}
        {stackPosition === 0 && !isEditing && (
          <p className="text-center text-xs text-slate-300 mt-3">
            swipe right to send &middot; left to skip
          </p>
        )}
      </div>
    </div>
  );
}
