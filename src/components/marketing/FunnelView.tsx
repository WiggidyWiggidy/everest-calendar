'use client';

import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, ChevronDown, ArrowRight, TrendingDown } from 'lucide-react';
import type { LandingPage, LandingPageStatus, MarketingMetricDaily } from '@/types';

interface PageWithProposal extends LandingPage {
  latest_proposal: { id: string; status: string } | null;
}

interface FunnelData {
  impressions: number;
  clicks: number;
  checkouts_started: number;
  checkouts_completed: number;
  checkouts_abandoned: number;
  abandonment_rate: number;
  abandoned_value: number;
}

interface Props {
  pages: PageWithProposal[];
  today: MarketingMetricDaily | null;
  onPageCreated: (page: LandingPage) => void;
  onPageUpdated: (id: string, updates: Partial<LandingPage>) => void;
}

function fmt(n: number | null | undefined, isPercent = false, prefix = ''): string {
  if (n == null) return '--';
  if (isPercent) return `${(Number(n) * 100).toFixed(1)}%`;
  return `${prefix}${Number(n).toLocaleString('en-AU')}`;
}

function DropOff({ from, to }: { from: number; to: number; label: string }) {
  const pct = from > 0 ? (to / from) * 100 : 0;
  const dropPct = 100 - pct;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <ArrowRight className="h-4 w-4 text-gray-300" />
      {dropPct > 0 && (
        <span className="text-[9px] text-red-500 font-medium">{dropPct.toFixed(0)}% drop</span>
      )}
    </div>
  );
}

function FunnelStep({ label, value, subValue, highlight }: { label: string; value: string; subValue?: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col items-center p-3 rounded-lg border text-center ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
      <div className="text-xs text-gray-500 mb-1 whitespace-nowrap">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {subValue && <div className="text-xs text-gray-400 mt-0.5">{subValue}</div>}
    </div>
  );
}

const STATUS_LABELS: Record<LandingPageStatus, string> = {
  monitoring: 'Monitoring', testing: 'Testing', paused: 'Paused', archived: 'Archived',
};
const STATUS_COLOURS: Record<LandingPageStatus, string> = {
  monitoring: 'bg-blue-50 text-blue-700 border-blue-200',
  testing: 'bg-green-50 text-green-700 border-green-200',
  paused: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  archived: 'bg-gray-50 text-gray-500 border-gray-200',
};

