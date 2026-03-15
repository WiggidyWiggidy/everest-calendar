'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LandingPage, PageProposal, ProposedSection } from '@/types';

interface Props {
  pages: LandingPage[];
  preselectedPageId?: string | null;
}

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero',
  key_benefits: 'Key Benefits',
  how_it_works: 'How It Works',
  science_proof: 'Science / Research',
  social_proof: 'Social Proof',
  comparison: 'Comparison',
  faq: 'FAQ',
  cta_banner: 'CTA Banner',
};

const PRIORITY_COLOURS: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border border-red-200',
  medium: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
};

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  approved: 'bg-green-50 text-green-700',
  user_written: 'bg-purple-50 text-purple-700',
  rejected: 'bg-red-50 text-red-500',
  building: 'bg-blue-50 text-blue-700',
  live: 'bg-emerald-50 text-emerald-700',
};

interface AnalyseResult extends PageProposal {
  priority?: 'high' | 'medium';
  expected_lift?: string;
  root_causes?: string[];
}

export function AnalystTab({ pages, preselectedPageId }: Props) {
  const [selectedPageId, setSelectedPageId] = useState(preselectedPageId ?? (pages[0]?.id ?? ''));
  const [analysing, setAnalysing] = useState(false);
  const [latestResult, setLatestResult] = useState<AnalyseResult | null>(null);
  const [proposals, setProposals] = useState<PageProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [userPlan, setUserPlan] = useState('');
  const [writingOwn, setWritingOwn] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPageId) setSelectedPageId(preselectedPageId);
  }, [preselectedPageId]);

  useEffect(() => {
    if (!selectedPageId) return;
    loadProposals(selectedPageId);
  }, [selectedPageId]);

  async function loadProposals(pageId: string) {
    setLoadingProposals(true);
    try {
      const res = await fetch(`/api/marketing/proposals?landing_page_id=${pageId}`);
      const { proposals: data } = await res.json();
      setProposals(data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingProposals(false);
    }
  }

  async function handleAnalyse() {
    if (!selectedPageId) return;
    setAnalysing(true);
    setLatestResult(null);
    try {
      const res = await fetch('/api/marketing/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landing_page_id: selectedPageId }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        alert('Analysis failed: ' + (error ?? 'Unknown error'));
        return;
      }
      const data = await res.json();
      setLatestResult({ ...data.proposal, priority: data.priority, expected_lift: data.expected_lift, root_causes: data.root_causes });
      setProposals(prev => [data.proposal, ...prev]);
    } catch {
      alert('Analysis failed. Check your API key and try again.');
    } finally {
      setAnalysing(false);
    }
  }

  async function handleApprove(proposalId: string) {
    setApproving(proposalId);
    try {
      await fetch('/api/marketing/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId, status: 'approved' }),
      });
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'approved' as const } : p));
      if (latestResult?.id === proposalId) setLatestResult(prev => prev ? { ...prev, status: 'approved' } : prev);
    } catch {
      alert('Failed to approve. Try again.');
    } finally {
      setApproving(null);
    }
  }

  async function handleReject(proposalId: string) {
    await fetch('/api/marketing/proposals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proposalId, status: 'rejected' }),
    });
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'rejected' as const } : p));
    if (latestResult?.id === proposalId) setLatestResult(null);
  }

  async function handleSubmitOwn(proposalId: string) {
    if (!userPlan.trim()) return;
    await fetch('/api/marketing/proposals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proposalId, status: 'user_written', user_plan: userPlan.trim() }),
    });
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'user_written' as const, user_plan: userPlan.trim() } : p));
    if (latestResult?.id === proposalId) setLatestResult(prev => prev ? { ...prev, status: 'user_written', user_plan: userPlan.trim() } : prev);
    setWritingOwn(false);
    setUserPlan('');
  }

  const selectedPage = pages.find(p => p.id === selectedPageId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Marketing Analyst</h2>
        <p className="text-xs text-gray-500 mt-0.5">AI-powered landing page diagnosis and improvement proposals</p>
      </div>

      {pages.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No pages tracked yet — add a page in the Pages tab first</p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select
                value={selectedPageId}
                onChange={e => setSelectedPageId(e.target.value)}
                className="appearance-none text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              >
                {pages.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={handleAnalyse}
              disabled={analysing || !selectedPageId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {analysing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analysing…
                </>
              ) : '🔍 Run Analysis'}
            </button>
            {selectedPage && (
              <a
                href={selectedPage.shopify_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                View page ↗
              </a>
            )}
          </div>

          {/* Loading state */}
          {analysing && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 text-center">
              <div className="w-8 h-8 border-3 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-indigo-700">Analysing your page…</p>
              <p className="text-xs text-indigo-500 mt-1">Reading metrics, identifying patterns, generating proposal</p>
            </div>
          )}

          {/* Latest result */}
          {latestResult && !analysing && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {/* Result header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Analysis Result</span>
                  {latestResult.priority && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOURS[latestResult.priority] ?? ''}`}>
                      {latestResult.priority === 'high' ? '🔴 High priority' : '🟡 Medium priority'}
                    </span>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOURS[latestResult.status] ?? ''}`}>
                  {latestResult.status.replace('_', ' ')}
                </span>
              </div>

              <div className="p-5 space-y-4">
                {/* Expected lift */}
                {latestResult.expected_lift && (
                  <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Expected impact</p>
                    <p className="text-sm text-green-800">{latestResult.expected_lift}</p>
                  </div>
                )}

                {/* Diagnosis */}
                {latestResult.diagnosis && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Diagnosis</p>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{latestResult.diagnosis}</p>
                  </div>
                )}

                {/* Root causes */}
                {latestResult.root_causes && latestResult.root_causes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Root causes</p>
                    <ul className="space-y-1.5">
                      {latestResult.root_causes.map((cause, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-red-400 mt-0.5 flex-shrink-0">▸</span>
                          {cause}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Proposed sections */}
                {latestResult.proposed_sections && latestResult.proposed_sections.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Proposed page structure</p>
                    <div className="space-y-2">
                      {latestResult.proposed_sections.map((section: ProposedSection, i: number) => (
                        <div key={i} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                              {String(i + 1).padStart(2, '0')} {SECTION_LABELS[section.type] ?? section.type}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-800">{section.headline}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{section.body}</p>
                          {section.notes && (
                            <p className="text-xs text-indigo-500 mt-1 italic">💡 {section.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action row */}
                {latestResult.status === 'pending' && !writingOwn && (
                  <div className="flex items-center gap-2 pt-2 flex-wrap border-t border-gray-100">
                    <button
                      onClick={() => handleApprove(latestResult.id)}
                      disabled={approving === latestResult.id}
                      className="text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      {approving === latestResult.id ? 'Approving…' : '✅ Approve Plan'}
                    </button>
                    <button
                      onClick={() => setWritingOwn(true)}
                      className="text-sm font-medium bg-gray-50 hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-lg"
                    >
                      ✏️ Write My Own Plan
                    </button>
                    <button
                      onClick={() => handleReject(latestResult.id)}
                      className="text-sm font-medium text-red-500 hover:text-red-700 px-3 py-2"
                    >
                      ❌ Reject
                    </button>
                  </div>
                )}

                {/* Write own plan */}
                {writingOwn && latestResult.status === 'pending' && (
                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-700">Write your own plan</p>
                    <textarea
                      value={userPlan}
                      onChange={e => setUserPlan(e.target.value)}
                      rows={5}
                      placeholder="Describe the page changes you want to test, section by section..."
                      className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSubmitOwn(latestResult.id)}
                        disabled={!userPlan.trim()}
                        className="text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        Save My Plan
                      </button>
                      <button onClick={() => setWritingOwn(false)} className="text-sm text-gray-500 px-3 py-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {latestResult.status === 'approved' && (
                  <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
                    ✅ Plan approved — go to Page Builder to build this page
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Past proposals */}
          {proposals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">History</p>
              <div className="space-y-2">
                {proposals.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-xs text-gray-600">
                        {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {p.diagnosis && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.diagnosis.slice(0, 80)}…</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[p.status] ?? 'bg-gray-50 text-gray-500'}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                      {p.status === 'pending' && p.id !== latestResult?.id && (
                        <button
                          onClick={() => handleApprove(p.id)}
                          disabled={approving === p.id}
                          className="text-xs text-green-700 hover:text-green-900 font-medium"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingProposals && (
            <p className="text-xs text-gray-400 text-center">Loading history…</p>
          )}
        </>
      )}
    </div>
  );
}
