'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import type { MediaAsset, MediaAssetCategory, AssetRequest, LandingPage } from '@/types';

const CATEGORIES: { value: MediaAssetCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'product_hero', label: 'Product Hero' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'feature', label: 'Feature' },
  { value: 'social_proof', label: 'Social Proof' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'ingredient', label: 'Ingredient' },
  { value: 'other', label: 'Other' },
];

const CAT_COLOURS: Record<string, string> = {
  product_hero: 'bg-blue-50 text-blue-700',
  lifestyle: 'bg-purple-50 text-purple-700',
  feature: 'bg-indigo-50 text-indigo-700',
  social_proof: 'bg-green-50 text-green-700',
  packaging: 'bg-orange-50 text-orange-700',
  ingredient: 'bg-teal-50 text-teal-700',
  other: 'bg-gray-50 text-gray-600',
};

interface UploadItem {
  id: string;
  file: File;
  status: 'uploading' | 'categorising' | 'done' | 'error';
  asset?: MediaAsset;
  error?: string;
}

interface Props {
  pages: LandingPage[];
}

export function AssetsTab({ pages }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [filterCategory, setFilterCategory] = useState<MediaAssetCategory | 'all'>('all');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqDesc, setReqDesc] = useState('');
  const [reqType, setReqType] = useState<'image' | 'video'>('image');
  const [reqPageId, setReqPageId] = useState('');
  const [savingReq, setSavingReq] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    setLoadingAssets(true);
    try {
      const res = await fetch('/api/marketing/media-assets');
      const { assets: data } = await res.json();
      setAssets(data ?? []);
    } catch { /* ignore */ }
    finally { setLoadingAssets(false); }
  }

  const uploadFile = useCallback(async (file: File) => {
    const id = Math.random().toString(36).slice(2);
    setUploads(prev => [...prev, { id, file, status: 'uploading' }]);

    try {
      setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'categorising' } : u));
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/marketing/media-assets/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? 'Upload failed');
      }
      const { asset } = await res.json();
      setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'done', asset } : u));
      setAssets(prev => [asset, ...prev]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'error', error: msg } : u));
    }
  }, []);

  function handleFiles(files: FileList | File[]) {
    Array.from(files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .forEach(uploadFile);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  async function handleArchive(id: string) {
    await fetch('/api/marketing/media-assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'archived' }),
    });
    setAssets(prev => prev.filter(a => a.id !== id));
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqDesc.trim()) return;
    setSavingReq(true);
    try {
      const res = await fetch('/api/marketing/asset-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: reqDesc.trim(), asset_type: reqType, landing_page_id: reqPageId || undefined }),
      });
      if (res.ok) {
        const { request } = await res.json();
        setRequests(prev => [request, ...prev]);
        setReqDesc(''); setReqPageId(''); setShowRequestForm(false);
      }
    } catch { /* ignore */ }
    finally { setSavingReq(false); }
  }

  const filteredAssets = filterCategory === 'all' ? assets : assets.filter(a => a.ai_category === filterCategory);

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
        }`}
      >
        <Upload className={`h-8 w-8 mx-auto mb-3 ${dragging ? 'text-indigo-400' : 'text-gray-300'}`} />
        <p className="text-sm font-medium text-gray-700">
          {dragging ? 'Drop to upload' : 'Drag & drop images or videos'}
        </p>
        <p className="text-xs text-gray-400 mt-1">or click to browse — Claude will auto-categorise each image</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3">
              <ImageIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{u.file.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {u.status === 'uploading' && '⬆ Uploading…'}
                  {u.status === 'categorising' && '🤖 AI categorising…'}
                  {u.status === 'done' && u.asset && (
                    <span className="text-green-600">
                      ✓ {u.asset.ai_category?.replace('_', ' ')} — {u.asset.ai_description?.slice(0, 60) ?? 'Saved'}
                    </span>
                  )}
                  {u.status === 'error' && <span className="text-red-500">✗ {u.error}</span>}
                </p>
              </div>
              <button onClick={() => setUploads(prev => prev.filter(x => x.id !== u.id))} className="text-gray-300 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setFilterCategory(cat.value)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
              filterCategory === cat.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {cat.label}
            {cat.value !== 'all' && assets.filter(a => a.ai_category === cat.value).length > 0 && (
              <span className="ml-1 opacity-60">{assets.filter(a => a.ai_category === cat.value).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      {loadingAssets ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading assets…</p>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ImageIcon className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{assets.length === 0 ? 'No assets uploaded yet — drag images above to get started' : 'No assets in this category'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredAssets.map(asset => (
            <div key={asset.id} className="group relative bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="aspect-square bg-gray-50 relative">
                {asset.mime_type?.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.public_url} alt={asset.ai_description ?? asset.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><span className="text-3xl">🎥</span></div>
                )}
                <button
                  onClick={() => handleArchive(asset.id)}
                  className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="p-2.5">
                {asset.ai_category && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLOURS[asset.ai_category] ?? 'bg-gray-50 text-gray-600'}`}>
                    {asset.ai_category.replace('_', ' ')}
                  </span>
                )}
                {asset.ai_description && (
                  <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{asset.ai_description}</p>
                )}
                {asset.ai_suitable_for && asset.ai_suitable_for.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {asset.ai_suitable_for.slice(0, 3).map(s => (
                      <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{s.replace('_', ' ')}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset requests */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Asset Requests</h3>
            <p className="text-xs text-gray-400 mt-0.5">Flag images or videos you need created (e.g. in Gemini)</p>
          </div>
          <button onClick={() => setShowRequestForm(f => !f)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            + Request asset
          </button>
        </div>

        {showRequestForm && (
          <form onSubmit={handleCreateRequest} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">What do you need?</label>
                <input
                  value={reqDesc}
                  onChange={e => setReqDesc(e.target.value)}
                  placeholder="e.g. Lifestyle photo of person using ice shower after workout, morning light"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select value={reqType} onChange={e => setReqType(e.target.value as 'image' | 'video')}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">For page (optional)</label>
                <select value={reqPageId} onChange={e => setReqPageId(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  <option value="">— None —</option>
                  {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingReq}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                {savingReq ? 'Saving…' : 'Log Request'}
              </button>
              <button type="button" onClick={() => setShowRequestForm(false)} className="text-sm text-gray-500 px-3 py-2">Cancel</button>
            </div>
          </form>
        )}

        {requests.length > 0 && (
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3">
                <span className="text-lg">{r.asset_type === 'image' ? '🖼' : '🎥'}</span>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{r.description}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r.status === 'done' ? 'bg-green-50 text-green-700' :
                  r.status === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'
                }`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
        {requests.length === 0 && !showRequestForm && (
          <p className="text-xs text-gray-400">No requests yet — use the button above to flag what you need</p>
        )}
      </div>
    </div>
  );
}