// ── Inline Page Dev workflow ──────────────────────────────────────────────────
function PageDevWorkflow({ page }: { page: PageWithProposal }) {
  const [stage, setStage] = useState<'idle' | 'analysing' | 'result' | 'building' | 'built'>('idle');
  const [analysis, setAnalysis] = useState<{ diagnosis: string; root_causes?: string[]; proposed_sections?: Array<{ type: string; headline: string; notes?: string }>; priority?: string; expected_lift?: string } | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [draftLink, setDraftLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function runAnalysis() {
    setStage('analysing');
    setError('');
    try {
      const res = await fetch('/api/marketing/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: page.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAnalysis(data.proposal ?? data);
      setProposalId(data.proposal?.id ?? data.id ?? null);
      setStage('result');
    } catch (err) {
      setError(String(err));
      setStage('idle');
    }
  }

  async function approveAndBuild() {
    if (!proposalId) return;
    setStage('building');
    setError('');
    try {
      // Approve
      await fetch('/api/marketing/analyse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId, status: 'approved' }),
      });
      // Generate variation
      const res = await fetch('/api/marketing/shopify/generate-variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: page.id, proposal_id: proposalId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDraftLink(data.preview_url ?? data.draft_url ?? null);
      setStage('built');
    } catch (err) {
      setError(String(err));
      setStage('result');
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Page Development</div>

      {stage === 'idle' && (
        <button
          onClick={runAnalysis}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
        >
          Run AI Analysis
        </button>
      )}

      {stage === 'analysing' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Analysing page...
        </div>
      )}

      {stage === 'result' && analysis && (
        <div className="space-y-3">
          {analysis.priority && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${analysis.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {analysis.priority.toUpperCase()} PRIORITY
              {analysis.expected_lift && ` · ${analysis.expected_lift} lift expected`}
            </span>
          )}
          <div className="text-sm text-gray-700">{analysis.diagnosis}</div>
          {analysis.root_causes && analysis.root_causes.length > 0 && (
            <ul className="space-y-1">
              {analysis.root_causes.map((c, i) => (
                <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                  <span className="text-red-400 mt-0.5">·</span> {c}
                </li>
              ))}
            </ul>
          )}
          {analysis.proposed_sections && analysis.proposed_sections.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-gray-500">Proposed Sections:</div>
              {analysis.proposed_sections.map((s, i) => (
                <div key={i} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700">{i + 1}. {s.headline}</span>
                  {s.notes && <span className="text-gray-400 ml-2">— {s.notes}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={approveAndBuild} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium">
              Approve + Build Variation
            </button>
            <button onClick={() => setStage('idle')} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {stage === 'building' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Building Shopify variation...
        </div>
      )}

      {stage === 'built' && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-green-700">Variation created in Shopify.</div>
          {draftLink && (
            <a href={draftLink} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <ExternalLink className="h-3 w-3" /> Preview draft
            </a>
          )}
          <button onClick={() => setStage('idle')} className="block text-xs text-gray-400 hover:text-gray-600 pt-1">
            Run another analysis
          </button>
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  );
}

export function FunnelView({ pages, today, onPageCreated, onPageUpdated }: Props) {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loadingFunnel, setLoadingFunnel] = useState(true);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const [showAddPage, setShowAddPage] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    async function loadFunnel() {
      try {
        const res = await fetch('/api/marketing/campaign-intelligence?days=30');
        const data = await res.json();
        if (data.funnel) setFunnel(data.funnel);
      } catch { /* funnel stays null */ } finally {
        setLoadingFunnel(false);
      }
    }
    loadFunnel();
  }, []);

  async function handleStatusChange(id: string, status: LandingPageStatus) {
    await fetch('/api/marketing/landing-pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    onPageUpdated(id, { status });
  }

  async function handleAddPage(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    setSavingPage(true);
    try {
      const res = await fetch('/api/marketing/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), shopify_url: newUrl.trim(), notes: newNotes.trim() || undefined }),
      });
      if (!res.ok) throw new Error('Failed');
      const { page } = await res.json();
      onPageCreated(page);
      setNewName(''); setNewUrl(''); setNewNotes(''); setShowAddPage(false);
    } catch { alert('Failed to save.'); } finally { setSavingPage(false); }
  }

  // Funnel steps derived from today + funnel data
  const addToCartRate = today?.shopify_add_to_cart_rate;
  const convRate = today?.shopify_conversion_rate;
  const checkoutRate = today?.shopify_checkout_rate;

  return (
    <div className="space-y-5">

      {/* Full funnel visualization */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Conversion Funnel (30 days)</div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          {loadingFunnel ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading funnel data...
            </div>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              <FunnelStep label="Impressions" value={funnel ? funnel.impressions.toLocaleString() : (today?.meta_impressions?.toLocaleString() ?? '--')} />
              <DropOff from={funnel?.impressions ?? 0} to={funnel?.clicks ?? 0} label="click" />
              <FunnelStep label="Clicks" value={funnel ? funnel.clicks.toLocaleString() : (today?.meta_clicks?.toLocaleString() ?? '--')} />
              {(addToCartRate != null || funnel) && (
                <>
                  <DropOff from={funnel?.clicks ?? 0} to={funnel?.checkouts_started ?? 0} label="ATC" />
                  <FunnelStep label="Add to Cart" value={addToCartRate ? `${(addToCartRate * 100).toFixed(1)}%` : '--'}
                    subValue={today ? `${today.shopify_orders ?? 0} orders` : undefined} />
                </>
              )}
              {funnel && (
                <>
                  <DropOff from={funnel.checkouts_started} to={funnel.checkouts_completed} label="checkout" />
                  <FunnelStep label="Checkout Started" value={funnel.checkouts_started.toLocaleString()} />
                  <DropOff from={funnel.checkouts_started} to={funnel.checkouts_completed} label="purchase" />
                  <FunnelStep label="Purchased" value={funnel.checkouts_completed.toLocaleString()} highlight />
                </>
              )}
              {!funnel && (
                <>
                  <DropOff from={0} to={0} label="purchase" />
                  <FunnelStep label="Purchased" value={today?.shopify_orders?.toLocaleString() ?? '--'} highlight />
                </>
              )}
            </div>
          )}

          {/* Checkout abandonment */}
          {funnel && funnel.abandonment_rate > 0 && (
            <div className={`mt-3 flex items-center gap-3 rounded-lg px-3 py-2 ${funnel.abandonment_rate > 0.7 ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-100'}`}>
              <TrendingDown className={`h-4 w-4 shrink-0 ${funnel.abandonment_rate > 0.7 ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="text-sm">
                <span className="font-semibold text-gray-800">{(funnel.abandonment_rate * 100).toFixed(0)}% checkout abandonment</span>
                {funnel.abandoned_value > 0 && (
                  <span className="text-gray-500 ml-2">— ${funnel.abandoned_value.toFixed(0)} left in carts</span>
                )}
              </div>
            </div>
          )}

          {/* Today's quick metrics */}
          {today && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center border-t border-gray-50 pt-3">
              {[
                { label: 'Add-to-Cart Rate', value: fmt(addToCartRate, true) },
                { label: 'Checkout Rate', value: fmt(checkoutRate, true) },
                { label: 'Conversion Rate', value: fmt(convRate, true) },
              ].map(m => (
                <div key={m.label}>
                  <div className="text-xs text-gray-400">{m.label}</div>
                  <div className={`text-base font-bold ${
                    m.label === 'Add-to-Cart Rate' && addToCartRate != null && addToCartRate < 0.03 ? 'text-red-600' :
                    m.label === 'Conversion Rate' && convRate != null && convRate < 0.02 ? 'text-red-600' :
                    'text-gray-900'
                  }`}>{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Landing page performance table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Landing Pages</div>
          <button
            onClick={() => setShowAddPage(!showAddPage)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
          >
            + Add Page
          </button>
        </div>

        {showAddPage && (
          <form onSubmit={handleAddPage} className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Page name" required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="Shopify URL (e.g., /products/kryo)" required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Notes (optional)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
            <div className="flex gap-2">
              <button type="submit" disabled={savingPage} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
                {savingPage ? 'Saving...' : 'Add Page'}
              </button>
              <button type="button" onClick={() => setShowAddPage(false)} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200">
                Cancel
              </button>
            </div>
          </form>
        )}

        {pages.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400 bg-white border border-gray-100 rounded-xl">
            No pages tracked yet. Add your product page to start analysing.
          </div>
        ) : (
          <div className="space-y-2">
            {pages.filter(p => p.status !== 'archived').map(page => {
              const isExpanded = expandedPageId === page.id;
              const conv = today?.shopify_conversion_rate;
              const atc = today?.shopify_add_to_cart_rate;
              const bounce = today?.ga_bounce_rate;

              return (
                <div key={page.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {/* Page row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/80"
                    onClick={() => setExpandedPageId(isExpanded ? null : page.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 truncate">{page.name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_COLOURS[page.status]}`}>
                          {STATUS_LABELS[page.status]}
                        </span>
                        {page.latest_proposal && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            page.latest_proposal.status === 'approved' ? 'bg-green-50 text-green-700' :
                            page.latest_proposal.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'
                          }`}>
                            {page.latest_proposal.status} proposal
                          </span>
                        )}
                      </div>
                      {page.shopify_url && (
                        <a href={page.shopify_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                           className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1 mt-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                          {page.shopify_url.replace(/^https?:\/\/[^/]+/, '').slice(0, 40)}
                        </a>
                      )}
                    </div>

                    {/* Quick metrics (global today, not per-page yet) */}
                    <div className="hidden sm:flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <div className="text-gray-400">ATC</div>
                        <div className={`font-semibold ${atc != null && atc < 0.03 ? 'text-red-600' : 'text-gray-800'}`}>
                          {fmt(atc, true)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-400">Conv</div>
                        <div className={`font-semibold ${conv != null && conv < 0.02 ? 'text-red-600' : 'text-gray-800'}`}>
                          {fmt(conv, true)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-400">Bounce</div>
                        <div className={`font-semibold ${bounce != null && bounce > 0.70 ? 'text-red-600' : 'text-gray-800'}`}>
                          {fmt(bounce, true)}
                        </div>
                      </div>
                    </div>

                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Expanded: status controls + inline page dev */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50">
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <div className="text-xs text-gray-500 font-medium">Status:</div>
                        {(['monitoring', 'testing', 'paused', 'archived'] as LandingPageStatus[]).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(page.id, s)}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                              page.status === s
                                ? STATUS_COLOURS[s]
                                : 'text-gray-400 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                      <PageDevWorkflow page={page} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
