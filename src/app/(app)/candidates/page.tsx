'use client';

// ============================================
// /candidates — Upwork Candidate Pipeline
// Reads, tiers, and tracks engineering candidates
// for the aluminium enclosure project
// ============================================
import { useEffect, useState, useCallback } from 'react';
import {
  UpworkCandidate,
  CandidateTier,
  CandidateStatus,
  CANDIDATE_TIER_COLORS,
  CANDIDATE_STATUS_LABELS,
} from '@/types';
import { cn } from '@/lib/utils';
import { Users, ChevronDown, ChevronUp, ExternalLink, RefreshCw, MessageCircle, Send, X } from 'lucide-react';

// ── Score bar ───────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-400 text-sm">—</span>;
  const color = score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-medium text-slate-700">{score}</span>
    </div>
  );
}

// ── TransitionPanel — inline WhatsApp intro sender ──────────────────────────
function TransitionPanel({
  candidate,
  onClose,
  onSuccess,
}: {
  candidate: UpworkCandidate;
  onClose: () => void;
  onSuccess: (id: string) => void;
}) {
  const defaultMsg = `Hi ${candidate.name}, this is Tom from Everest Labs. I'd like to move our collaboration to WhatsApp for faster communication. Looking forward to working with you!`;
  const [phone, setPhone]       = useState('');
  const [message, setMessage]   = useState(defaultMsg);
  const [sending, setSending]   = useState(false);
  const [phoneErr, setPhoneErr] = useState('');

  async function handleSend() {
    if (!/^\d+$/.test(phone.trim())) {
      setPhoneErr('Digits only — no spaces or dashes');
      return;
    }
    if (!message.trim()) return;
    setPhoneErr('');
    setSending(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), intro_message: message.trim() }),
      });
      if (res.ok) {
        onSuccess(candidate.id);
        onClose();
      } else {
        const err = await res.json();
        alert(`Send failed: ${err.error}`);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <tr className="bg-green-50 border-b border-green-200">
      <td colSpan={8} className="px-6 py-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-semibold text-slate-800">
            Send WhatsApp intro to {candidate.name}
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Phone (digits only, with country code)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="447700900000"
              className={cn(
                'w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-400',
                phoneErr ? 'border-red-400' : 'border-slate-200'
              )}
            />
            {phoneErr && <p className="text-xs text-red-500 mt-1">{phoneErr}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={handleSend}
            disabled={sending || !phone.trim() || !message.trim()}
            className="flex items-center gap-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send & Create Contact'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Candidate row (expandable) ──────────────────────────────────────────────
function CandidateRow({
  candidate,
  onTierChange,
  onStatusChange,
  onHired,
}: {
  candidate: UpworkCandidate;
  onTierChange:   (id: string, tier: CandidateTier) => void;
  onStatusChange: (id: string, status: CandidateStatus) => void;
  onHired:        (id: string) => void;
}) {
  const [expanded, setExpanded]         = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
            )}
            <div>
              <p className="font-medium text-slate-900 text-sm">{candidate.name}</p>
              {candidate.location && (
                <p className="text-xs text-slate-500">{candidate.location}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">
          {candidate.hourly_rate != null ? `$${candidate.hourly_rate}/hr` : '—'}
          {candidate.hourly_rate != null && candidate.hourly_rate > 40 && (
            <span className="ml-1 text-xs text-amber-600 font-medium">↑ negotiate</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">
          {candidate.job_success_score != null ? `${candidate.job_success_score}%` : '—'}
        </td>
        <td className="px-4 py-3">
          <ScoreBar score={candidate.score} />
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={candidate.tier}
            onChange={(e) => onTierChange(candidate.id, e.target.value as CandidateTier)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="top">Top</option>
            <option value="maybe">Maybe</option>
            <option value="reject">Reject</option>
          </select>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={candidate.status}
            onChange={(e) => onStatusChange(candidate.id, e.target.value as CandidateStatus)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(Object.keys(CANDIDATE_STATUS_LABELS) as CandidateStatus[]).map((s) => (
              <option key={s} value={s}>{CANDIDATE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {candidate.upwork_profile_url ? (
            <a
              href={candidate.upwork_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              Profile <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-slate-400 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {candidate.status === 'hired' ? (
            <span className="text-xs text-green-600 font-medium">Hired ✓</span>
          ) : (
            <button
              onClick={() => setShowTransition((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors',
                showTransition
                  ? 'bg-green-600 text-white'
                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              )}
            >
              <MessageCircle className="h-3 w-3" />
              WhatsApp
            </button>
          )}
        </td>
      </tr>

      {/* Transition panel */}
      {showTransition && (
        <TransitionPanel
          candidate={candidate}
          onClose={() => setShowTransition(false)}
          onSuccess={onHired}
        />
      )}

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {candidate.proposal_snippet && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Proposal</p>
                  <p className="text-slate-700 leading-relaxed">{candidate.proposal_snippet}</p>
                </div>
              )}
              <div className="space-y-3">
                {candidate.strengths && candidate.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Strengths</p>
                    <ul className="space-y-0.5">
                      {candidate.strengths.map((s, i) => (
                        <li key={i} className="text-slate-700 flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5">✓</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {candidate.weaknesses && candidate.weaknesses.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Weaknesses</p>
                    <ul className="space-y-0.5">
                      {candidate.weaknesses.map((w, i) => (
                        <li key={i} className="text-slate-700 flex items-start gap-1.5">
                          <span className="text-red-400 mt-0.5">✗</span> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {candidate.manufacturing_experience && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Manufacturing</p>
                    <p className="text-slate-700">{candidate.manufacturing_experience}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                  {candidate.enclosures_count != null && (
                    <span><strong>{candidate.enclosures_count}</strong> enclosures manufactured</span>
                  )}
                  {candidate.cad_software && candidate.cad_software.length > 0 && (
                    <span>CAD: {candidate.cad_software.join(', ')}</span>
                  )}
                </div>
                {candidate.evaluator_notes && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-slate-700">{candidate.evaluator_notes}</p>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<UpworkCandidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tierFilter, setTierFilter]     = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tierFilter)   params.set('tier', tierFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/candidates?${params.toString()}`);
      const json = await res.json();
      if (json.candidates) setCandidates(json.candidates);
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoading(false);
    }
  }, [tierFilter, statusFilter]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  async function handleTierChange(id: string, tier: CandidateTier) {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, tier } : c));
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
  }

  async function handleStatusChange(id: string, status: CandidateStatus) {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
    await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  function handleHired(id: string) {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, status: 'hired' } : c));
  }

  const topCount    = candidates.filter((c) => c.tier === 'top').length;
  const maybeCount  = candidates.filter((c) => c.tier === 'maybe').length;
  const rejectCount = candidates.filter((c) => c.tier === 'reject').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Users className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Upwork Candidates</h1>
            <p className="text-sm text-slate-500">Aluminium enclosure engineering role</p>
          </div>
        </div>
        <button
          onClick={fetchCandidates}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Tier summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Top',    count: topCount,    tier: 'top'    as CandidateTier },
          { label: 'Maybe',  count: maybeCount,  tier: 'maybe'  as CandidateTier },
          { label: 'Reject', count: rejectCount, tier: 'reject' as CandidateTier },
        ].map(({ label, count, tier }) => {
          const colors = CANDIDATE_TIER_COLORS[tier];
          return (
            <button
              key={tier}
              onClick={() => setTierFilter(tierFilter === tier ? '' : tier)}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-colors',
                tierFilter === tier
                  ? `${colors.bg} border-current ${colors.text}`
                  : 'bg-white border-slate-200 hover:border-slate-300'
              )}
            >
              <p className={cn('text-3xl font-bold', tierFilter === tier ? colors.text : 'text-slate-900')}>{count}</p>
              <p className={cn('text-sm font-medium mt-0.5', tierFilter === tier ? colors.text : 'text-slate-500')}>{label}</p>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {(Object.keys(CANDIDATE_STATUS_LABELS) as CandidateStatus[]).map((s) => (
            <option key={s} value={s}>{CANDIDATE_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {(tierFilter || statusFilter) && (
          <button
            onClick={() => { setTierFilter(''); setStatusFilter(''); }}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-sm text-slate-500 ml-auto">{candidates.length} candidates</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading candidates...</div>
        ) : candidates.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No candidates yet</p>
            <p className="text-slate-400 text-sm mt-1">Claude in Chrome will populate this once it evaluates your Upwork applicants</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Candidate</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">JSS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Profile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  onTierChange={handleTierChange}
                  onStatusChange={handleStatusChange}
                  onHired={handleHired}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
