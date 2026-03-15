'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketingMetricDaily, MarketingExperiment, ExperimentType } from '@/types';
import { OverviewTab } from './OverviewTab';
import { ExperimentsTab } from './ExperimentsTab';
import { InsightsTab } from './InsightsTab';
import { AssetsTab } from './AssetsTab';
import { SourcesTab } from './SourcesTab';

type Tab = 'overview' | 'experiments' | 'insights' | 'assets' | 'sources';

interface SourceStatus { connected: boolean; missing: string[] }
interface SourcesData {
  shopify: SourceStatus;
  meta: SourceStatus;
  google_analytics: SourceStatus;
  clarity: SourceStatus;
}

export function MarketingDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<MarketingMetricDaily[]>([]);
  const [today, setToday] = useState<MarketingMetricDaily | null>(null);
  const [experiments, setExperiments] = useState<MarketingExperiment[]>([]);
  const [sources, setSources] = useState<SourcesData | null>(null);
  const [prefillExpType, setPrefillExpType] = useState<ExperimentType | null>(null);

  const load = useCallback(async () => {
    try {
      const [metricsRes, experimentsRes, sourcesRes] = await Promise.all([
        fetch('/api/marketing/metrics?days=30'),
        fetch('/api/marketing/experiments'),
        fetch('/api/marketing/sources'),
      ]);

      const [metricsData, experimentsData, sourcesData] = await Promise.all([
        metricsRes.json(),
        experimentsRes.json(),
        sourcesRes.json(),
      ]);

      const rows: MarketingMetricDaily[] = metricsData.metrics ?? [];
      setHistory(rows);

      const todayStr = new Date().toISOString().split('T')[0];
      setToday(rows.find(r => r.date === todayStr) ?? null);
      setExperiments(experimentsData.experiments ?? []);
      setSources(sourcesData.sources ?? null);
    } catch (err) {
      console.error('MarketingDashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreateExperiment(type: ExperimentType) {
    setPrefillExpType(type);
    setActiveTab('experiments');
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'experiments', label: `Experiments${experiments.filter(e => e.status === 'running').length > 0 ? ` (${experiments.filter(e => e.status === 'running').length})` : ''}` },
    { key: 'insights', label: 'Insights' },
    { key: 'assets', label: 'Assets' },
    { key: 'sources', label: 'Sources' },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Marketing</h1>
        <p className="text-sm text-gray-400 mt-0.5">All sources in one place — track, diagnose, and act.</p>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-5 overflow-x-auto shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewTab
            today={today}
            history={history}
            onMetricsSaved={load}
          />
        )}
        {activeTab === 'experiments' && (
          <ExperimentsTab
            experiments={experiments}
            onRefresh={load}
            prefillType={prefillExpType}
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab
            today={today}
            onCreateExperiment={handleCreateExperiment}
          />
        )}
        {activeTab === 'assets' && <AssetsTab />}
        {activeTab === 'sources' && (
          <SourcesTab
            sources={sources}
            onMockLoaded={load}
          />
        )}
      </div>
    </div>
  );
}
