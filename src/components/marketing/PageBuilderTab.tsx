'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ExternalLink, ChevronDown } from 'lucide-react';
import type { LandingPage, PageProposal, PageSection, SectionType, MediaAsset } from '@/types';

const SECTION_OPTIONS: { value: SectionType; label: string; description: string }[] = [
  { value: 'hero', label: 'Hero', description: 'Bold headline + image + CTA' },
  { value: 'key_benefits', label: 'Key Benefits', description: '3-column benefit grid' },
  { value: 'how_it_works', label: 'How It Works', description: 'Numbered steps' },
  { value: 'science_proof', label: 'Science / Research', description: 'Stats on dark background' },
  { value: 'social_proof', label: 'Social Proof', description: 'Quote cards + star ratings' },
  { value: 'comparison', label: 'Comparison', description: 'Ice Shower vs alternatives table' },
  { value: 'faq', label: 'FAQ', description: 'Accordion questions' },
  { value: 'cta_banner', label: 'CTA Banner', description: 'Full-width closing CTA' },
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

interface Props {
  pages: LandingPage[];
  preselectedPageId?: string | null;
  shopifyConnected: boolean;
}

export function PageBuilderTab({ pages, preselectedPageId, shopifyConnected }: Props) {
  const [selectedPageId, setSelectedPageId] = useState(preselectedPageId ?? (pages[0]?.id ?? ''));
  const [proposals, setProposals] = useState<PageProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [sections, setSections] = useState<PageSection[]>([]);
  const [pageTitle, setPageTitle] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [pickerForIdx, setPickerForIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [shopifyResult, setShopifyResult] = useState<{ admin_url: string; preview_url: string } | null>(null);
  const [addingSection, setAddingSection] = useState(false);

  useEffect(() => {
    if (preselectedPageId) setSelectedPageId(preselectedPageId);
  }, [preselectedPageId]);

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

  useEffect(() => {
    fetch('/api/marketing/media-assets')
      .then(r => r.json())
      .then(({ assets: data }) => setAssets(data ?? []))
      .catch(() => {});
  }, []);

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

  async function handleCreateDraft() {
    if (!selectedPageId || !pageTitle.trim() || sections.length === 0) return;
    setCreating(true);
    setShopifyResult(null);
    try {
      const res = await fetch('/api/marketing/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landing_page_id: selectedPageId, page_title: pageTitle.trim(), sections }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Failed: ' + (data.error ?? 'Unknown error'));
        return;
      }
      setShopifyResult({ admin_url: data.admin_url, preview_url: data.preview_url });
    } catch {
      alert('Failed to create Shopify draft. Check your credentials.');
    } finally {
      setCreating(false);
    }
  }

  const canCreate = shopifyConnected && selectedPageId && pageTitle.trim() && sections.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Page Builder</h2>
        <p className="text-xs text-gray-500 mt-0.5">Build a Shopify landing page variant from approved proposals</p>
      </div>

      {pages.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Add a landing page in the Pages tab first</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: builder controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* Page + proposal selectors */}
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

            {/* Page title */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Shopify page title</label>
              <input value={pageTitle} onChange={e => setPageTitle(e.target.value)}
                placeholder="e.g. Ice Shower — Variant B"
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
                        placeholder="e.g. Shop Now"
                        className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">CTA URL (optional)</label>
                      <input value={section.cta_url ?? ''} onChange={e => updateSection(idx, { cta_url: e.target.value || undefined })}
                        placeholder="https://…"
                        className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    </div>
                  </div>
                  {/* Image picker */}
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          </div>

          {/* Right: preview + create */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4 sticky top-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Page Summary</p>
              {pageTitle && <p className="text-sm font-semibold text-gray-800 mb-3">{pageTitle}</p>}
              {sections.length === 0 ? (
                <p className="text-xs text-gray-400">No sections yet — add sections on the left</p>
              ) : (
                <ol className="space-y-1.5">
                  {sections.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 capitalize">{s.type.replace('_', ' ')}</p>
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

              {!shopifyConnected && (
                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <p className="text-xs text-amber-700 font-medium">Shopify not connected</p>
                  <p className="text-xs text-amber-600 mt-1">Add SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN in Vercel to enable draft creation</p>
                </div>
              )}

              <button
                onClick={handleCreateDraft}
                disabled={!canCreate || creating}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating draft…</>
                ) : '🛍 Create Shopify Draft'}
              </button>

              {shopifyResult && (
                <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-3 space-y-2">
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
