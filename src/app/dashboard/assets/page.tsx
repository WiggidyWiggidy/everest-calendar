'use client';

// =====================================================================
// /dashboard/assets — KRYO Asset Library
// Drag-drop upload, paste-by-URL, gallery with approve/reject/delete.
// Read & write via /api/marketing/assets/* routes (x-sync-secret auth).
// =====================================================================

import { useEffect, useState, useCallback, useRef } from 'react';

interface Asset {
  id: string;
  public_url: string;
  filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  status: 'pending_qc' | 'pending_approval' | 'approved' | 'rejected' | 'archived' | 'in_use';
  source: string | null;
  scene_type: string | null;
  angle: string | null;
  ai_description: string | null;
  ai_tags: string[] | null;
  qc_score: number | null;
  qc_failed_checks: string[] | null;
  generation_prompt: string | null;
  generation_model: string | null;
  used_in_pages: string[] | null;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

const STATUSES: Array<Asset['status'] | 'all'> = ['all', 'pending_qc', 'pending_approval', 'approved', 'rejected', 'archived', 'in_use'];
const SCENES = ['', 'hero', 'lifestyle', 'diagram', 'founder', 'comparison', 'social_proof', 'press', 'b_roll_video'];
const ANGLES = ['', 'morning_energy', 'athlete_recovery', 'luxury_upgrade', 'value_anchor', 'science_authority'];
const SOURCES = ['', 'manual', 'ai_generated', 'scraped'];

const STATUS_COLORS: Record<string, string> = {
  pending_qc: 'bg-amber-100 text-amber-800',
  pending_approval: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-rose-100 text-rose-800',
  archived: 'bg-slate-100 text-slate-700',
  in_use: 'bg-violet-100 text-violet-800',
};

// In production this token is set in env (NEXT_PUBLIC_MARKETING_SYNC_SECRET) so the dashboard can authenticate.
// If absent, request a stored secret from a server companion route — but for the autonomous-runtime use case,
// Tom hits this page from his own Mac and the env is present.
const SECRET_HEADER = (typeof window !== 'undefined' && (window as unknown as { MARKETING_SYNC_SECRET?: string }).MARKETING_SYNC_SECRET) || process.env.NEXT_PUBLIC_MARKETING_SYNC_SECRET || '';

async function api<T>(path: string, options?: { method?: string; body?: BodyInit | object; headers?: Record<string, string> }): Promise<T> {
  const headers: Record<string, string> = { 'x-sync-secret': SECRET_HEADER, ...(options?.headers || {}) };
  let body = options?.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(path, { method: options?.method || 'GET', headers, body });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending_approval');
  const [sceneFilter, setSceneFilter] = useState<string>('');
  const [angleFilter, setAngleFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [totalCount, setTotalCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlPaste, setUrlPaste] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (sceneFilter) params.set('scene_type', sceneFilter);
      if (angleFilter) params.set('angle', angleFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      params.set('limit', '120');
      const data = await api<{ assets: Asset[]; total_count: number }>(`/api/marketing/assets/list?${params}`);
      setAssets(data.assets);
      setTotalCount(data.total_count);
    } catch (e) {
      showToast('err', `Load failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sceneFilter, angleFilter, sourceFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append('file', file);
        if (sceneFilter) form.append('scene_type', sceneFilter);
        if (angleFilter) form.append('angle', angleFilter);
        await api('/api/marketing/assets/upload', { method: 'POST', body: form });
        ok++;
      } catch (e) {
        fail++;
        console.error('upload failed:', e);
      }
    }
    setUploading(false);
    showToast(fail === 0 ? 'ok' : 'err', `${ok} uploaded${fail ? `, ${fail} failed` : ''}`);
    refresh();
  };

  const uploadByUrl = async () => {
    if (!urlPaste.trim()) return;
    setUploading(true);
    try {
      await api('/api/marketing/assets/upload', {
        method: 'POST',
        body: { url: urlPaste.trim(), scene_type: sceneFilter || undefined, angle: angleFilter || undefined },
      });
      setUrlPaste('');
      showToast('ok', 'URL ingested');
      refresh();
    } catch (e) {
      showToast('err', `URL ingest failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const approve = async (a: Asset, sceneOverride?: string, angleOverride?: string) => {
    try {
      const body: { scene_type?: string; angle?: string } = {};
      if (sceneOverride !== undefined) body.scene_type = sceneOverride;
      if (angleOverride !== undefined) body.angle = angleOverride;
      await api(`/api/marketing/assets/${a.id}/approve`, { method: 'POST', body });
      showToast('ok', 'Approved');
      refresh();
    } catch (e) { showToast('err', `Approve failed: ${(e as Error).message}`); }
  };

  const reject = async (a: Asset, reason?: string) => {
    try {
      await api(`/api/marketing/assets/${a.id}/reject`, { method: 'POST', body: { reason: reason || null } });
      showToast('ok', 'Rejected');
      refresh();
    } catch (e) { showToast('err', `Reject failed: ${(e as Error).message}`); }
  };

  const del = async (a: Asset) => {
    if (!confirm(`Delete ${a.filename}? This removes from Storage + DB. Cannot be undone.`)) return;
    try {
      await api(`/api/marketing/assets/${a.id}`, { method: 'DELETE' });
      showToast('ok', 'Deleted');
      refresh();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('in use')) {
        showToast('err', 'In use by a live page. Archive instead.');
      } else {
        showToast('err', `Delete failed: ${msg}`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">KRYO Asset Library</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manual uploads + AI-generated graphics. Approved assets feed the page-builder swarm.
            </p>
          </div>
          <button
            onClick={refresh}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {/* Drop zone + URL paste */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
          className={`mb-6 p-6 border-2 border-dashed rounded-xl transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}`}
        >
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-medium text-slate-900">Drop files here or click to upload</p>
              <p className="text-xs text-slate-500 mt-1">
                Tip: set Scene + Angle below FIRST so the asset is auto-tagged.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Choose files'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
          </div>
          <div className="flex gap-2 mt-3">
            <input
              type="url"
              value={urlPaste}
              placeholder="…or paste a public URL (https://…/image.jpg)"
              onChange={(e) => setUrlPaste(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && uploadByUrl()}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={uploadByUrl}
              disabled={uploading || !urlPaste.trim()}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Ingest URL
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
          <select value={sceneFilter} onChange={(e) => setSceneFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg">
            {SCENES.map((s) => <option key={s} value={s}>{s ? `scene: ${s}` : 'all scenes'}</option>)}
          </select>
          <select value={angleFilter} onChange={(e) => setAngleFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg">
            {ANGLES.map((s) => <option key={s} value={s}>{s ? `angle: ${s.replace('_', ' ')}` : 'all angles'}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg">
            {SOURCES.map((s) => <option key={s} value={s}>{s ? `source: ${s.replace('_', ' ')}` : 'all sources'}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500 self-center">
            {totalCount} total · {assets.length} shown
          </span>
        </div>

        {/* Grid */}
        {loading ? (
          <p className="text-center text-slate-500 py-12">Loading…</p>
        ) : assets.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <p className="text-slate-600">No assets match these filters.</p>
            <p className="text-sm text-slate-500 mt-1">Drop files above or change filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} onApprove={approve} onReject={reject} onDelete={del} />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${toast.kind === 'ok' ? 'bg-green-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onApprove, onReject, onDelete }: {
  asset: Asset;
  onApprove: (a: Asset, scene?: string, angle?: string) => void;
  onReject: (a: Asset, reason?: string) => void;
  onDelete: (a: Asset) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [scene, setScene] = useState(asset.scene_type || '');
  const [angle, setAngle] = useState(asset.angle || '');
  const isVideo = (asset.mime_type || '').startsWith('video/');

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      <div className="aspect-square bg-slate-100 relative overflow-hidden">
        {isVideo ? (
          <video src={asset.public_url} className="w-full h-full object-cover" muted loop playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.public_url} alt={asset.ai_description || asset.filename} className="w-full h-full object-cover" loading="lazy" />
        )}
        <span className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[asset.status] || 'bg-slate-100 text-slate-700'}`}>
          {asset.status.replace('_', ' ')}
        </span>
        {asset.qc_score !== null && (
          <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium bg-black/70 text-white rounded-full">
            QC {asset.qc_score}
          </span>
        )}
      </div>
      <div className="p-2.5 flex-1 flex flex-col gap-1.5">
        <p className="text-xs font-medium text-slate-900 truncate" title={asset.filename}>
          {asset.filename}
        </p>
        <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
          {asset.scene_type && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{asset.scene_type}</span>}
          {asset.angle && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{asset.angle.replace('_', ' ')}</span>}
          {asset.source && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{asset.source.replace('_', ' ')}</span>}
        </div>
        {asset.rejection_reason && (
          <p className="text-[10px] text-rose-600 italic">{asset.rejection_reason}</p>
        )}
        {editing ? (
          <div className="flex flex-col gap-1 mt-1">
            <select value={scene} onChange={(e) => setScene(e.target.value)} className="text-[10px] border border-slate-300 rounded px-1 py-0.5">
              {SCENES.map((s) => <option key={s} value={s}>{s || '(scene)'}</option>)}
            </select>
            <select value={angle} onChange={(e) => setAngle(e.target.value)} className="text-[10px] border border-slate-300 rounded px-1 py-0.5">
              {ANGLES.map((s) => <option key={s} value={s}>{s.replace('_', ' ') || '(angle)'}</option>)}
            </select>
            <div className="flex gap-1">
              <button onClick={() => { onApprove(asset, scene, angle); setEditing(false); }} className="flex-1 text-[10px] bg-green-600 text-white py-1 rounded hover:bg-green-700">
                Save & approve
              </button>
              <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 border border-slate-300 rounded">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1 mt-auto pt-1">
            {asset.status !== 'approved' && (
              <button onClick={() => onApprove(asset)} title="Approve" className="flex-1 text-[10px] bg-green-600 text-white py-1.5 rounded hover:bg-green-700">
                ✓
              </button>
            )}
            {asset.status !== 'rejected' && (
              <button onClick={() => onReject(asset)} title="Reject" className="flex-1 text-[10px] bg-rose-600 text-white py-1.5 rounded hover:bg-rose-700">
                ✗
              </button>
            )}
            <button onClick={() => setEditing(true)} title="Set scene + angle" className="flex-1 text-[10px] border border-slate-300 text-slate-700 py-1.5 rounded hover:bg-slate-50">
              tag
            </button>
            <button onClick={() => onDelete(asset)} title="Delete (only if not in use)" className="text-[10px] border border-rose-300 text-rose-600 py-1.5 px-2 rounded hover:bg-rose-50">
              🗑
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
