'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketingMetricDaily, MarketingExperiment, ExperimentType, LandingPage } from '@/types';
import { PulseView } from './PulseView';
import { CampaignsView } from './CampaignsView';
import { FunnelView } from './FunnelView';
import { ExperimentsTab } from './ExperimentsTab';
import { ContentView } from './ContentView';

type View = 'pulse' | 'campaigns' | 'funnel' | 'experiments' | 'content';

interface PageWithProposal extends LandingPage {
  latest_proposal: { id: string; status: string } | null;
}

const VIEWS: { key: View; label: string }[] = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'experiments', label: 'Experiments' },
  { key: 'content', label: 'Content' },
];

export function MarketingDashboard() {
  const [activeView, setActiveView] = useState<View>('pulse');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<MarketingMetricDaily[]>([]);
  const [today, setToday] = useState<MarketingMetricDaily | null>(null);
  const [experiments, setExperiments] = useState<MarketingExperiment[]>([]);
  const [pages, setPages] = useState<PageWithProposal[]>([]);
  const [prefillExpType, setPrefillExpType] = useState<ExperimentType | null>(null);

  const load = useCallback(async () => {
    try {
      const [metricsRes, experimentsRes, pagesRes] = await Promise.all([
        fetch('/api/marketing/metrics?days=30'),
        fetch('/api/marketing/experiments'),
        fetch('/api/marketing/landing-pages'),
      ]);
      const [metricsData, experimentsData, pagesData] = await Promise.all([
        metricsRes.json(),
        experimentsRes.json(),
        pagesRes.json(),
      ]);

      const rows: MarketingMetricDaily[] = metricsData.metrics ?? [];
      setHistory(rows);

      const todayStr = new Date().toISOString().split('T')[0];
      setToday(rows.find(r => r.date === todayStr) ?? null);
      setExperiments(experimentsData.experiments ?? []);
      setPages(pagesData.pages ?? []);
    } catch (err) {
      console.error('MarketingDashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreateExperiment(type: ExperimentType) {
    setPrefillExpType(type);
    setActiveView('experiments');
  }

  function handlePageCreated(page: LandingPage) {
    setPages(prev => [{ ...page, latest_proposal: null }, ...prev]);
  }

  function handlePageUpdated(id: string, updates: Partial<LandingPage>) {
    setPages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }

  const runningExperimentsCount = experiments.filter(e => e.status === 'running').length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Marketing</h1>
        <p className="text-sm text-gray-400 mt-0.5">Pulse · Campaigns · Funnel · Experiments · Content</p>
      </div>

      {/* View nav */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-5 overflow-x-auto shrink-0">
        {VIEWS.map(view => {
          const label = view.key === 'experiments' && runningExperimentsCount > 0
            ? `Experiments (${runningExperimentsCount})`
            : view.label;
          return (
            <button
              key={view.key}
              onClick={() => setActiveView(view.key)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap',
                activeView === view.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* View content */}
      <div className="flex-1 overflow-y-auto">
        {activeView === 'pulse' && (
          <PulseView
            history={history}
            today={today}
            onCreateExperiment={handleCreateExperiment}
          />
        )}
        {activeView === 'campaigns' && <CampaignsView />}
        {activeView === 'funnel' && (
          <FunnelView
            pages={pages}
            today={today}
            onPageCreated={handlePageCreated}
            onPageUpdated={handlePageUpdated}
          />
        )}
        {activeView === 'experiments' && (
          <ExperimentsTab
            experiments={experiments}
            onRefresh={load}
            prefillType={prefillExpType}
          />
        )}
        {activeView === 'content' && <ContentView pages={pages} />}
      </div>
    </div>
  );
}
