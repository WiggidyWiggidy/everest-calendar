'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { PlatformInboxItem, INBOX_PLATFORM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface NegotiationContext {
  component_name: string;
  negotiation_phase: string;
  target_price_usd: number | null;
  current_quote_usd: number | null;
  first_quote_usd: number | null;
  quote_count: number;
}

interface SwipeCardProps {
  item: PlatformInboxItem;
  negotiation: NegotiationContext | null;
  index: number;
  total: number;
  stackPosition: number; // 0 = top (interactive), 1/2 = behind
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

  // Reset when item changes
  useEffect(() => {
    setDeltaX(0);
    setIsDragging(false);
    setIsFlying(false);
    setIsEditing(false);
    setEditText(item.draft_reply ?? '');
  }, [item.id, item.draft_reply]);

  // ── Pointer handlers ────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (stackPosition !== 0 || isEditing || isFlying) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [stackPosition, isEditing, isFlying]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || isFlying) return;
    const dx = e.clientX - startRef.current.x;
    setDeltaX(dx);
  }, [isDragging, isFlying]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging || isFlying) return;
    setIsDragging(false);

    if (deltaX > SWIPE_THRESHOLD) {
      // Approve - fly right
      setIsFlying(true);
      setDeltaX(FLY_DISTANCE);
      setTimeout(() => {
        const text = editText.trim();
        const isEdited = text !== (item.draft_reply ?? '').trim();
        onAction(item.id, isEdited ? 'edit' : 'approve', isEdited ? text : undefined);
      }, 350);
    } else if (deltaX < -SWIPE_THRESHOLD) {
      // Reject - fly left
      setIsFlying(true);
      setDeltaX(-FLY_DISTANCE);
      setTimeout(() => {
        onAction(item.id, 'reject');
      }, 350);
    } else {
      // Spring back
      setDeltaX(0);
    }
  }, [isDragging, isFlying, deltaX, editText, item.id, item.draft_reply, onAction]);

  // ── Indicator opacity ────────────────────────────────────────────────────
  const approveOpacity = Math.min(1, Math.max(0, (deltaX - INDICATOR_START) / (SWIPE_THRESHOLD - INDICATOR_START)));
  const rejectOpacity = Math.min(1, Math.max(0, (-deltaX - INDICATOR_START) / (SWIPE_THRESHOLD - INDICATOR_START)));

  // ── Stack transforms ────────────────────────────────────────────────────
  const stackScale = 1 - stackPosition * 0.05;
  const stackTranslateY = stackPosition * 10;
  const stackOpacity = stackPosition === 0 ? 1 : stackPosition === 1 ? 0.6 : 0.3;

  const transform = stackPosition === 0
    ? `translateX(${deltaX}px) translateY(-50%) rotate(${deltaX * ROTATION_FACTOR}deg)`
    : `scale(${stackScale}) translateY(calc(-50% + ${stackTranslateY}px))`;

  const transition = isDragging
    ? 'none'
    : isFlying
      ? 'transform 0.35s ease-in, opacity 0.35s ease-in'
      : 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1.0), opacity 0.3s ease';

  const platformCfg = INBOX_PLATFORM_COLORS[item.platform] ?? INBOX_PLATFORM_COLORS.alibaba;
  const hasNeg = negotiation && negotiation.negotiation_phase;

  return (
    <div
      ref={cardRef}
      className={cn(
        'absolute inset-x-4 rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden select-none',
        stackPosition === 0 ? 'z-30 cursor-grab active:cursor-grabbing' : stackPosition === 1 ? 'z-20' : 'z-10',
        isFlying && 'opacity-0',
      )}
      style={{
        transform,
        transition,
        opacity: isFlying ? 0 : stackOpacity,
        touchAction: isEditing ? 'auto' : 'none',
        top: '50%',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* ── Swipe indicator overlays ──────────────────────────────────────── */}
      {stackPosition === 0 && (
        <>
          {/* Approve overlay */}
          <div
            className="absolute inset-0 bg-green-500/20 flex items-center justify-center z-40 pointer-events-none rounded-2xl"
            style={{ opacity: approveOpacity }}
          >
            <div className="bg-green-500 text-white text-xl font-black px-6 py-2 rounded-xl rotate-[-12deg] border-4 border-green-600">
              APPROVE
            </div>
          </div>
          {/* Reject overlay */}
          <div
            className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-40 pointer-events-none rounded-2xl"
            style={{ opacity: rejectOpacity }}
          >
            <div className="bg-red-500 text-white text-xl font-black px-6 py-2 rounded-xl rotate-[12deg] border-4 border-red-600">
              SKIP
            </div>
          </div>
        </>
      )}

      {/* ── Card content ──────────────────────────────────────────────────── */}
      <div className="p-4">
        {/* Header: platform + counter */}
        <div className="flex items-center justify-between mb-3">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', platformCfg.bg, platformCfg.text)}>
            {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
          </span>
          <span className="text-xs text-slate-400 font-medium">{index + 1} / {total}</span>
        </div>

        {/* Contact name */}
        <h2 className="text-lg font-bold text-slate-900 leading-tight">
          {item.contact_name ?? item.contact_identifier ?? 'Unknown'}
        </h2>

        {/* Component + phase (supplier items only) */}
        {hasNeg && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-slate-500">{negotiation.component_name}</span>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', PHASE_COLORS[negotiation.negotiation_phase] ?? 'bg-slate-100 text-slate-600')}>
              {PHASE_LABELS[negotiation.negotiation_phase] ?? negotiation.negotiation_phase}
            </span>
          </div>
        )}

        {/* Quote trajectory */}
        {hasNeg && (negotiation.first_quote_usd || negotiation.target_price_usd) && (
          <div className="flex items-center gap-2 mt-2 text-sm">
            {negotiation.first_quote_usd && (
              <span className="text-slate-600">${negotiation.first_quote_usd}</span>
            )}
            {negotiation.first_quote_usd && negotiation.current_quote_usd && negotiation.first_quote_usd !== negotiation.current_quote_usd && (
              <>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span className="font-semibold text-indigo-600">${negotiation.current_quote_usd}</span>
              </>
            )}
            {negotiation.target_price_usd && (
              <>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span className="font-semibold text-green-600">${negotiation.target_price_usd}</span>
                <span className="text-xs text-slate-400">target</span>
              </>
            )}
          </div>
        )}

        {/* AI Summary */}
        {item.ai_summary && (
          <p className="mt-3 text-sm text-slate-700 leading-relaxed line-clamp-3">
            {item.ai_summary}
          </p>
        )}

        {/* AI Recommendation */}
        {item.ai_recommendation && (
          <p className="mt-1 text-xs text-slate-500 italic line-clamp-2">
            {item.ai_recommendation}
          </p>
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
                <button
                  onClick={() => setIsEditing(false)}
                  className="mt-1 text-xs text-indigo-600 font-medium"
                >
                  Done editing
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full text-left"
              >
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                  <p className="text-xs text-slate-400 mb-0.5">Draft reply (tap to edit)</p>
                  <p className="text-sm text-slate-600 line-clamp-2">{editText || item.draft_reply}</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Swipe hint */}
        {stackPosition === 0 && !isEditing && (
          <p className="text-center text-xs text-slate-300 mt-4">
            swipe right to approve &middot; left to skip
          </p>
        )}
      </div>
    </div>
  );
}
