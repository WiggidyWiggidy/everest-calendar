'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import type { LandingPage, PageProposal, PageSection, SectionType, MediaAsset } from '@/types';

const SECTION_OPTIONS: { value: SectionType; label: string; description: string }[] = [
  { value: 'hero', label: 'Hero', description: 'Bold headline + image + CTA (dark bg)' },
  { value: 'key_benefits', label: 'Key Benefits', description: '3-column benefit cards' },
  { value: 'how_it_works', label: 'How It Works', description: 'Numbered steps' },
  { value: 'science_proof', label: 'Science / Research', description: 'Stats on dark background' },
  { value: 'social_proof', label: 'Social Proof', description: 'Quote cards + star ratings' },
  { value: 'comparison', label: 'Comparison', description: 'Product vs alternatives table' },
  { value: 'faq', label: 'FAQ', description: 'Accordion questions' },
  { value: 'cta_banner', label: 'CTA Banner', description: 'Full-width dark closing CTA' },
  { value: 'setup_3col', label: '3-Col Setup', description: 'How to set up (3 columns)' },
];

function newSection(type: SectionType): PageSection {
  return { type, headline: '', body: '', image_url: undefined, cta_text: undefined, cta_url: undefined };
}

interface AssetPickerProps {
  assets: MediaAsset[];
  sectionType: SectionType;
  selected?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

function AssetPicker({ assets, sectionType, selected, onSelect, onClose }: AssetPickerProps) {
  const relevant = assets.filter(a =>
    !a.ai_suitable_for || a.ai_suitable_for.length === 0 || a.ai_suitable_for.includes(sectionType)
  );
  const rest = assets.filter(a => a.ai_suitable_for?.length && !a.ai_suitable_for.includes(sectionType));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Pick an image</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No assets uploaded yet — go to the Assets tab to upload</p>
        ) : (
          <>
            {relevant.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-500 mb-2">Recommended for this section</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {relevant.map(a => (
                    <button key={a.id} onClick={() => { onSelect(a.public_url); onClose(); }}
                      className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-colors ${selected === a.public_url ? 'border-indigo-500' : 'border-transparent hover:border-gray-300'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.public_url} alt={a.ai_description ?? ''} className="w-full h-full object-cover" />
                      {selected === a.public_url && (
                        <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                          <span className="text-white text-xl">✓</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            {rest.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-400 mb-2">Other assets</p>
                <div className="grid grid-cols-3 gap-2">
                  {rest.map(a => (
                    <button key={a.id} onClick={() => { onSelect(a.public_url); onClose(); }}
                      className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-colors ${selected === a.public_url ? 'border-indigo-500' : 'border-transparent hover:border-gray-300'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.public_url} alt={a.ai_description ?? ''} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface VariationChange {
  element: string;
  before: string;
  after: string;
  reason: string;
}

interface Props {
  pages: LandingPage[];
  preselectedPageId?: string | null;
  shopifyConnected: boolean;
}

export function PageBuilderTab({ pages, preselectedPageId, shopifyConnected }: Props) {
  // ── Mode ───────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'scratch' | 'variation'>('scratch');

  // ── Shared state ───────────────────────────────────────────────────────────
  const [variantId, setVariantId] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [creating, setCreating] = useState(false);
  const [shopifyResult, setShopifyResult] = useState<{ admin_url: string; preview_url: string } | null>(null);

  // ── Build from scratch state ───────────────────────────────────────────────
  const [selectedPageId, setSelectedPageId] = useState(preselectedPageId ?? (pages[0]?.id ?? ''));
  const [proposals, setProposals] = useState<PageProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [sections, setSections] = useState<PageSection[]>([]);
  const [pageTitle, setPageTitle] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [pickerForIdx, setPickerForIdx] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);

  // ── Variation state ────────────────────────────────────────────────────────
  const [variationPageId, setVariationPageId] = useState('');
  const [variationProposalId, setVariationProposalId] = useState('');
  const [variationProposals, setVariationProposals] = useState<PageProposal[]>([]);
  const [variationPageTitle, setVariationPageTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [variationResult, setVariationResult] = useState<{ body_html: string; changes: VariationChange[] } | null>(null);
  const [changesOpen, setChangesOpen] = useState(true);

  // ── Pages with shopify_page_id (for variation mode) ────────────────────────
  const publishedPages = pages.filter(p => p.shopify_page_id);

  useEffect(() => {
    if (preselectedPageId) setSelectedPageId(preselectedPageId);
  }, [preselectedPageId]);

  // Load proposals for scratch mode
  useEffect(() => {
    if (!selectedPageId) return;
    fetch(`/api/marketing/proposals?landing_page_id=${selectedPageId}`)
      .then(r => r.json())
      .then(({ proposals: data }) => {
        const approved = (data ?? []).filter((p: PageProposal) => p.status === 'approved' || p.status === 'user_written');
        setProposals(approved);
        if (approved.length > 0) setSelectedProposalId(approved[0].id);
      }).catch(() => {});

    const page = pages.find(p => p.id === selectedPageId);
    if (page) setPageTitle(page.name + ' — Variant B');
  }, [selectedPageId, pages]);

  // Pre-fill sections from proposal
  useEffect(() => {
    if (!selectedProposalId) { setSections([]); return; }
    const proposal = proposals.find(p => p.id === selectedProposalId);
    if (proposal?.proposed_sections) {
      setSections(proposal.proposed_sections.map(s => ({
        type: s.type, headline: s.headline, body: s.body, cta_text: s.cta_text, cta_url: undefined,
      })));
    } else if (proposal?.user_plan) {
      setSections([newSection('hero')]);
    }
  }, [selectedProposalId, proposals]);

  // Load proposals for variation mode
  useEffect(() => {
    if (!variationPageId) return;
    fetch(`/api/marketing/proposals?landing_page_id=${variationPageId}`)
      .then(r => r.json())
      .then(({ proposals: data }) => {
        const approved = (data ?? []).filter((p: PageProposal) => p.status === 'approved' || p.status === 'user_written');
        setVariationProposals(approved);
        if (approved.length > 0) setVariationProposalId(approved[0].id);
      }).catch(() => {});

    const page = pages.find(p => p.id === variationPageId);
    if (page) setVariationPageTitle(page.name + ' — Variant B');
  }, [variationPageId, pages]);

  // Set default variation page
  useEffect(() => {
    if (mode === 'variation' && publishedPages.length > 0 && !variationPageId) {
      setVariationPageId(publishedPages[0].id);
    }
  }, [mode, publishedPages, variationPageId]);

  // Load assets
  useEffect(() => {
    fetch('/api/marketing/media-assets')
      .then(r => r.json())
      .then(({ assets: data }) => setAssets(data ?? []))
      .catch(() => {});
  }, []);

  // ── Scratch mode helpers ───────────────────────────────────────────────────
  function updateSection(idx: number, updates: Partial<PageSection>) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  }

  function removeSection(idx: number) {
    setSections(prev => prev.filter((_, i) => i !== idx));
  }

  function addSection(type: SectionType) {
    setSections(prev => [...prev, newSection(type)]);
    setAddingSection(false);
  }

  // ── Create Shopify draft (scratch mode) ────────────────────────────────────
  async function handleCreateDraft() {
    if (!selectedPageId || !pageTitle.trim() || sections.length === 0) return;
    setCreating(true);
    setShopifyResult(null);
    try {
      const res = await fetch('/api/marketing/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landing_page_id: selectedPageId,
          page_title: pageTitle.trim(),
          sections,
          variant_id: variantId.trim() || undefined,
          product_price: productPrice.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert('Failed: ' + (data.error ?? 'Unknown error')); return; }
      setShopifyResult({ admin_url: data.admin_url, preview_url: data.preview_url });
    } catch {
      alert('Failed to create Shopify draft. Check your credentials.');
    } finally {
      setCreating(false);
    }
  }

  // ── Generate AI variation ──────────────────────────────────────────────────
  async function handleGenerateVariation() {
    if (!variationPageId || !variationProposalId) return;
    setGenerating(true);
    setVariationResult(null);
    setShopifyResult(null);
    try {
      const res = await fetch('/api/marketing/shopify/generate-variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landing_page_id: variationPageId, proposal_id: variationProposalId }),
      });
      const data = await res.json();
      if (!res.ok) { alert('Failed: ' + (data.error ?? 'Unknown error')); return; }
      setVariationResult({ body_html: data.body_html, changes: data.changes ?? [] });
      setChangesOpen(true);
    } catch {
      alert('Failed to generate variation. Check your API key and try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Create Shopify draft (variation mode) ──────────────────────────────────
  async function handleCreateVariationDraft() {
    if (!variationResult || !variationPageId || !variationPageTitle.trim()) return;
    setCreating(true);
    setShopifyResult(null);
    try {
      const res = await fetch('/api/marketing/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landing_page_id: variationPageId,
          page_title: variationPageTitle.trim(),
          body_html: variationResult.body_html,
          variant_id: variantId.trim() || undefined,
          product_price: productPrice.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert('Failed: ' + (data.error ?? 'Unknown error')); return; }
      setShopifyResult({ admin_url: data.admin_url, preview_url: data.preview_url });
    } catch {
      alert('Failed to create Shopify draft.');
    } finally {
      setCreating(false);
    }
  }

  const canCreateScratch = shopifyConnected && selectedPageId && pageTitle.trim() && sections.length > 0;
  const canGenerateVariation = variationPageId && variationProposalId;
  const canCreateVariationDraft = shopifyConnected && variationResult && variationPageTitle.trim();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Page Builder</h2>
        <p className="text-xs text-gray-500 mt-0.5">Build or generate AI variations of Shopify landing pages</p>
      </div>

      {pages.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Add a landing page in the Pages tab first</p>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => { setMode('scratch'); setShopifyResult(null); }}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${mode === 'scratch' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Build from scratch
            </button>
            <button
              onClick={() => { setMode('variation'); setShopifyResult(null); setVariationResult(null); }}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${mode === 'variation' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              ✨ Generate AI variation
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* ── Left panel ─────────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-4">

              {/* ── BUILD FROM SCRATCH ───────────────────────────────────── */}
              {mode === 'scratch' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Landing page</label>
                      <div className="relative">
                        <select value={selectedPageId} onChange={e => setSelectedPageId(e.target.value)}
                          className="appearance-none w-full text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                          {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Approved proposal</label>
                      <div className="relative">
                        <select value={selectedProposalId} onChange={e => setSelectedProposalId(e.target.value)}
                          className="appearance-none w-full text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                          disabled={proposals.length === 0}>
                          {proposals.length === 0
                            ? <option>No approved proposals yet</option>
                            : proposals.map(p => <option key={p.id} value={p.id}>{new Date(p.created_at).toLocaleDateString('en-AU')} — {p.status}</option>)
                          }
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Shopify page title</label>
                    <input value={pageTitle} onChange={e => setPageTitle(e.target.value)}
                      placeholder="e.g. KRYO-1 — Variant B"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>

                  {/* Sections */}
                  {sections.map((section, idx) => (
                    <div key={idx} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <select value={section.type} onChange={e => updateSection(idx, { type: e.target.value as SectionType })}
                            className="text-xs font-medium text-gray-700 bg-transparent border-none focus:outline-none">
                            {SECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <button onClick={() => removeSection(idx)} className="text-gray-300 hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Headline</label>
                          <input value={section.headline} onChange={e => updateSection(idx, { headline: e.target.value })}
                            placeholder="Bold benefit-first headline"
                            className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Body copy</label>
                          <textarea value={section.body} onChange={e => updateSection(idx, { body: e.target.value })}
                            rows={3} placeholder="Section body copy…"
                            className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-400 mb-1">CTA text (optional)</label>
                            <input value={section.cta_text ?? ''} onChange={e => updateSection(idx, { cta_text: e.target.value || undefined })}
                              placeholder="e.g. Add to Cart"
                              className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-gray-400 mb-1">CTA URL {variantId ? '(overridden by variant ID)' : '(optional)'}</label>
                            <input value={section.cta_url ?? ''} onChange={e => updateSection(idx, { cta_url: e.target.value || undefined })}
                              placeholder="https://…" disabled={!!variantId}
                              className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-40" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Image (optional)</label>
                          {section.image_url ? (
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={section.image_url} alt="" className="h-12 w-12 object-cover rounded-lg border border-gray-100" />
                              <button onClick={() => setPickerForIdx(idx)} className="text-xs text-indigo-600 hover:text-indigo-800">Change image</button>
                              <button onClick={() => updateSection(idx, { image_url: undefined })} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                            </div>
                          ) : (
                            <button onClick={() => setPickerForIdx(idx)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-50">
                              + Pick image from library
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add section */}
                  {addingSection ? (
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                      <p className="text-xs font-medium text-gray-600 mb-3">Choose a section type</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {SECTION_OPTIONS.map(o => (
                          <button key={o.value} onClick={() => addSection(o.value)}
                            className="text-left border border-gray-100 rounded-lg p-2.5 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                            <p className="text-xs font-semibold text-gray-800">{o.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{o.description}</p>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAddingSection(false)} className="text-xs text-gray-400 mt-3 hover:text-gray-600">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingSection(true)}
                      className="w-full flex items-center justify-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-200 rounded-xl py-3 hover:bg-indigo-50 transition-colors">
                      <Plus className="h-4 w-4" />
                      Add section
                    </button>
                  )}
                </>
              )}

              {/* ── GENERATE AI VARIATION ─────────────────────────────────── */}
              {mode === 'variation' && (
                <div className="space-y-4">
                  {publishedPages.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 text-center">
                      <p className="text-sm font-medium text-amber-800">No pages pushed to Shopify yet</p>
                      <p className="text-xs text-amber-600 mt-1">
                        Use &quot;Build from scratch&quot; to create the first version, then come back here to generate AI variations of it.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <p className="text-xs text-blue-700 font-medium">How AI variations work</p>
                        <p className="text-xs text-blue-600 mt-1">
                          Claude fetches your existing Shopify page, reads the analyst&apos;s diagnosis, rewrites the copy to address root causes, and can add new sections — all while preserving your page&apos;s exact structure and styling.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Base page (must be in Shopify)</label>
                          <div className="relative">
                            <select value={variationPageId} onChange={e => setVariationPageId(e.target.value)}
                              className="appearance-none w-full text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                              {publishedPages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Approved proposal to apply</label>
                          <div className="relative">
                            <select value={variationProposalId} onChange={e => setVariationProposalId(e.target.value)}
                              className="appearance-none w-full text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                              disabled={variationProposals.length === 0}>
                              {variationProposals.length === 0
                                ? <option>No approved proposals yet</option>
                                : variationProposals.map(p => <option key={p.id} value={p.id}>{new Date(p.created_at).toLocaleDateString('en-AU')} — {p.status}</option>)
                              }
                            </select>
                            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1">New variant page title</label>
                        <input value={variationPageTitle} onChange={e => setVariationPageTitle(e.target.value)}
                          placeholder="e.g. KRYO-1 — Variant C"
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      </div>

                      <button
                        onClick={handleGenerateVariation}
                        disabled={!canGenerateVariation || generating}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {generating ? (
                          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating variation…</>
                        ) : '✨ Generate Variation'}
                      </button>

                      {generating && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-center">
                          <div className="w-8 h-8 border-3 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
                          <p className="text-sm font-medium text-indigo-700">Generating AI variation…</p>
                          <p className="text-xs text-indigo-500 mt-1">Fetching existing page, analysing diagnosis, rewriting copy</p>
                        </div>
                      )}

                      {variationResult && !generating && (
                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                          <button
                            onClick={() => setChangesOpen(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-green-50 border-b border-green-100 hover:bg-green-100 transition-colors"
                          >
                            <span className="text-sm font-semibold text-green-800">
                              ✅ {variationResult.changes.length} change{variationResult.changes.length !== 1 ? 's' : ''} generated
                            </span>
                            <ChevronRight className={`h-4 w-4 text-green-600 transition-transform ${changesOpen ? 'rotate-90' : ''}`} />
                          </button>
                          {changesOpen && (
                            <div className="divide-y divide-gray-50">
                              {variationResult.changes.map((c, i) => (
                                <div key={i} className="px-4 py-3">
                                  <p className="text-xs font-semibold text-gray-700">{c.element}</p>
                                  <p className="text-xs text-gray-400 mt-0.5 line-through">{c.before}</p>
                                  <p className="text-xs text-gray-700 mt-0.5">{c.after}</p>
                                  <p className="text-xs text-indigo-500 mt-1 italic">💡 {c.reason}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Right sidebar ───────────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="bg-white border border-gray-100 rounded-xl p-4 sticky top-4 space-y-4">

                {/* Variant ID + price */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cart Integration</p>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Shopify variant ID (optional)</label>
                      <input
                        value={variantId}
                        onChange={e => setVariantId(e.target.value)}
                        placeholder="e.g. 48291847382"
                        className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Display price (optional)</label>
                      <input
                        value={productPrice}
                        onChange={e => setProductPrice(e.target.value)}
                        placeholder="e.g. $2,299 AUD"
                        className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                    </div>
                    {variantId && (
                      <p className="text-xs text-indigo-600">
                        ✓ All CTA buttons → Add to Cart<br />
                        ✓ Sticky buy bar enabled
                      </p>
                    )}
                  </div>
                </div>

                {/* Page summary (scratch mode) */}
                {mode === 'scratch' && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Page Summary</p>
                    {pageTitle && <p className="text-sm font-semibold text-gray-800 mb-2">{pageTitle}</p>}
                    {sections.length === 0 ? (
                      <p className="text-xs text-gray-400">No sections yet</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {sections.map((s, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-700 capitalize">{s.type.replace(/_/g, ' ')}</p>
                              {s.headline && <p className="text-xs text-gray-400 truncate">{s.headline}</p>}
                              {s.image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.image_url} alt="" className="h-6 w-6 object-cover rounded mt-1 inline-block" />
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {/* Shopify connection warning */}
                {!shopifyConnected && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-medium">Shopify not connected</p>
                    <p className="text-xs text-amber-600 mt-1">Add SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN in Vercel to enable draft creation</p>
                  </div>
                )}

                {/* Create draft button */}
                {mode === 'scratch' && (
                  <button
                    onClick={handleCreateDraft}
                    disabled={!canCreateScratch || creating}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {creating ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating draft…</>
                    ) : '🛍 Create Shopify Draft'}
                  </button>
                )}

                {mode === 'variation' && variationResult && (
                  <button
                    onClick={handleCreateVariationDraft}
                    disabled={!canCreateVariationDraft || creating}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {creating ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating draft…</>
                    ) : '🛍 Create Shopify Draft'}
                  </button>
                )}

                {/* Success result */}
                {shopifyResult && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-green-700">✅ Draft page created!</p>
                    <a href={shopifyResult.admin_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 underline">
                      <ExternalLink className="h-3 w-3" />
                      Open in Shopify Admin
                    </a>
                    <a href={shopifyResult.preview_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 underline">
                      <ExternalLink className="h-3 w-3" />
                      Preview page
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Asset picker modal */}
      {pickerForIdx !== null && (
        <AssetPicker
          assets={assets}
          sectionType={sections[pickerForIdx]?.type ?? 'hero'}
          selected={sections[pickerForIdx]?.image_url}
          onSelect={url => updateSection(pickerForIdx, { image_url: url })}
          onClose={() => setPickerForIdx(null)}
        />
      )}
    </div>
  );
}
