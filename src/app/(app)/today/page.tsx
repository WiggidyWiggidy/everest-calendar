'use client';

// ============================================
// /today — Daily Command Center
// "What should I do right now?" in one screen.
// Replaces the generic dashboard as the primary landing page.
// ============================================
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Inbox,
  Send,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  Truck,
} from 'lucide-react';

interface BriefingData {
  brief: Record<string, unknown> | null;
  briefText: string | null;
  live: {
    pendingInbox: number;
    readyToSend: number;
    suppliers: {
      total: number;
      discovery: number;
      quoting: number;
      with_quotes: number;
      stale: number;
    };
    staleContacts: Array<{
      contact_key: string;
      hours_ago: number;
      summary: string;
      platform: string;
    }>;
    daysToLaunch: number;
    yesterdaySummary: string[];
  };
}

export default function TodayPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  async function fetchBriefing() {
    setLoading(true);
    try {
      const res = await fetch('/api/briefing');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch briefing:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBriefing(); }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchBriefing, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const live = data?.live;
  if (!live) return null;

  const totalActions = live.pendingInbox + live.readyToSend;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500">
            {live.daysToLaunch > 0 ? `${live.daysToLaunch} days to launch` : 'Launch day'}
            {' · '}
            Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={fetchBriefing}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          disabled={loading}
        >
          <RefreshCw className={cn('h-5 w-5 text-slate-400', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Action cards — what needs doing RIGHT NOW */}
      {totalActions > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Actions Required</h2>

          {live.pendingInbox > 0 && (
            <Link href="/inbox" className="block">
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Inbox className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{live.pendingInbox} messages to review</p>
                    <p className="text-sm text-slate-500">Swipe to approve or skip</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>
            </Link>
          )}

          {live.readyToSend > 0 && (
            <Link href="/inbox" className="block">
              <div className="bg-white rounded-xl border border-orange-200 p-4 flex items-center justify-between hover:border-orange-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                    <Send className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{live.readyToSend} ready to send</p>
                    <p className="text-sm text-slate-500">Copy, paste on Alibaba, mark sent</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>
            </Link>
          )}
        </div>
      )}

      {totalActions === 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
          <p className="font-semibold text-green-800">Inbox clear</p>
          <p className="text-sm text-green-600">No messages waiting for review or sending</p>
        </div>
      )}

      {/* Supplier Pipeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Supplier Pipeline</h2>
          <Link href="/suppliers" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{live.suppliers.total}</p>
              <p className="text-xs text-slate-500">Total conversations</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{live.suppliers.with_quotes}</p>
              <p className="text-xs text-slate-500">With quotes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{live.suppliers.quoting}</p>
              <p className="text-xs text-slate-500">In negotiation</p>
            </div>
            <div className="text-center">
              <p className={cn('text-2xl font-bold', live.suppliers.stale > 0 ? 'text-amber-600' : 'text-slate-300')}>
                {live.suppliers.stale}
              </p>
              <p className="text-xs text-slate-500">Stale (&gt;72h)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stale Contacts */}
      {live.staleContacts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Stale Contacts
          </h2>
          <div className="space-y-2">
            {live.staleContacts.slice(0, 5).map((c) => (
              <div
                key={c.contact_key}
                className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className={cn(
                    'h-4 w-4',
                    c.hours_ago > 168 ? 'text-red-500' : c.hours_ago > 72 ? 'text-amber-500' : 'text-slate-400'
                  )} />
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{c.contact_key}</p>
                    <p className="text-xs text-slate-500">{c.summary}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    'text-sm font-semibold',
                    c.hours_ago > 168 ? 'text-red-600' : c.hours_ago > 72 ? 'text-amber-600' : 'text-slate-500'
                  )}>
                    {c.hours_ago > 24 ? `${Math.round(c.hours_ago / 24)}d` : `${c.hours_ago}h`}
                  </p>
                  <p className="text-xs text-slate-400">{c.platform}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Yesterday's Progress */}
      {live.yesterdaySummary.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Yesterday</h2>
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            {live.yesterdaySummary.map((summary, i) => (
              <p key={i} className="text-sm text-slate-700 leading-relaxed">
                {summary.replace(/^SESSION[^:]*:\s*/, '').slice(0, 300)}
                {summary.length > 300 ? '...' : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Morning Brief (if available) */}
      {data?.briefText && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Morning Brief</h2>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{data.briefText}</p>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-2 pt-2">
        <Link href="/inbox" className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:bg-slate-50 transition-colors">
          <Inbox className="h-5 w-5 mx-auto text-slate-600 mb-1" />
          <p className="text-xs font-medium text-slate-600">Inbox</p>
        </Link>
        <Link href="/suppliers" className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:bg-slate-50 transition-colors">
          <Truck className="h-5 w-5 mx-auto text-slate-600 mb-1" />
          <p className="text-xs font-medium text-slate-600">Suppliers</p>
        </Link>
        <Link href="/dashboard" className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:bg-slate-50 transition-colors">
          <Clock className="h-5 w-5 mx-auto text-slate-600 mb-1" />
          <p className="text-xs font-medium text-slate-600">Calendar</p>
        </Link>
      </div>
    </div>
  );
}
