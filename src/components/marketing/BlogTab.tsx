'use client';

import { useState } from 'react';
import { Loader2, Plus, X, ExternalLink, FileText } from 'lucide-react';

interface BlogResult {
  keyword: string;
  status: 'generated' | 'created' | 'error';
  title?: string;
  sections_count?: number;
  shopify_page_id?: string;
  preview_url?: string;
  error?: string;
}

export function BlogTab() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [tone, setTone] = useState('authoritative');
  const [autoCreate, setAutoCreate] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<BlogResult[]>([]);
  const [summary, setSummary] = useState<{ total: number; generated: number; created: number; errors: number } | null>(null);

  function addKeyword() {
    const kw = input.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw]);
      setInput('');
    }
  }

  function addMultiple() {
    const newKws = input.split('\n').map(k => k.trim()).filter(k => k && !keywords.includes(k));
    if (newKws.length) {
      setKeywords(prev => [...prev, ...newKws]);
      setInput('');
    }
  }

  function removeKeyword(kw: string) {
    setKeywords(prev => prev.filter(k => k !== kw));
  }

  async function handleGenerate() {
    if (!keywords.length) return;
    setGenerating(true);
    setResults([]);
    setSummary(null);

    try {
      const res = await fetch('/api/marketing/blog/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, tone, auto_create: autoCreate }),
      });

      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setSummary({ total: data.total, generated: data.generated, created: data.created, errors: data.errors });
      }
    } catch (err) {
      console.error('Batch generate error:', err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Blog Content Engine</h2>
        <p className="text-sm text-gray-500 mt-1">Generate SEO blog posts at scale. Each post targets a keyword and funnels readers to ISU-001.</p>
      </div>

      {/* Keyword Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (one per line or one at a time)</label>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"ice bath benefits\ncold plunge vs ice bath\nportable ice bath for home"}
              rows={3}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !input.includes('\n')) {
                  e.preventDefault();
                  addKeyword();
                }
              }}
            />
            <div className="flex flex-col gap-1">
              <button onClick={addKeyword} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 font-medium">
                <Plus className="h-3 w-3 inline mr-1" />Add
              </button>
              <button onClick={addMultiple} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 font-medium">
                Add All
              </button>
            </div>
          </div>
        </div>

        {/* Keyword pills */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keywords.map(kw => (
              <span key={kw} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-indigo-900">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tone</label>
            <select
              value={tone}
              onChange={e => setTone(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
            >
              <option value="authoritative">Authoritative</option>
              <option value="conversational">Conversational</option>
              <option value="technical">Technical</option>
              <option value="inspirational">Inspirational</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 mt-4">
            <input
              type="checkbox"
              checked={autoCreate}
              onChange={e => setAutoCreate(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Auto-create Shopify drafts
          </label>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || keywords.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating {keywords.length} posts...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Generate {keywords.length} Blog Post{keywords.length !== 1 ? 's' : ''}
            </>
          )}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{summary.generated}</p>
            <p className="text-xs text-green-600">Generated</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{summary.created}</p>
            <p className="text-xs text-blue-600">On Shopify</p>
          </div>
          {summary.errors > 0 && (
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{summary.errors}</p>
              <p className="text-xs text-red-600">Errors</p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Results</h3>
          {results.map((r, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    r.status === 'created' ? 'bg-green-500' :
                    r.status === 'generated' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className="text-xs font-medium text-gray-400 uppercase">{r.keyword}</span>
                </div>
                {r.title && <p className="text-sm font-medium text-gray-900 mt-1">{r.title}</p>}
                {r.sections_count && <p className="text-xs text-gray-500">{r.sections_count} sections</p>}
                {r.error && <p className="text-xs text-red-500 mt-1">{r.error}</p>}
              </div>
              {r.preview_url && (
                <a
                  href={r.preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 ml-3 shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                  Preview
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
